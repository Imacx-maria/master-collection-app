import type { AssetUploadProgress } from "@/lib/assets/upload";
import type { MasterCollectionPackage } from "@/lib/package/types";
import type { UploadedWebflowAsset } from "@/lib/webflow/types";

export function AssetProgressPanel({
  packageData,
  uploadProgress,
  uploadedAssets,
}: {
  packageData: MasterCollectionPackage;
  uploadProgress: Record<string, AssetUploadProgress>;
  uploadedAssets: UploadedWebflowAsset[];
}) {
  const summary = summarizeAssetProgress(packageData, uploadProgress, uploadedAssets);

  return (
    <section className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-medium">Images</p>
        <span className="font-mono text-[10px] text-muted-foreground">{summary.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-foreground transition-all" style={{ width: `${summary.percent}%` }} />
      </div>
      <div className="text-muted-foreground">{buildAssetMessage(packageData, uploadProgress, uploadedAssets)}</div>
    </section>
  );
}

export function summarizeAssetProgress(
  packageData: MasterCollectionPackage,
  uploadProgress: Record<string, AssetUploadProgress>,
  uploadedAssets: UploadedWebflowAsset[],
) {
  const total = packageData.assets.length;
  if (total === 0) {
    return { total, completedCount: 0, failedCount: 0, percent: 100 };
  }

  const uploadedKeys = new Set(uploadedAssets.map((asset) => asset.packageAssetKey));
  const failedCount = packageData.assets.filter((asset) => uploadProgress[asset.key]?.status === "failed").length;
  const completedCount = packageData.assets.filter((asset) => uploadedKeys.has(asset.key)).length;
  const percent = Math.round((completedCount / total) * 100);

  return { total, completedCount, failedCount, percent };
}

function buildAssetMessage(
  packageData: MasterCollectionPackage,
  uploadProgress: Record<string, AssetUploadProgress>,
  uploadedAssets: UploadedWebflowAsset[],
): string {
  if (packageData.assets.length === 0) {
    return "No images need importing.";
  }

  const summary = summarizeAssetProgress(packageData, uploadProgress, uploadedAssets);
  const uploadedKeys = new Set(uploadedAssets.map((asset) => asset.packageAssetKey));
  const requiredAssetsReady = packageData.assets.filter((asset) => asset.required).every((asset) => uploadedKeys.has(asset.key));
  if (summary.failedCount > 0) {
    return requiredAssetsReady
      ? `${summary.failedCount} optional image upload failed. Required images are ready in Webflow.`
      : `${summary.failedCount} image upload failed.`;
  }

  if (summary.completedCount === packageData.assets.length) {
    return "All images ready in Webflow.";
  }

  if (summary.completedCount === 0) {
    return `Preparing ${packageData.assets.length} image(s)...`;
  }

  return `Preparing images: ${summary.completedCount}/${packageData.assets.length}`;
}
