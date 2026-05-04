import type { PayloadDiagnostics } from "@/lib/converter/parseConverterPayload";
import type { SimpleAssetRequirement, SimpleFontRequirement } from "@/lib/package/types";

export interface AppInstallPlanPage {
  index: number;
  displayName: string;
  slug?: string;
  path?: string;
  sourcePageId?: string;
  xscpData: Record<string, unknown>;
  fonts: SimpleFontRequirement[];
  assets: SimpleAssetRequirement[];
  diagnostics: PayloadDiagnostics;
  warnings: string[];
}

export interface AppInstallPlan {
  lane: "lane-a" | "lane-b";
  source: "converter";
  displayName: string;
  warnings: string[];
  blockedReason?: string;
  pages: AppInstallPlanPage[];
}
