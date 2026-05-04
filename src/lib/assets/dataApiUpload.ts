import type { SimpleAssetRequirement } from "@/lib/package/types";
import { createSiteAssetUpload, listSiteAssets, type WebflowSiteAssetSummary } from "@/lib/cms/webflowApi";
import type { UploadedWebflowAsset } from "@/lib/webflow/types";
import { md5File } from "./md5";

export interface UploadAssetWithDataApiOptions {
  siteId: string;
  token: string;
  asset: SimpleAssetRequirement;
  file: File;
  existingAssets?: WebflowSiteAssetSummary[];
}

export async function uploadAssetWithDataApi({
  siteId,
  token,
  asset,
  file,
  existingAssets,
}: UploadAssetWithDataApiOptions): Promise<UploadedWebflowAsset> {
  const assets = existingAssets ?? await listSiteAssets(siteId, token);
  const existing = findExistingSiteAsset(assets, asset.fileName);
  if (existing) {
    return {
      packageAssetKey: asset.key,
      fileName: asset.fileName,
      assetId: existing.id,
      url: hostedUrlFromSiteAsset(existing),
      mode: "existing",
    };
  }

  const fileHash = await md5File(file);
  const created = await createSiteAssetUpload(siteId, token, asset.fileName, fileHash);
  const uploadUrl = created.uploadUrl;
  const uploadDetails = created.uploadDetails ?? {};

  if (uploadUrl) {
    const form = new FormData();
    Object.entries(uploadDetails).forEach(([key, value]) => {
      form.append(key, value);
    });
    form.append("file", file);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: form,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Upload asset binary failed (HTTP ${uploadResponse.status})`);
    }
  }

  return {
    packageAssetKey: asset.key,
    fileName: asset.fileName,
    assetId: created.id ?? created.assetId,
    url: created.hostedUrl ?? created.url ?? created.cdnUrl,
    mode: "data-api",
  };
}

export function findExistingSiteAsset(assets: WebflowSiteAssetSummary[], fileName: string): WebflowSiteAssetSummary | null {
  const target = assetBasename(fileName);
  if (!target) return null;
  return assets.find((asset) => {
    return [
      asset.originalFileName,
      asset.displayName,
      asset.hostedUrl,
      asset.url,
      asset.cdnUrl,
    ].map(assetBasename).includes(target);
  }) ?? null;
}

function hostedUrlFromSiteAsset(asset: WebflowSiteAssetSummary): string | undefined {
  return asset.hostedUrl ?? asset.url ?? asset.cdnUrl;
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
