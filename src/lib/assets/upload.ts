import type { MasterCollectionPackage } from "@/lib/package/types";
import type { UploadedWebflowAsset, WebflowAdapter } from "@/lib/webflow/types";
import { listSiteAssets, type WebflowSiteAssetSummary } from "@/lib/cms/webflowApi";
import { uploadAssetWithDataApi } from "./dataApiUpload";

export interface AssetUploadProgress {
  key: string;
  fileName: string;
  status:
    | "queued"
    | "fetching-source"
    | "hashing"
    | "checking-existing"
    | "reusing-existing"
    | "creating-webflow-asset"
    | "uploading-binary"
    | "uploaded"
    | "failed";
  completedCount?: number;
  totalCount?: number;
  message?: string;
  mode?: UploadedWebflowAsset["mode"];
}

export interface UploadPackageAssetsOptions {
  packageData: MasterCollectionPackage;
  adapter: WebflowAdapter;
  siteId?: string;
  siteName?: string;
  token?: string;
  onProgress?: (progress: AssetUploadProgress) => void;
}

export async function uploadPackageAssets(
  {
    packageData,
    adapter,
    siteId,
    token,
    onProgress,
  }: UploadPackageAssetsOptions,
): Promise<UploadedWebflowAsset[]> {
  const uploadedAssets: UploadedWebflowAsset[] = [];
  let existingAssets: WebflowSiteAssetSummary[] | undefined;
  const useDataApi = Boolean(siteId && token?.trim());
  const adapterAvailable = typeof adapter.isAvailable === "function" ? adapter.isAvailable() : false;

  if (packageData.assets.length > 0 && !useDataApi && adapterAvailable) {
    throw new Error("Paste a Webflow Site API Token before preparing assets.");
  }

  if (useDataApi) {
    existingAssets = await listSiteAssets(siteId as string, token as string);
  }

  for (const [index, asset] of packageData.assets.entries()) {
    onProgress?.({
      key: asset.key,
      fileName: asset.fileName,
      status: "fetching-source",
      completedCount: uploadedAssets.length,
      totalCount: packageData.assets.length,
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
      if (typeof file.arrayBuffer !== "function" && typeof blob.arrayBuffer === "function") {
        Object.defineProperty(file, "arrayBuffer", { value: () => blob.arrayBuffer() });
      }
      if (typeof file.text !== "function" && typeof blob.text === "function") {
        Object.defineProperty(file, "text", { value: () => blob.text() });
      }

      onProgress?.({
        key: asset.key,
        fileName: asset.fileName,
        status: useDataApi ? "checking-existing" : "creating-webflow-asset",
        completedCount: uploadedAssets.length,
        totalCount: packageData.assets.length,
        message: useDataApi ? "Checking Webflow Assets" : "Preparing Webflow asset",
      });

      const uploaded = useDataApi
        ? await uploadAssetWithDataApi({
          siteId: siteId as string,
          token: token as string,
          asset,
          file,
          existingAssets,
        })
        : await adapter.createAsset(file, asset.key);
      uploadedAssets.push(uploaded);

      onProgress?.({
        key: asset.key,
        fileName: asset.fileName,
        status: "uploaded",
        completedCount: index + 1,
        totalCount: packageData.assets.length,
        mode: uploaded.mode,
        message:
          uploaded.mode === "data-api"
            ? "Uploaded to Webflow Assets"
            : uploaded.mode === "designer"
            ? "Uploaded to Webflow Assets"
            : uploaded.mode === "existing"
              ? "Already exists in Webflow Assets"
              : "Prepared in browser preview",
      });
    } catch (error) {
      onProgress?.({
        key: asset.key,
        fileName: asset.fileName,
        status: "failed",
        completedCount: uploadedAssets.length,
        totalCount: packageData.assets.length,
        message: error instanceof Error ? error.message : "Asset upload failed",
      });

      if (asset.required) {
        throw error;
      }
    }
  }

  return uploadedAssets;
}
