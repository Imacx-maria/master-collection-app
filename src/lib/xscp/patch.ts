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

  return xscpData;
}

function patchAssetTarget(
  xscpData: unknown,
  target: SimpleAssetPatchTarget,
  uploaded: UploadedWebflowAsset,
) {
  const value = getPatchValue(target, uploaded);
  const current = readPath(xscpData, target.path);

  if (typeof current === "string" && target.kind === "background-url") {
    writePath(xscpData, target.path, replaceCssUrl(current, value));
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

function replaceCssUrl(currentValue: string, nextUrl: string): string {
  if (/url\((.*?)\)/.test(currentValue)) {
    return currentValue.replace(/url\((.*?)\)/g, `url(${nextUrl})`);
  }

  return nextUrl;
}

function emptyPayloadAssets(value: unknown) {
  if (!isRecord(value)) return;
  const payload = value.payload;
  if (!isRecord(payload)) return;
  payload.assets = [];
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
