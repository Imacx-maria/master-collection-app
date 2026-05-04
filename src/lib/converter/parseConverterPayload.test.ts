import { describe, expect, it } from "vitest";
import { parseConverterPayloadJson } from "./parseConverterPayload";

const singlePage = {
  type: "@webflow/XscpData",
  payload: {
    assets: [],
    nodes: [
      {
        type: "Image",
        data: {
          attr: {
            src: "images/hero.png",
          },
        },
      },
    ],
    ix3: {
      interactions: [{ pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__" }],
    },
  },
};

const laneASinglePage = {
  type: "@webflow/XscpData",
  flowbridgeMeta: {
    lane: "lane-a",
    source: "custom-site",
    name: "Custom Landing",
    fonts: [
      {
        family: "Sora",
        weights: [400, 700],
        styles: ["normal"],
        required: true,
        installNote: "Install Sora in Webflow before paste.",
      },
    ],
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
    warnings: ["Lane A custom-site payload"],
    blockedReason: "Asset staging is incomplete.",
  },
  payload: {
    assets: [],
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
  },
};

describe("parseConverterPayloadJson", () => {
  it("parses a direct @webflow/XscpData payload", () => {
    const parsed = parseConverterPayloadJson(JSON.stringify(singlePage));

    expect(parsed.kind).toBe("single");
    expect(parsed.pageCount).toBe(1);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.kind === "single" ? parsed.diagnostics.localImageRefs : []).toEqual(["images/hero.png"]);
  });

  it("parses Lane A flowbridge metadata from a single-page payload", () => {
    const parsed = parseConverterPayloadJson(JSON.stringify(laneASinglePage));

    expect(parsed.kind).toBe("single");
    if (parsed.kind !== "single") {
      throw new Error("Expected single payload");
    }

    expect(parsed.name).toBe("Custom Landing");
    expect(parsed.warnings).toEqual(["Lane A custom-site payload"]);
    expect(parsed.flowbridgeMeta?.lane).toBe("lane-a");
    expect(parsed.flowbridgeMeta?.source).toBe("custom-site");
    expect(parsed.flowbridgeMeta?.blockedReason).toBe("Asset staging is incomplete.");
    expect(parsed.flowbridgeMeta?.fonts).toEqual([
      expect.objectContaining({
        family: "Sora",
        weights: [400, 700],
        styles: ["normal"],
        required: true,
      }),
    ]);
    expect(parsed.flowbridgeMeta?.assets).toEqual([
      expect.objectContaining({
        key: "hero-image",
        fileName: "hero.png",
        patchTargets: [{ kind: "image-src", path: ["payload", "nodes", 0, "data", "attr", "src"] }],
      }),
    ]);
  });

  it("parses a Master Collection multi-page app payload", () => {
    const parsed = parseConverterPayloadJson(
      JSON.stringify({
        type: "flowbridge/app-multipage-payload",
        warnings: ["root warning"],
        pages: [
          {
            name: "Home",
            path: "index.html",
            fonts: [{ family: "Sora", required: true }],
            assets: [{ key: "hero", fileName: "hero.png", url: "https://cdn.example.com/hero.png", required: true, patchTargets: [] }],
            warnings: ["page warning"],
            xscpData: singlePage,
          },
          {
            name: "About",
            path: "/about.html/",
            sourcePageId: "source_about",
            xscpData: {
              ...singlePage,
              payload: {
                ...singlePage.payload,
                assets: [{ id: "bad" }],
              },
            },
          },
          {
            name: "Contact",
            slug: "contact-us",
            path: "contact.html",
            xscpData: singlePage,
          },
        ],
      }),
    );

    expect(parsed.kind).toBe("multi");
    expect(parsed.pageCount).toBe(3);
    expect(parsed.warnings).toEqual(["root warning"]);
    expect(parsed.kind === "multi" ? parsed.pages[0].name : "").toBe("Home");
    expect(parsed.kind === "multi" ? parsed.pages[0].slug : "").toBe("home");
    expect(parsed.kind === "multi" ? parsed.pages[0].fonts : []).toEqual([{ family: "Sora", required: true }]);
    expect(parsed.kind === "multi" ? parsed.pages[0].assets : []).toEqual([
      { key: "hero", fileName: "hero.png", url: "https://cdn.example.com/hero.png", required: true, patchTargets: [] },
    ]);
    expect(parsed.kind === "multi" ? parsed.pages[0].warnings : []).toEqual(["page warning"]);
    expect(parsed.kind === "multi" ? parsed.pages[0].diagnostics.pageIds : []).toContain(
      "__MASTER_COLLECTION_CURRENT_PAGE_ID__",
    );
    expect(parsed.kind === "multi" ? parsed.pages[1].slug : "").toBe("about");
    expect(parsed.kind === "multi" ? parsed.pages[1].sourcePageId : "").toBe("source_about");
    expect(parsed.kind === "multi" ? parsed.pages[1].diagnostics.crashHazards : []).toContain(
      "payload.assets[] populated",
    );
    expect(parsed.kind === "multi" ? parsed.pages[2].slug : "").toBe("contact-us");
  });

  it("rejects invalid clipboard JSON", () => {
    expect(() => parseConverterPayloadJson("not json")).toThrow(/valid JSON/i);
  });

  it("rejects unsupported JSON objects", () => {
    expect(() => parseConverterPayloadJson(JSON.stringify({ hello: "world" }))).toThrow(/supported Master Collection/i);
  });
});
