import type { SimpleFontRequirement } from "@/lib/package/types";

export interface WebflowTargetContext {
  siteId: string;
  siteName: string;
  pageId: string;
  pageName: string;
  mode: "designer" | "preview";
}

export interface FontDetectionResult {
  installed: SimpleFontRequirement[];
  missing: SimpleFontRequirement[];
  checkedFamilies: string[];
  source: "styles-and-variables" | "unavailable";
  message?: string;
}

export interface UploadedWebflowAsset {
  packageAssetKey: string;
  fileName: string;
  assetId?: string;
  url?: string;
  mode: "data-api" | "designer" | "preview" | "existing";
}

export interface WebflowAssetReference {
  id?: string;
  assetId?: string;
  fileName?: string;
  displayName?: string;
  originalFileName?: string;
  url?: string;
  cdnUrl?: string;
  hostedUrl?: string;
}

export interface WebflowPageReference {
  id: string;
  name: string;
  slug?: string;
  path?: string;
  isHomepage?: boolean;
  mode: "designer" | "preview";
}

export interface WebflowAdapter {
  isAvailable(): boolean;
  setExtensionSize(size: "default" | "comfortable" | "large" | { width: number; height: number }): Promise<void>;
  getTargetContext(): Promise<WebflowTargetContext>;
  scanFonts(fonts: SimpleFontRequirement[]): Promise<FontDetectionResult>;
  createAsset(file: File, packageAssetKey: string): Promise<UploadedWebflowAsset>;
  getAllAssets?(): Promise<WebflowAssetReference[]>;
  listPages(): Promise<WebflowPageReference[]>;
  findPage(options: { name: string; slug?: string; path?: string }): Promise<WebflowPageReference | null>;
  createPage(options: { name: string; slug?: string }): Promise<WebflowPageReference>;
  switchPage(page: WebflowPageReference): Promise<WebflowTargetContext>;
}
