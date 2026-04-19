import type { WebflowAdapter, WebflowTargetContext } from "./types";

type WebflowGlobal = {
  getSiteInfo?: () => Promise<{
    siteId?: string;
    siteName?: string;
    name?: string;
  }>;
  getCurrentPage?: () => Promise<{
    id?: string;
    pageId?: string;
    name?: string;
    title?: string;
  } | null>;
  createAsset?: (file: File) => Promise<{
    id?: string;
    assetId?: string;
    url?: string;
    cdnUrl?: string;
    hostedUrl?: string;
  }>;
};

function getWebflowGlobal(): WebflowGlobal | undefined {
  return (globalThis as unknown as { webflow?: WebflowGlobal }).webflow;
}

export const previewTargetContext: WebflowTargetContext = {
  siteId: "preview-site",
  siteName: "Browser Preview",
  pageId: "preview-page",
  pageName: "Preview Page",
  mode: "preview",
};

export function createWebflowAdapter(): WebflowAdapter {
  return {
    isAvailable() {
      const wf = getWebflowGlobal();
      return Boolean(wf?.getSiteInfo && wf.getCurrentPage && wf.createAsset);
    },

    async getTargetContext() {
      const wf = getWebflowGlobal();
      if (!wf?.getSiteInfo || !wf.getCurrentPage) {
        throw new Error("Open this app inside Webflow Designer to detect the current site and page.");
      }

      const [siteInfo, page] = await Promise.all([wf.getSiteInfo(), wf.getCurrentPage()]);
      const pageId = page?.id ?? page?.pageId;
      const siteId = siteInfo.siteId;

      if (!siteId) {
        throw new Error("Webflow did not return a current site ID.");
      }

      if (!pageId) {
        throw new Error("Open a page in Webflow Designer before installing this package.");
      }

      return {
        siteId,
        siteName: siteInfo.siteName ?? siteInfo.name ?? "Current Webflow site",
        pageId,
        pageName: page?.name ?? page?.title ?? "Current page",
        mode: "designer",
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

      const asset = await wf.createAsset(file);
      return {
        packageAssetKey,
        fileName: file.name,
        assetId: asset.id ?? asset.assetId,
        url: asset.url ?? asset.cdnUrl ?? asset.hostedUrl,
        mode: "designer",
      };
    },
  };
}
