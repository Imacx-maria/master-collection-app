import type { SimpleAssetRequirement, SimpleFontRequirement } from "@/lib/package/types";

export interface FlowbridgeMeta {
  lane?: string;
  source?: string;
  name?: string;
  fonts?: SimpleFontRequirement[];
  assets?: SimpleAssetRequirement[];
  warnings?: string[];
  blockedReason?: string;
}

export interface SinglePageConverterPayload {
  kind: "single";
  type: "@webflow/XscpData";
  pageCount: 1;
  name: string;
  warnings: string[];
  xscpData: Record<string, unknown>;
  diagnostics: PayloadDiagnostics;
  flowbridgeMeta?: FlowbridgeMeta;
}

export interface CmsCollectionBinding {
  page: string;
  listSelector: string;
  itemSelector: string;
}

export interface CmsCollectionList {
  slug: string;
  displayName: string;
  bindings: CmsCollectionBinding[];
  fields: unknown[];
  items: unknown[];
  csvImport: { expected: boolean };
}

export interface CmsManifest {
  collectionLists: CmsCollectionList[];
}

export interface ConverterPagePayload {
  index: number;
  sourcePageId?: string;
  path?: string;
  slug?: string;
  name: string;
  fonts: SimpleFontRequirement[];
  assets: SimpleAssetRequirement[];
  warnings: string[];
  xscpData: Record<string, unknown>;
  diagnostics: PayloadDiagnostics;
}

export interface MultiPageConverterPayload {
  kind: "multi";
  type: "flowbridge/app-multipage-payload";
  pageCount: number;
  name: string;
  warnings: string[];
  pages: ConverterPagePayload[];
  cmsManifest?: CmsManifest;
}

export type ConverterPayload = SinglePageConverterPayload | MultiPageConverterPayload;

export interface PayloadDiagnostics {
  payloadAssetsLength: number;
  localImageRefs: string[];
  crashHazards: string[];
  pageIds: string[];
}

export function parseConverterPayloadJson(json: string): ConverterPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Clipboard does not contain valid JSON.");
  }

  return parseConverterPayload(parsed);
}

export function parseConverterPayload(value: unknown): ConverterPayload {
  if (!isRecord(value)) {
    throw new Error("Clipboard JSON is not an object.");
  }

  if (value.type === "@webflow/XscpData") {
    const flowbridgeMeta = parseFlowbridgeMeta(value.flowbridgeMeta);
    return {
      kind: "single",
      type: "@webflow/XscpData",
      pageCount: 1,
      name: sanitizeMasterCollectionDisplayName(flowbridgeMeta?.name ?? "Master Collection page payload", 1),
      warnings: normalizeWarnings(flowbridgeMeta?.warnings),
      xscpData: value,
      diagnostics: buildPayloadDiagnostics(value),
      flowbridgeMeta,
    };
  }

  if (value.type === "flowbridge/app-multipage-payload") {
    const pages = Array.isArray(value.pages) ? value.pages : [];
    if (pages.length === 0) {
      throw new Error("Multi-page converter payload has no pages.");
    }

    const parsedPages = pages.map((page, index): ConverterPagePayload => {
      if (!isRecord(page) || !isRecord(page.xscpData) || page.xscpData.type !== "@webflow/XscpData") {
        throw new Error(`Multi-page payload page ${index + 1} does not contain @webflow/XscpData.`);
      }

      const name = stringOr(page.name, `Page ${index + 1}`);
      const path = optionalString(page.path);
      return {
        index,
        sourcePageId: optionalString(page.sourcePageId),
        path,
        slug: optionalString(page.slug) ?? slugFromPath(path),
        name,
        fonts: normalizeFontRequirements(page.fonts),
        assets: normalizeAssetRequirements(page.assets),
        warnings: normalizeWarnings(page.warnings),
        xscpData: page.xscpData,
        diagnostics: buildPayloadDiagnostics(page.xscpData),
      };
    });

    return {
      kind: "multi",
      type: "flowbridge/app-multipage-payload",
      pageCount: parsedPages.length,
      name: sanitizeMasterCollectionDisplayName(optionalString(value.generatedBy), parsedPages.length),
      warnings: normalizeWarnings(value.warnings),
      pages: parsedPages,
      cmsManifest: parseCmsManifest(value.cmsManifest),
    };
  }

  throw new Error("Clipboard JSON is not a supported Master Collection converter payload.");
}

export function sanitizeMasterCollectionDisplayName(name: string | undefined, pageCount: number): string {
  if (!name || /flowbridge|minimal converter/i.test(name)) {
    return pageCount === 1
      ? "Master Collection page payload"
      : "Master Collection multi-page payload";
  }
  return name;
}

export function buildPayloadDiagnostics(xscpData: unknown): PayloadDiagnostics {
  const payload = isRecord(xscpData) && isRecord(xscpData.payload) ? xscpData.payload : {};
  const payloadAssets = Array.isArray(payload.assets) ? payload.assets : [];
  const localImageRefs = collectLocalImageRefs(payload);
  const crashHazards = collectCrashHazards(payload);
  const pageIds = collectPageIds(payload);

  return {
    payloadAssetsLength: payloadAssets.length,
    localImageRefs,
    crashHazards,
    pageIds,
  };
}

function collectLocalImageRefs(payload: Record<string, unknown>): string[] {
  const refs = new Set<string>();
  walk(payload, (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const urlMatches = trimmed.matchAll(/url\((['"]?)(.*?)\1\)/g);
    for (const match of urlMatches) {
      addLocalRef(refs, match[2]);
    }

    addLocalRef(refs, trimmed);
  });
  return Array.from(refs).sort();
}

function addLocalRef(refs: Set<string>, value: string) {
  const candidate = value.trim().replace(/^['"]|['"]$/g, "");
  if (!candidate) return;
  if (/^(https?:|data:|blob:|#|mailto:|tel:)/i.test(candidate)) return;
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(candidate)) {
    refs.add(candidate);
  }
}

function collectCrashHazards(payload: Record<string, unknown>): string[] {
  const hazards: string[] = [];

  if (Array.isArray(payload.assets) && payload.assets.length > 0) {
    hazards.push("payload.assets[] populated");
  }

  const styles = Array.isArray(payload.styles) ? payload.styles : [];
  for (const style of styles) {
    if (!isRecord(style)) continue;
    if (style.key === "main_pressed" || style.key === "main_focused") {
      hazards.push(`invalid style variant ${String(style.key)}`);
    }
    const styleLess = typeof style.styleLess === "string" ? style.styleLess : "";
    if (/animation-play-state\s*:/i.test(styleLess)) {
      hazards.push("animation-play-state in styleLess");
    }
  }

  return Array.from(new Set(hazards)).sort();
}

function collectPageIds(payload: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  walk(payload, (value, key) => {
    if (typeof value !== "string") return;
    if (key === "pageId" || key === "id" || key === "target") {
      if (value === "__MASTER_COLLECTION_CURRENT_PAGE_ID__" || /^[a-f0-9]{16,}$/i.test(value)) {
        ids.add(value);
      }
    }
  });
  return Array.from(ids).sort();
}

function walk(value: unknown, visit: (value: unknown, key?: string) => void, key?: string) {
  visit(value, key);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  for (const [nextKey, nextValue] of Object.entries(value)) {
    walk(nextValue, visit, nextKey);
  }
}

function normalizeWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseFlowbridgeMeta(value: unknown): FlowbridgeMeta | undefined {
  if (!isRecord(value)) return undefined;
  return {
    lane: optionalString(value.lane),
    source: optionalString(value.source),
    name: optionalString(value.name),
    fonts: Array.isArray(value.fonts) ? (value.fonts as SimpleFontRequirement[]) : undefined,
    assets: Array.isArray(value.assets) ? (value.assets as SimpleAssetRequirement[]) : undefined,
    warnings: normalizeWarnings(value.warnings),
    blockedReason: optionalString(value.blockedReason),
  };
}

function normalizeFontRequirements(value: unknown): SimpleFontRequirement[] {
  return Array.isArray(value) ? (value as SimpleFontRequirement[]) : [];
}

function normalizeAssetRequirements(value: unknown): SimpleAssetRequirement[] {
  return Array.isArray(value) ? (value as SimpleAssetRequirement[]) : [];
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function slugFromPath(path?: string): string | undefined {
  if (!path) return undefined;

  const normalized = path.replace(/^\/+|\/+$/g, "").replace(/\.html$/i, "");
  if (!normalized) return undefined;
  return normalized === "index" ? "home" : normalized;
}

function parseCmsManifest(value: unknown): CmsManifest | undefined {
  if (!isRecord(value)) return undefined;
  const rawLists = Array.isArray(value.collectionLists) ? value.collectionLists : [];
  const collectionLists: CmsCollectionList[] = rawLists
    .filter(isRecord)
    .map((item) => ({
      slug: typeof item.slug === "string" ? item.slug : "",
      displayName: typeof item.displayName === "string" ? item.displayName : "",
      bindings: Array.isArray(item.bindings) ? (item.bindings as CmsCollectionBinding[]) : [],
      fields: Array.isArray(item.fields) ? item.fields : [],
      items: Array.isArray(item.items) ? item.items : [],
      csvImport: isRecord(item.csvImport) ? { expected: Boolean(item.csvImport.expected) } : { expected: false },
    }));
  return { collectionLists };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
