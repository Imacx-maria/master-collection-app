import { uploadPackageAssets, type AssetUploadProgress } from "@/lib/assets/upload";
import type { MasterCollectionPackage } from "@/lib/package/types";
import type { FontDetectionResult, UploadedWebflowAsset, WebflowAdapter, WebflowPageReference, WebflowTargetContext } from "@/lib/webflow/types";
import { prepareInstallPayload } from "./prepareInstallPayload";

export interface PreparePackageForWebflowOptions {
  packageData: MasterCollectionPackage;
  adapter: WebflowAdapter;
  token: string;
  targetPage?: WebflowPageReference;
  onPhase?: (phase: string) => void;
  onAssetProgress?: (progress: AssetUploadProgress) => void;
}

export interface PreparedPackageForWebflow {
  targetContext: WebflowTargetContext;
  fontScan: FontDetectionResult;
  uploadedAssets: UploadedWebflowAsset[];
  patchedXscpData: unknown;
}

export async function preparePackageForWebflow({
  packageData,
  adapter,
  token,
  targetPage,
  onPhase,
  onAssetProgress,
}: PreparePackageForWebflowOptions): Promise<PreparedPackageForWebflow> {
  onPhase?.(targetPage ? `Preparing ${targetPage.name} for Webflow paste...` : "Reading the current Webflow page...");
  const targetContext = targetPage ? await adapter.switchPage(targetPage) : await adapter.getTargetContext();

  onPhase?.(
    packageData.assets.length > 0
      ? `Preparing ${packageData.assets.length} staged asset(s) and checking fonts...`
      : "Checking fonts. No staged assets to upload.",
  );
  const [fontScan, uploadedAssets] = await Promise.all([
    adapter.scanFonts(packageData.fonts),
    uploadPackageAssets({
      packageData,
      adapter,
      siteId: targetContext.siteId,
      siteName: targetContext.siteName,
      token,
      onProgress: onAssetProgress,
    }),
  ]);

  const { patchedXscpData } = prepareInstallPayload({
    packageData,
    targetPageId: targetContext.pageId,
    uploadedAssets,
  });

  return {
    targetContext,
    fontScan,
    uploadedAssets,
    patchedXscpData,
  };
}
