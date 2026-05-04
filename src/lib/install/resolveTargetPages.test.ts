import { describe, expect, it, vi } from "vitest";

import type { PayloadDiagnostics } from "@/lib/converter/parseConverterPayload";

import { resolveTargetPages } from "./resolveTargetPages";
import type { AppInstallPlanPage } from "./types";

const emptyDiagnostics: PayloadDiagnostics = {
  payloadAssetsLength: 0,
  localImageRefs: [],
  crashHazards: [],
  pageIds: [],
};

describe("resolveTargetPages", () => {
  it("matches existing pages by slug before creating anything", async () => {
    const adapter = {
      findPage: vi.fn().mockResolvedValue({
        id: "page_home",
        name: "Home",
        slug: "home",
        mode: "designer",
      }),
      createPage: vi.fn(),
    };

    const resolved = await resolveTargetPages([buildPage({ displayName: "Home", slug: "home" })], adapter as any);

    expect(adapter.findPage).toHaveBeenCalledWith({
      name: "Home",
      slug: "home",
      path: undefined,
    });
    expect(resolved[0].action).toBe("existing");
    expect(adapter.createPage).not.toHaveBeenCalled();
  });

  it("creates a missing page and derives a slug when one is not provided", async () => {
    const adapter = {
      findPage: vi.fn().mockResolvedValue(null),
      createPage: vi.fn().mockResolvedValue({
        id: "page_about",
        name: "About Team",
        slug: "about-team",
        mode: "designer",
      }),
    };

    const resolved = await resolveTargetPages([buildPage({ displayName: "About Team" })], adapter as any);

    expect(resolved[0].action).toBe("created");
    expect(adapter.createPage).toHaveBeenCalledWith({
      name: "About Team",
      slug: "about-team",
    });
  });
});

function buildPage(overrides: Partial<AppInstallPlanPage>): AppInstallPlanPage {
  return {
    index: 0,
    displayName: "Page",
    xscpData: {},
    fonts: [],
    assets: [],
    diagnostics: emptyDiagnostics,
    warnings: [],
    ...overrides,
  };
}
