import { describe, expect, it } from "vitest";
import { collectCrashHazardsFromXscpData } from "@/lib/xscp/crashHazards";

describe("collectCrashHazardsFromXscpData", () => {
  it("flags known Webflow paste hazards that the app must block", () => {
    const hazards = collectCrashHazardsFromXscpData({
      type: "@webflow/XscpData",
      payload: {
        assets: [{ id: "bad" }],
        nodes: [
          {
            type: "HtmlEmbed",
            data: {
              html: '<style>@font-face{font-family:test;src:url(test.woff2)}</style><script>Webflow.require("ix2").init({events:{e:{selectorGuids:["x"]}}})</script>',
            },
          },
        ],
        ix3: {
          interactions: [{ pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__" }],
          timelines: [{ pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__" }],
        },
      },
    });

    expect(hazards).toEqual([
      "HtmlEmbed contains @font-face",
      "HtmlEmbed contains inline ix2 init script",
      "HtmlEmbed contains selectorGuids",
      "IX3 page placeholder remains",
      "payload.assets[] populated",
    ]);
  });
});
