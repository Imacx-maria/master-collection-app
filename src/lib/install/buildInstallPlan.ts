import type {
  ConverterPayload,
  MultiPageConverterPayload,
  SinglePageConverterPayload,
} from "@/lib/converter/parseConverterPayload";

import type { AppInstallPlan, AppInstallPlanPage } from "./types";

export function buildInstallPlan(payload: ConverterPayload): AppInstallPlan {
  if (payload.kind === "single") {
    return buildSinglePageInstallPlan(payload);
  }

  return buildMultiPageInstallPlan(payload);
}

function buildSinglePageInstallPlan(payload: SinglePageConverterPayload): AppInstallPlan {
  const displayName = payload.flowbridgeMeta?.name ?? payload.name;

  return {
    lane: "lane-a",
    source: "converter",
    displayName,
    warnings: payload.warnings,
    blockedReason: payload.flowbridgeMeta?.blockedReason,
    pages: [
      {
        index: 0,
        displayName,
        xscpData: payload.xscpData,
        fonts: payload.flowbridgeMeta?.fonts ?? [],
        assets: payload.flowbridgeMeta?.assets ?? [],
        diagnostics: payload.diagnostics,
        warnings: payload.warnings,
      },
    ],
  };
}

function buildMultiPageInstallPlan(payload: MultiPageConverterPayload): AppInstallPlan {
  return {
    lane: "lane-b",
    source: "converter",
    displayName: payload.name,
    warnings: payload.warnings,
    pages: payload.pages.map((page): AppInstallPlanPage => ({
      index: page.index,
      displayName: page.name,
      slug: page.slug,
      path: page.path,
      sourcePageId: page.sourcePageId,
      xscpData: page.xscpData,
      fonts: page.fonts,
      assets: page.assets,
      diagnostics: page.diagnostics,
      warnings: page.warnings,
    })),
  };
}
