export interface WebflowTargetContext {
  siteId: string;
  siteName: string;
  pageId: string;
  pageName: string;
  mode: "designer" | "preview";
}

export interface UploadedWebflowAsset {
  packageAssetKey: string;
  fileName: string;
  assetId?: string;
  url?: string;
  mode: "designer" | "preview";
}

export interface WebflowAdapter {
  isAvailable(): boolean;
  getTargetContext(): Promise<WebflowTargetContext>;
  createAsset(file: File, packageAssetKey: string): Promise<UploadedWebflowAsset>;
}
