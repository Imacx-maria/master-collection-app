import type { MasterCollectionPackage } from "@/lib/package/types";
import type { UploadedWebflowAsset, WebflowAdapter } from "@/lib/webflow/types";

export interface AssetUploadProgress {
  key: string;
  fileName: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  message?: string;
}

export async function uploadPackageAssets(
  packageData: MasterCollectionPackage,
  adapter: WebflowAdapter,
  onProgress?: (progress: AssetUploadProgress) => void,
): Promise<UploadedWebflowAsset[]> {
  const uploadedAssets: UploadedWebflowAsset[] = [];

  for (const asset of packageData.assets) {
    onProgress?.({
      key: asset.key,
      fileName: asset.fileName,
      status: "uploading",
      message: "Fetching package asset",
    });

    try {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const file = new File([blob], asset.fileName, {
        type: asset.mimeType ?? (blob.type || "application/octet-stream"),
      });
      const uploaded = await adapter.createAsset(file, asset.key);
      uploadedAssets.push(uploaded);

      onProgress?.({
        key: asset.key,
        fileName: asset.fileName,
        status: "uploaded",
        message: uploaded.mode === "designer" ? "Uploaded to Webflow Assets" : "Prepared in browser preview",
      });
    } catch (error) {
      onProgress?.({
        key: asset.key,
        fileName: asset.fileName,
        status: "failed",
        message: error instanceof Error ? error.message : "Asset upload failed",
      });

      if (asset.required) {
        throw error;
      }
    }
  }

  return uploadedAssets;
}
