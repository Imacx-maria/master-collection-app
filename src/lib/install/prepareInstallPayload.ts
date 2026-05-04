import type { MasterCollectionPackage } from "@/lib/package/types";
import type { UploadedWebflowAsset } from "@/lib/webflow/types";
import { patchXscpData } from "@/lib/xscp/patch";
import { collectCrashHazardsFromXscpData } from "@/lib/xscp/crashHazards";

export function prepareInstallPayload({
  packageData,
  targetPageId,
  uploadedAssets,
}: {
  packageData: MasterCollectionPackage;
  targetPageId: string;
  uploadedAssets: UploadedWebflowAsset[];
}) {
  const patchedXscpData = patchXscpData({ packageData, targetPageId, uploadedAssets });
  const hazards = collectCrashHazardsFromXscpData(patchedXscpData);

  if (hazards.length > 0) {
    throw new Error(`Unsafe Webflow paste payload: ${hazards.join("; ")}`);
  }

  return { patchedXscpData, hazards };
}
