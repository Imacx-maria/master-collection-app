import type { SimpleFontRequirement } from "@/lib/package/types";
import type { FontDetectionResult, WebflowAdapter, WebflowAssetReference, WebflowPageReference, WebflowTargetContext } from "./types";

type ExtensionSize = "default" | "comfortable" | "large" | { width: number; height: number };

type WebflowPage = {
  id?: string;
  pageId?: string;
  type?: string;
  name?: string;
  title?: string;
  slug?: string;
  getId?: () => Promise<string>;
  getName?: () => Promise<string>;
  getSlug?: () => Promise<string>;
  getPublishPath?: () => Promise<string>;
  isHomepage?: () => Promise<boolean>;
  setName?: (name: string) => Promise<null>;
  setSlug?: (slug: string) => Promise<null>;
};

type WebflowGlobal = {
  setExtensionSize?: (size: ExtensionSize) => Promise<null>;
  getSiteInfo?: () => Promise<{
    siteId?: string;
    siteName?: string;
    name?: string;
  }>;
  getCurrentPage?: () => Promise<WebflowPage | null>;
  getAllPagesAndFolders?: () => Promise<WebflowPage[]>;
  createPage?: () => Promise<WebflowPage>;
  switchPage?: (page: WebflowPage) => Promise<null>;
  appModes?: {
    canCreatePage?: string;
  };
  canForAppMode?: (appModes: string[]) => Promise<Record<string, boolean>>;
  createAsset?: (file: File) => Promise<{
    id?: string;
    assetId?: string;
    url?: string;
    cdnUrl?: string;
    hostedUrl?: string;
    getUrl?: () => Promise<string>;
  }>;
  getAllAssets?: () => Promise<WebflowAssetReference[]>;
  getAllStyles?: () => Promise<
    Array<{
      getName?: () => Promise<string>;
      getProperties?: (options?: unknown) => Promise<Record<string, unknown>>;
    }>
  >;
  getAllVariableCollections?: () => Promise<
    Array<{
      getAllVariables?: () => Promise<
        Array<{
          type?: string;
          get?: () => Promise<unknown>;
        }>
      >;
    }>
  >;
};

function getWebflowGlobal(): WebflowGlobal | undefined {
  return (globalThis as unknown as { webflow?: WebflowGlobal }).webflow;
}

const pageObjectById = new Map<string, WebflowPage>();

export const previewTargetContext: WebflowTargetContext = {
  siteId: "preview-site",
  siteName: "Browser Preview",
  pageId: "preview-page",
  pageName: "Preview Page",
  mode: "preview",
};

const WEIGHT_SUFFIXES = [
  "extra bold",
  "ultra bold",
  "semi bold",
  "demi bold",
  "extrabold",
  "ultrabold",
  "semibold",
  "demibold",
  "extra light",
  "ultra light",
  "extralight",
  "ultralight",
  "thin",
  "hairline",
  "light",
  "regular",
  "normal",
  "book",
  "roman",
  "medium",
  "bold",
  "black",
  "heavy",
  "italic",
  "oblique",
];

function parseFontFamily(value: string): string {
  return value.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function fuzzyFontKey(name: string): string {
  let normalized = name.toLowerCase().trim().replace(/^['"]|['"]$/g, "");

  for (const suffix of WEIGHT_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }

  return normalized.replace(/[\s\-_]/g, "");
}

async function collectStyleFonts(wf: WebflowGlobal, detected: Set<string>) {
  if (!wf.getAllStyles) return;

  const styles = await wf.getAllStyles();
  const batchSize = 5;

  for (let index = 0; index < styles.length; index += batchSize) {
    const batch = styles.slice(index, index + batchSize);
    const fonts = await Promise.all(
      batch.map(async (style) => {
        if (!style.getProperties) return null;

        try {
          const props = await style.getProperties({
            breakpoint: "main",
            pseudo: "noPseudo",
          });
          const rawFont = props["font-family"];

          if (typeof rawFont === "string") {
            return parseFontFamily(rawFont);
          }

          if (rawFont && typeof rawFont === "object" && "get" in rawFont) {
            const resolved = await (rawFont as { get?: () => Promise<unknown> }).get?.();
            return typeof resolved === "string" ? parseFontFamily(resolved) : null;
          }
        } catch {
          return null;
        }

        return null;
      }),
    );

    for (const font of fonts) {
      if (font) detected.add(font);
    }
  }
}

async function collectFontVariables(wf: WebflowGlobal, detected: Set<string>) {
  if (!wf.getAllVariableCollections) return;

  const collections = await wf.getAllVariableCollections();
  for (const collection of collections) {
    if (!collection.getAllVariables) continue;
    const variables = await collection.getAllVariables();
    for (const variable of variables) {
      if (variable.type !== "FontFamily" || !variable.get) continue;

      try {
        const value = await variable.get();
        if (typeof value === "string" && value.trim()) {
          detected.add(parseFontFamily(value));
        }
      } catch {
        // A single unreadable variable should not block installation.
      }
    }
  }
}

function normalizePath(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function normalizeSlug(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed || undefined;
}

function slugFromName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function assetBasename(value?: string): string {
  if (!value) return "";
  const withoutQuery = value.replace(/\\/g, "/").split("?")[0]?.split("#")[0] ?? "";
  let basename = withoutQuery.split("/").pop() ?? "";
  try {
    basename = decodeURIComponent(basename);
  } catch {
    /* keep original */
  }
  return basename.replace(/^[0-9a-f]{24}_/i, "").trim().toLowerCase();
}

function hostedUrlFromAsset(asset: WebflowAssetReference): string | undefined {
  return asset.url ?? asset.cdnUrl ?? asset.hostedUrl;
}

function assetIdFromAsset(asset: WebflowAssetReference): string | undefined {
  return asset.id ?? asset.assetId;
}

function assetNameCandidates(asset: WebflowAssetReference): string[] {
  return [
    asset.fileName,
    asset.displayName,
    asset.originalFileName,
    hostedUrlFromAsset(asset),
  ].map(assetBasename).filter(Boolean);
}

function findExistingAssetByFileName(assets: WebflowAssetReference[], fileName: string): WebflowAssetReference | null {
  const target = assetBasename(fileName);
  if (!target) return null;
  return assets.find((asset) => assetNameCandidates(asset).includes(target)) ?? null;
}

function pageMatches(page: WebflowPageReference, target: { name: string; slug?: string; path?: string }) {
  const targetPath = normalizePath(target.path);
  const targetSlug = normalizeSlug(target.slug ?? (targetPath && targetPath !== "/" ? targetPath : undefined));
  const pagePath = normalizePath(page.path);
  const pageSlug = normalizeSlug(page.slug ?? (pagePath && pagePath !== "/" ? pagePath : undefined));

  if (targetPath === "/" && (page.isHomepage || pagePath === "/" || pageSlug === "home")) return true;
  if (targetSlug && pageSlug === targetSlug) return true;
  if (targetPath && pagePath === targetPath) return true;

  return page.name.trim().toLowerCase() === target.name.trim().toLowerCase();
}

async function normalizePageReference(page: WebflowPage, fallbackName = "Current page"): Promise<WebflowPageReference> {
  const id = page.id ?? page.pageId ?? (page.getId ? await page.getId() : undefined);
  if (!id) {
    throw new Error("Webflow did not return a page ID.");
  }

  const [name, slug, path, isHomepage] = await Promise.all([
    page.getName ? page.getName().catch(() => undefined) : Promise.resolve(undefined),
    page.getSlug ? page.getSlug().catch(() => undefined) : Promise.resolve(undefined),
    page.getPublishPath ? page.getPublishPath().catch(() => undefined) : Promise.resolve(undefined),
    page.isHomepage ? page.isHomepage().catch(() => false) : Promise.resolve(false),
  ]);

  pageObjectById.set(id, page);

  return {
    id,
    name: name ?? page.name ?? page.title ?? fallbackName,
    slug: slug ?? page.slug,
    path: normalizePath(path),
    isHomepage,
    mode: "designer",
  };
}

export function createWebflowAdapter(): WebflowAdapter {
  return {
    isAvailable() {
      const wf = getWebflowGlobal();
      return Boolean(wf?.getSiteInfo && wf.getCurrentPage && wf.createAsset);
    },

    async setExtensionSize(size) {
      const wf = getWebflowGlobal();
      if (!wf?.setExtensionSize) return;
      await wf.setExtensionSize(size);
    },

    async getTargetContext() {
      const wf = getWebflowGlobal();
      if (!wf?.getSiteInfo || !wf.getCurrentPage) {
        throw new Error("Open this app inside Webflow Designer to detect the current site and page.");
      }

      const [siteInfo, page] = await Promise.all([wf.getSiteInfo(), wf.getCurrentPage()]);
      const siteId = siteInfo.siteId;

      if (!siteId) {
        throw new Error("Webflow did not return a current site ID.");
      }

      if (!page) {
        throw new Error("Open a page in Webflow Designer before installing this package.");
      }

      const pageRef = await normalizePageReference(page, "Current page");

      return {
        siteId,
        siteName: siteInfo.siteName ?? siteInfo.name ?? "Current Webflow site",
        pageId: pageRef.id,
        pageName: pageRef.name,
        mode: "designer",
      };
    },

    async scanFonts(fonts: SimpleFontRequirement[]): Promise<FontDetectionResult> {
      const requiredFonts = fonts.filter((font) => font.required);
      if (requiredFonts.length === 0) {
        return {
          installed: [],
          missing: [],
          checkedFamilies: [],
          source: "styles-and-variables",
        };
      }

      const wf = getWebflowGlobal();
      if (!wf?.getAllStyles && !wf?.getAllVariableCollections) {
        return {
          installed: [],
          missing: requiredFonts,
          checkedFamilies: [],
          source: "unavailable",
          message: "Webflow font scanning is unavailable in this environment.",
        };
      }

      const detectedFamilies = new Set<string>();

      try {
        await Promise.all([
          collectStyleFonts(wf, detectedFamilies),
          collectFontVariables(wf, detectedFamilies),
        ]);
      } catch {
        return {
          installed: [],
          missing: requiredFonts,
          checkedFamilies: [],
          source: "unavailable",
          message: "Font scan failed. Install required fonts in Site Settings before pasting.",
        };
      }

      const detectedKeys = new Set(Array.from(detectedFamilies).map(fuzzyFontKey));
      const installed = requiredFonts.filter((font) => detectedKeys.has(fuzzyFontKey(font.family)));
      const missing = requiredFonts.filter((font) => !detectedKeys.has(fuzzyFontKey(font.family)));

      return {
        installed,
        missing,
        checkedFamilies: Array.from(detectedFamilies).sort((a, b) => a.localeCompare(b)),
        source: "styles-and-variables",
        message:
          missing.length > 0
            ? "Some required fonts were not detected in site styles or font variables."
            : "Required fonts were detected in this site.",
      };
    },

    async createAsset(file, packageAssetKey) {
      const wf = getWebflowGlobal();
      if (!wf?.createAsset) {
        return {
          packageAssetKey,
          fileName: file.name,
          assetId: `preview-${packageAssetKey}`,
          url: URL.createObjectURL(file),
          mode: "preview",
        };
      }

      if (wf.getAllAssets) {
        try {
          const existing = findExistingAssetByFileName(await wf.getAllAssets(), file.name);
          if (existing) {
            return {
              packageAssetKey,
              fileName: file.name,
              assetId: assetIdFromAsset(existing),
              url: hostedUrlFromAsset(existing),
              mode: "existing",
            };
          }
        } catch {
          // Fall back to createAsset; asset reuse is an optimization, not a blocker.
        }
      }

      const asset = await wf.createAsset(file);
      const assetUrl = asset.url ?? asset.cdnUrl ?? asset.hostedUrl ?? (asset.getUrl ? await asset.getUrl() : undefined);
      return {
        packageAssetKey,
        fileName: file.name,
        assetId: asset.id ?? asset.assetId,
        url: assetUrl,
        mode: "designer",
      };
    },

    async getAllAssets() {
      const wf = getWebflowGlobal();
      if (!wf?.getAllAssets) return [];
      return wf.getAllAssets();
    },

    async listPages() {
      const wf = getWebflowGlobal();
      if (!wf?.getAllPagesAndFolders) {
        return [previewTargetContext].map((page) => ({
          id: page.pageId,
          name: page.pageName,
          slug: "preview-page",
          path: "/preview-page",
          mode: "preview",
        }));
      }

      const items = await wf.getAllPagesAndFolders();
      const pages = items.filter((item) => item.type === "Page" || item.getSlug || item.getPublishPath);
      return Promise.all(pages.map((page) => normalizePageReference(page, page.name ?? "Webflow page")));
    },

    async findPage(options) {
      const pages = await this.listPages();
      return pages.find((page) => pageMatches(page, options)) ?? null;
    },

    async createPage({ name, slug }) {
      const wf = getWebflowGlobal();
      if (!wf?.createPage) {
        return {
          id: `preview-page-${slug || slugFromName(name)}`,
          name,
          slug,
          mode: "preview",
        };
      }

      const canCreatePageMode = wf.appModes?.canCreatePage ?? "canCreatePage";
      if (wf.canForAppMode) {
        const capabilities = await wf.canForAppMode([canCreatePageMode]);
        if (capabilities[canCreatePageMode] === false) {
          throw new Error("Webflow cannot create pages in the current Designer mode. Switch to Design mode before installing multi-page payloads.");
        }
      }

      let page: WebflowPage;
      try {
        page = await wf.createPage();
      } catch (error) {
        const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
        throw new Error(`Webflow could not create a page.${detail}`);
      }
      if (page.setName) await page.setName(name);
      if (slug && page.setSlug) await page.setSlug(slug);
      return normalizePageReference(page, name);
    },

    async switchPage(page) {
      const wf = getWebflowGlobal();
      if (!wf?.getSiteInfo) {
        return {
          siteId: previewTargetContext.siteId,
          siteName: previewTargetContext.siteName,
          pageId: page.id,
          pageName: page.name,
          mode: "preview",
        };
      }

      const pageObject = pageObjectById.get(page.id);
      if (wf.switchPage && pageObject) {
        await wf.switchPage(pageObject);
      }

      const siteInfo = await wf.getSiteInfo();
      const currentPage = wf.getCurrentPage ? await wf.getCurrentPage() : null;
      const currentPageRef = currentPage ? await normalizePageReference(currentPage, page.name) : page;

      if (!siteInfo.siteId) {
        throw new Error("Webflow did not return a current site ID.");
      }

      return {
        siteId: siteInfo.siteId,
        siteName: siteInfo.siteName ?? siteInfo.name ?? "Current Webflow site",
        pageId: currentPageRef.id,
        pageName: currentPageRef.name,
        mode: currentPageRef.mode,
      };
    },
  };
}
