import { describe, expect, it } from "vitest";
import { parseConverterPayloadJson } from "@/lib/converter/parseConverterPayload";
import { patchXscpData } from "./patch";
import { collectCrashHazardsFromXscpData } from "./crashHazards";
import { assertWebflowPasteSafe, collectWebflowPasteCrashHazards } from "./webflowCrashAudit";
import type { MasterCollectionPackage } from "@/lib/package/types";

const laneAPayloadJson = JSON.stringify({
  type: "@webflow/XscpData",
  flowbridgeMeta: {
    lane: "lane-a",
    source: "custom-site",
    name: "Audit Fixture",
    warnings: ["Lane A custom-site payload"],
    blockedReason: "Asset staging is incomplete.",
    assets: [
      {
        key: "hero-image",
        fileName: "hero.png",
        url: "https://flowbridge-assets.example.com/hero.png",
        mimeType: "image/png",
        required: true,
        patchTargets: [{ kind: "image-src", path: ["payload", "nodes", 0, "data", "attr", "src"] }],
      },
    ],
  },
  payload: {
    assets: [{ id: "bad-old-asset" }],
    nodes: [
      {
        type: "Image",
        data: {
          attr: {
            src: "https://flowbridge-assets.example.com/hero.png",
          },
        },
      },
    ],
    ix3: {
      interactions: [{ pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__", scope: { value: ["source-page"] } }],
      timelines: [{ pageId: "source-page" }],
    },
    ix2: {
      interactions: [{ interactionTypeId: "PAGE_LOAD_INTERACTION", target: "source-page" }],
      events: [{ eventTypeId: "PAGE_START", target: { appliesTo: "PAGE", id: "source-page" } }],
    },
  },
});

function packageFromParsedPayload(): MasterCollectionPackage {
  const parsed = parseConverterPayloadJson(laneAPayloadJson);
  if (parsed.kind !== "single") {
    throw new Error("Expected a single-page Lane A payload.");
  }

  return {
    schemaVersion: "master-collection-package@1",
    packageId: "audit-fixture",
    name: parsed.flowbridgeMeta?.name ?? parsed.name,
    version: "1.0.0",
    xscpData: parsed.xscpData,
    fonts: parsed.flowbridgeMeta?.fonts ?? [],
    assets: parsed.flowbridgeMeta?.assets ?? [],
    warnings: parsed.warnings.map((message, index) => ({
      code: index === 0 ? "INTERACTIONS_LIMITED" : "CUSTOM_CODE_NOT_SUPPORTED",
      message,
    })),
    blockedReason: parsed.flowbridgeMeta?.blockedReason,
  };
}

describe("webflow crash audit invariants", () => {
  it("keeps the final clipboard payload rooted at @webflow/XscpData and clears payload assets", () => {
    const packageData = packageFromParsedPayload();

    const patched = patchXscpData({
      packageData,
      targetPageId: "page_123",
      uploadedAssets: [
        {
          packageAssetKey: "hero-image",
          fileName: "hero.png",
          assetId: "asset_123",
          url: "https://uploads.webflow.com/hero.png",
          mode: "designer",
        },
      ],
    }) as Record<string, unknown> & { payload: Record<string, unknown> };

    expect(patched.type).toBe("@webflow/XscpData");
    expect(Array.isArray(patched.payload.assets)).toBe(true);
    expect(patched.payload.assets).toEqual([]);
    expect((patched.payload.nodes as Array<any>)[0].data.attr.src).toBe("https://uploads.webflow.com/hero.png");
    expect(((patched.payload.ix3 as any).interactions[0].scope.value)).toEqual(["page_123"]);
    expect(((patched.payload.ix2 as any).interactions[0].target)).toBe("page_123");
    expect(collectCrashHazardsFromXscpData(patched)).toEqual([]);
    expect(collectWebflowPasteCrashHazards(patched)).toEqual([
      "IX3 interaction triggers is not an array: interaction[0]",
      "IX3 timeline actions is not an array: timeline[0]",
    ]);
  });

  it("blocks final clipboard payloads that still contain IX3 shapes Webflow paste may flatMap", () => {
    const payload = {
      type: "@webflow/XscpData",
      payload: {
        assets: [],
        nodes: [],
        styles: [],
        ix3: {
          interactions: [
            { id: "bad-interaction", triggers: undefined },
            { id: "bad-trigger-tuple", triggers: [{ type: "load" }] },
          ],
          timelines: [
            { id: "bad-timeline", actions: undefined },
            { id: "bad-targets", actions: [{ id: "bad-targets", targets: undefined }] },
          ],
          actionLists: {},
          events: {},
        },
      },
    };

    const hazards = collectWebflowPasteCrashHazards(payload);

    expect(hazards).toEqual(
      expect.arrayContaining([
        "IX3 interaction triggers is not an array: bad-interaction",
        "IX3 trigger tuple is not an array: bad-trigger-tuple",
        "IX3 timeline actions is not an array: bad-timeline",
        "IX3 action targets is not an array: bad-targets",
        "IX3 actionLists is not an array",
        "IX3 events is not an array",
      ]),
    );
    expect(() => assertWebflowPasteSafe(payload)).toThrow(/Final Webflow paste payload is blocked/);
  });

  it("blocks final clipboard payloads that still contain the app pageId placeholder", () => {
    expect(() =>
      assertWebflowPasteSafe({
        type: "@webflow/XscpData",
        payload: {
          assets: [],
          nodes: [],
          styles: [],
          ix3: {
            interactions: [
              {
                id: "still-placeholder",
                pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__",
                triggers: [],
              },
            ],
            timelines: [],
          },
        },
      }),
    ).toThrow(/pageId placeholder remains/);
  });

  it("blocks final clipboard payloads that have more than one XscpData root node", () => {
    const payload = {
      type: "@webflow/XscpData",
      payload: {
        assets: [],
        nodes: [
          { _id: "root_a", type: "Block", children: [] },
          { _id: "root_b", type: "HtmlEmbed", children: [] },
        ],
        styles: [],
      },
    };

    expect(collectWebflowPasteCrashHazards(payload)).toContain("payload.nodes has 2 root nodes");
    expect(() => assertWebflowPasteSafe(payload)).toThrow(/payload\.nodes has 2 root nodes/);
  });
});
