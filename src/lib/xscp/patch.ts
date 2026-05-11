import type { MasterCollectionPackage, SimpleAssetPatchTarget } from "@/lib/package/types";
import type { UploadedWebflowAsset } from "@/lib/webflow/types";

export interface PatchXscpDataOptions {
  packageData: MasterCollectionPackage;
  targetPageId: string;
  uploadedAssets: UploadedWebflowAsset[];
}

export function patchXscpData({
  packageData,
  targetPageId,
  uploadedAssets,
}: PatchXscpDataOptions): unknown {
  const xscpData = cloneJsonLike(packageData.xscpData);
  replacePagePlaceholders(xscpData, targetPageId);
  patchWebflowPageIds(xscpData, targetPageId);
  emptyPayloadAssets(xscpData);

  for (const asset of packageData.assets) {
    const uploaded = uploadedAssets.find((candidate) => candidate.packageAssetKey === asset.key);

    if (!uploaded && asset.required) {
      throw new Error(`Required asset "${asset.fileName}" was not uploaded.`);
    }

    if (!uploaded) continue;

    for (const target of asset.patchTargets) {
      patchAssetTarget(xscpData, target, uploaded);
    }
  }

  patchResidualLocalAssetReferences(xscpData, packageData.assets, uploadedAssets);
  removeConverterOnlyPayloadMetadata(xscpData);
  return xscpData;
}

function patchWebflowPageIds(value: unknown, targetPageId: string) {
  if (!isRecord(value) || !isRecord(value.payload)) return;
  const { payload } = value;

  if (isRecord(payload.ix2)) {
    const interactions = Array.isArray(payload.ix2.interactions) ? payload.ix2.interactions : [];
    for (const interaction of interactions) {
      if (!isRecord(interaction)) continue;
      if (interaction.interactionTypeId !== "PAGE_LOAD_INTERACTION") continue;
      if (typeof interaction.target === "string" && interaction.target !== targetPageId) {
        interaction.target = targetPageId;
      }
    }

    const events = Array.isArray(payload.ix2.events) ? payload.ix2.events : [];
    for (const event of events) {
      if (!isRecord(event) || event.eventTypeId !== "PAGE_START") continue;

      if (isRecord(event.target) && event.target.appliesTo === "PAGE" && typeof event.target.id === "string") {
        event.target.id = targetPageId;
      }

      const targets = Array.isArray(event.targets) ? event.targets : [];
      for (const target of targets) {
        if (!isRecord(target) || target.appliesTo !== "PAGE" || typeof target.id !== "string") continue;
        target.id = targetPageId;
      }
    }
  }

  if (isRecord(payload.ix3)) {
    const interactions = Array.isArray(payload.ix3.interactions) ? payload.ix3.interactions : [];
    for (const interaction of interactions) {
      if (!isRecord(interaction)) continue;
      if (typeof interaction.pageId === "string") {
        interaction.pageId = targetPageId;
      }
      if (isRecord(interaction.scope) && Array.isArray(interaction.scope.value)) {
        interaction.scope.value = interaction.scope.value.map((entry) =>
          typeof entry === "string" ? targetPageId : entry,
        );
      }
    }

    const timelines = Array.isArray(payload.ix3.timelines) ? payload.ix3.timelines : [];
    for (const timeline of timelines) {
      if (!isRecord(timeline) || typeof timeline.pageId !== "string") continue;
      timeline.pageId = targetPageId;
    }
  }
}

function patchAssetTarget(
  xscpData: unknown,
  target: SimpleAssetPatchTarget,
  uploaded: UploadedWebflowAsset,
) {
  const value = getPatchValue(target, uploaded);
  const current = readPath(xscpData, target.path);

  if (typeof current === "string" && target.kind === "image-srcset") {
    writePath(xscpData, target.path, replaceSrcsetUrls(current, value, target.sourceUrl));
    return;
  }

  if (typeof current === "string" && target.kind === "background-url") {
    writePath(xscpData, target.path, replaceCssUrl(current, value, target.sourceUrl));
    return;
  }

  if (typeof current === "string" && target.kind === "text-url") {
    writePath(xscpData, target.path, replaceTextUrl(current, value, target.sourceUrl));
    return;
  }

  writePath(xscpData, target.path, value);
}

function getPatchValue(target: SimpleAssetPatchTarget, uploaded: UploadedWebflowAsset): string {
  if (target.kind === "image-asset-id") {
    if (!uploaded.assetId) {
      throw new Error(`Missing uploaded asset ID for patch target "${target.kind}".`);
    }
    return uploaded.assetId;
  }

  if (!uploaded.url) {
    throw new Error(`Missing uploaded asset URL for patch target "${target.kind}".`);
  }
  return uploaded.url;
}

function replaceCssUrl(currentValue: string, nextUrl: string, sourceUrl?: string): string {
  if (sourceUrl) {
    return replaceTextUrl(currentValue, nextUrl, sourceUrl);
  }

  if (/url\((.*?)\)/.test(currentValue)) {
    return currentValue.replace(/url\((.*?)\)/g, `url(${nextUrl})`);
  }

  return nextUrl;
}

function replaceSrcsetUrls(currentValue: string, nextUrl: string, sourceUrl?: string): string {
  const normalizedSource = sourceUrl ? normalizeAssetReference(sourceUrl) : "";
  return currentValue
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return candidate;
      const parts = trimmed.split(/\s+/);
      if (normalizedSource && normalizeAssetReference(parts[0]) !== normalizedSource) {
        return candidate;
      }
      return [nextUrl].concat(parts.slice(1)).join(" ");
    })
    .join(", ");
}

function replaceTextUrl(currentValue: string, nextUrl: string, sourceUrl?: string): string {
  if (!sourceUrl) return nextUrl;
  return currentValue.split(sourceUrl).join(nextUrl);
}

function normalizeAssetReference(value: string): string {
  let normalized = value.trim().replace(/^['"]|['"]$/g, "").split("#")[0]?.split("?")[0] ?? "";
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    /* keep original */
  }
  return normalized.replace(/\\/g, "/");
}

function patchResidualLocalAssetReferences(
  xscpData: unknown,
  packageAssets: MasterCollectionPackage["assets"],
  uploadedAssets: UploadedWebflowAsset[],
) {
  const lookup = buildUploadedAssetLookup(packageAssets, uploadedAssets);
  if (lookup.size === 0 || !isRecord(xscpData) || !isRecord(xscpData.payload)) return;

  const payload = xscpData.payload;
  const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  for (const node of nodes) {
    if (!isRecord(node)) continue;

    if (isRecord(node.data)) {
      if (isRecord(node.data.attr)) {
        patchAttrRecord(node, node.data.attr, lookup);
      }

      if (Array.isArray(node.data.xattr)) {
        for (const attr of node.data.xattr) {
          if (isRecord(attr) && typeof attr.value === "string") {
            attr.value = replaceResidualLocalImageUrls(attr.value, lookup);
          }
        }
      }

      const meta = isRecord(node.data.embed) && isRecord(node.data.embed.meta) ? node.data.embed.meta : null;
      if (meta && typeof meta.html === "string") {
        meta.html = replaceResidualLocalImageUrls(meta.html, lookup);
      }
    }

    if (typeof node.v === "string") {
      node.v = replaceResidualLocalImageUrls(node.v, lookup);
    }
  }

  const styles = Array.isArray(payload.styles) ? payload.styles : [];
  for (const style of styles) {
    if (!isRecord(style)) continue;
    if (typeof style.styleLess === "string") {
      style.styleLess = replaceResidualLocalImageUrls(style.styleLess, lookup);
    }
    const variants = isRecord(style.variants) ? style.variants : {};
    for (const variant of Object.values(variants)) {
      if (isRecord(variant) && typeof variant.styleLess === "string") {
        variant.styleLess = replaceResidualLocalImageUrls(variant.styleLess, lookup);
      }
    }
  }
}

function patchAttrRecord(
  node: Record<string, any>,
  attr: Record<string, any>,
  lookup: Map<string, UploadedWebflowAsset>,
) {
  if (typeof attr.src === "string") {
    const uploaded = uploadedForLocalReference(attr.src, lookup);
    if (uploaded?.url) {
      attr.src = uploaded.url;
      if (isRecord(node.data) && uploaded.assetId) {
        if (isRecord(node.data.img)) {
          node.data.img.id = uploaded.assetId;
        } else {
          node.data.img = { id: uploaded.assetId };
        }
      }
    }
  }

  if (typeof attr.srcset === "string") {
    attr.srcset = replaceResidualSrcsetUrls(attr.srcset, lookup);
  }

  for (const key of Object.keys(attr)) {
    if (key === "src" || key === "srcset") continue;
    if (typeof attr[key] === "string") {
      attr[key] = replaceResidualLocalImageUrls(attr[key], lookup);
    }
  }
}

function buildUploadedAssetLookup(
  packageAssets: MasterCollectionPackage["assets"],
  uploadedAssets: UploadedWebflowAsset[],
) {
  const lookup = new Map<string, UploadedWebflowAsset>();
  for (const packageAsset of packageAssets) {
    const uploaded = uploadedAssets.find((candidate) => candidate.packageAssetKey === packageAsset.key);
    if (!uploaded?.url) continue;

    addLookup(lookup, packageAsset.fileName, uploaded);
    addLookup(lookup, packageAsset.url, uploaded);
    addLookup(lookup, uploaded.fileName, uploaded);
    addLookup(lookup, uploaded.url, uploaded);
  }
  return lookup;
}

function addLookup(lookup: Map<string, UploadedWebflowAsset>, value: string | undefined, uploaded: UploadedWebflowAsset) {
  const key = assetBasename(value);
  if (key && !lookup.has(key)) lookup.set(key, uploaded);
}

function replaceResidualSrcsetUrls(currentValue: string, lookup: Map<string, UploadedWebflowAsset>): string {
  return currentValue
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return candidate;
      const parts = trimmed.split(/\s+/);
      const uploaded = uploadedForLocalReference(parts[0], lookup);
      if (!uploaded?.url) return candidate;
      return [uploaded.url].concat(parts.slice(1)).join(" ");
    })
    .join(", ");
}

function replaceResidualLocalImageUrls(currentValue: string, lookup: Map<string, UploadedWebflowAsset>): string {
  let nextValue = currentValue.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote: string, url: string) => {
    const uploaded = uploadedForLocalReference(url, lookup);
    if (!uploaded?.url) return match;
    return `url(${quote}${uploaded.url}${quote})`;
  });

  nextValue = nextValue.replace(/\b(src|href|srcset)\s*=\s*(['"])([^'"]+)\2/gi, (match, attrName: string, quote: string, url: string) => {
    if (/srcset/i.test(attrName)) {
      return `${attrName}=${quote}${replaceResidualSrcsetUrls(url, lookup)}${quote}`;
    }
    const uploaded = uploadedForLocalReference(url, lookup);
    if (!uploaded?.url) return match;
    return `${attrName}=${quote}${uploaded.url}${quote}`;
  });

  return nextValue.replace(
    /((?:\.{0,2}\/|\/)?[^"'(),\s]+?\.(?:jpe?g|png|gif|webp|avif|ico|svg)(?:\?[^"'(),\s]*)?(?:#[^"'(),\s]*)?)/gi,
    (match) => {
      const uploaded = uploadedForLocalReference(match, lookup);
      return uploaded?.url ?? match;
    },
  );
}

function uploadedForLocalReference(value: string | undefined, lookup: Map<string, UploadedWebflowAsset>) {
  if (!isLocalImageReference(value)) return null;
  return lookup.get(assetBasename(value)) ?? null;
}

function isLocalImageReference(value: string | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const normalized = normalizeAssetReference(value);
  if (!normalized || /^(?:https?:)?\/\//i.test(normalized)) return false;
  if (/^(?:data|blob|mailto|tel):/i.test(normalized)) return false;
  return /\.(?:jpe?g|png|gif|webp|avif|ico|svg)$/i.test(normalized);
}

function assetBasename(value: string | undefined): string {
  const normalized = value ? normalizeAssetReference(value) : "";
  const segments = normalized.split("/").filter(Boolean);
  return (segments[segments.length - 1] ?? "").toLowerCase();
}

function emptyPayloadAssets(value: unknown) {
  if (!isRecord(value)) return;
  const payload = value.payload;
  if (!isRecord(payload)) return;
  payload.assets = [];
}

function removeConverterOnlyPayloadMetadata(value: unknown) {
  if (!isRecord(value)) return;
  const payload = value.payload;
  if (!isRecord(payload)) return;
  delete payload.imageManifest;
}

function replacePagePlaceholders(value: unknown, targetPageId: string): unknown {
  if (typeof value === "string") {
    return value === "__MASTER_COLLECTION_CURRENT_PAGE_ID__" ? targetPageId : value;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = replacePagePlaceholders(value[index], targetPageId);
    }
    return value;
  }

  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      value[key] = replacePagePlaceholders(value[key], targetPageId);
    }
  }

  return value;
}

function readPath(root: unknown, path: Array<string | number>) {
  let current = root;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        throw new Error(`Missing XscpData patch target at "${formatPath(path)}".`);
      }
      current = current[segment];
      continue;
    }

    if (!isRecord(current) || !(segment in current)) {
      throw new Error(`Missing XscpData patch target at "${formatPath(path)}".`);
    }
    current = current[segment];
  }

  return current;
}

function writePath(root: unknown, path: Array<string | number>, value: string) {
  if (path.length === 0) {
    throw new Error("Cannot patch an empty XscpData path.");
  }

  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        throw new Error(`Missing XscpData patch target at "${formatPath(path)}".`);
      }
      current = current[segment];
      continue;
    }

    if (!isRecord(current) || !(segment in current)) {
      throw new Error(`Missing XscpData patch target at "${formatPath(path)}".`);
    }
    current = current[segment];
  }

  const last = path[path.length - 1];
  if (typeof last === "number") {
    if (!Array.isArray(current) || last < 0 || last >= current.length) {
      throw new Error(`Missing XscpData patch target at "${formatPath(path)}".`);
    }
    current[last] = value;
    return;
  }

  if (!isRecord(current) || !(last in current)) {
    throw new Error(`Missing XscpData patch target at "${formatPath(path)}".`);
  }
  current[last] = value;
}

function cloneJsonLike<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatPath(path: Array<string | number>) {
  return path.join(".");
}
