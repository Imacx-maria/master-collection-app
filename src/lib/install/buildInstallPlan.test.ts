import { describe, expect, it } from "vitest";

import { parseConverterPayloadJson } from "@/lib/converter/parseConverterPayload";

import { buildInstallPlan } from "./buildInstallPlan";

describe("buildInstallPlan", () => {
  it("normalizes a Lane A single-page payload into one-page app state", () => {
    const payload = parseConverterPayloadJson(
      JSON.stringify({
        type: "@webflow/XscpData",
        flowbridgeMeta: {
          lane: "lane-a",
          source: "custom-site",
          name: "Custom Landing",
          fonts: [{ family: "Sora", required: true }],
          assets: [{ key: "hero", fileName: "hero.png", url: "https://cdn.example.com/hero.png", required: true, patchTargets: [] }],
          warnings: ["Lane A custom-site payload"],
        },
        payload: { assets: [], nodes: [] },
      }),
    );

    const plan = buildInstallPlan(payload);

    expect(plan.lane).toBe("lane-a");
    expect(plan.displayName).toBe("Custom Landing");
    expect(plan.warnings).toEqual(["Lane A custom-site payload"]);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].displayName).toBe("Custom Landing");
    expect(plan.pages[0].fonts).toEqual([{ family: "Sora", required: true }]);
    expect(plan.pages[0].assets).toEqual([
      { key: "hero", fileName: "hero.png", url: "https://cdn.example.com/hero.png", required: true, patchTargets: [] },
    ]);
    expect(plan.pages[0].warnings).toEqual(["Lane A custom-site payload"]);
  });

  it("normalizes a Master Collection multi-page payload into Lane B app state", () => {
    const payload = parseConverterPayloadJson(
      JSON.stringify({
        type: "flowbridge/app-multipage-payload",
        generatedBy: "FlowBridge",
        pages: [
          {
            name: "Home",
            slug: "home",
            path: "index.html",
            fonts: [{ family: "Sora", required: true }],
            assets: [{ key: "hero", fileName: "hero.png", url: "https://cdn.example.com/hero.png", required: true, patchTargets: [] }],
            xscpData: { type: "@webflow/XscpData", payload: { assets: [], nodes: [] } },
          },
          {
            name: "About",
            slug: "about",
            path: "about.html",
            xscpData: { type: "@webflow/XscpData", payload: { assets: [], nodes: [] } },
          },
        ],
      }),
    );

    const plan = buildInstallPlan(payload);

    expect(plan.lane).toBe("lane-b");
    expect(plan.displayName).toBe("Master Collection multi-page payload");
    expect(plan.pages.map((page) => page.slug)).toEqual(["home", "about"]);
    expect(plan.blockedReason).toBeUndefined();
    expect(plan.pages[0].fonts).toEqual([{ family: "Sora", required: true }]);
    expect(plan.pages[0].assets).toEqual([
      { key: "hero", fileName: "hero.png", url: "https://cdn.example.com/hero.png", required: true, patchTargets: [] },
    ]);
    expect(plan.pages[0].diagnostics).toEqual(
      expect.objectContaining({
        payloadAssetsLength: 0,
      }),
    );
  });
});
