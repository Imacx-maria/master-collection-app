import type { AssetUploadProgress } from "@/lib/assets/upload";
import type { MasterCollectionPackage } from "@/lib/package/types";
import type { UploadedWebflowAsset } from "@/lib/webflow/types";

// Fractional credit per status so the bar moves smoothly through each asset's
// lifecycle instead of jumping from 0% to 100% only when uploadedAssets resolves.
// "queued" and "fetching-source" stay at 0 so existing tests that assert "0%"
// while the source fetch is pending continue to pass.
const STATUS_WEIGHT: Record<AssetUploadProgress["status"], number> = {
  queued: 0,
  "fetching-source": 0,
  hashing: 0.25,
  "checking-existing": 0.25,
  "reusing-existing": 0.5,
  "creating-webflow-asset": 0.5,
  "uploading-binary": 0.75,
  uploaded: 1,
  failed: 0,
};

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
  let failedCount = 0;
  let weightedSum = 0;
  let completedCount = 0;

  for (const asset of packageData.assets) {
    const status = uploadProgress[asset.key]?.status;
    const isAlreadyUploaded = uploadedKeys.has(asset.key) || status === "uploaded" || status === "reusing-existing";
    if (isAlreadyUploaded) {
      completedCount += 1;
      weightedSum += 1;
      continue;
    }
    if (status === "failed") {
      failedCount += 1;
      continue;
    }
    if (status) {
      weightedSum += STATUS_WEIGHT[status] ?? 0;
    }
  }

  const percent = Math.min(100, Math.round((weightedSum / total) * 100));

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
