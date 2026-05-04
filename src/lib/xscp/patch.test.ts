import { describe, expect, it } from "vitest";
import { patchXscpData } from "./patch";
import type { MasterCollectionPackage } from "@/lib/package/types";

const basePackage: MasterCollectionPackage = {
  schemaVersion: "master-collection-package@1",
  packageId: "pkg_test",
  name: "Patch Test",
  version: "1.0.0",
  fonts: [],
  warnings: [],
  xscpData: {
    type: "@webflow/XscpData",
    payload: {
      assets: [{ id: "old-asset" }],
      nodes: [
        {
          type: "Image",
          data: {
            attr: {
              src: "https://cdn.example.com/old.png",
              srcset: "https://cdn.example.com/old.png 1x, https://cdn.example.com/old@2x.png 2x",
            },
            img: {
              id: "old-id",
            },
          },
        },
        {
          type: "Block",
          data: {
            attr: {
              style: "background-image:url(https://cdn.example.com/old-bg.png)",
            },
          },
        },
      ],
      ix3: {
        interactions: [
          {
            pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__",
            scope: {
              type: "PAGE",
              value: ["source-page"],
            },
          },
        ],
        timelines: [{ pageId: "source-page" }],
      },
      ix2: {
        interactions: [
          {
            interactionTypeId: "PAGE_LOAD_INTERACTION",
            target: "source-page",
          },
        ],
        events: [
          {
            eventTypeId: "PAGE_START",
            target: {
              appliesTo: "PAGE",
              id: "source-page",
            },
            targets: [
              {
                appliesTo: "PAGE",
                id: "source-page",
              },
            ],
          },
        ],
      },
    },
  },
  assets: [
    {
      key: "hero",
      fileName: "hero.png",
      url: "https://assets.example.com/hero.png",
      mimeType: "image/png",
      required: true,
      patchTargets: [
        { kind: "image-src", path: ["payload", "nodes", 0, "data", "attr", "src"] },
        { kind: "image-srcset", path: ["payload", "nodes", 0, "data", "attr", "srcset"] },
        { kind: "image-asset-id", path: ["payload", "nodes", 0, "data", "img", "id"] },
        { kind: "background-url", path: ["payload", "nodes", 1, "data", "attr", "style"] },
      ],
    },
  ],
};

describe("patchXscpData", () => {
  it("patches asset targets and keeps payload assets empty", () => {
    const patched = patchXscpData({
      packageData: basePackage,
      targetPageId: "page_123",
      uploadedAssets: [
        {
          packageAssetKey: "hero",
          fileName: "hero.png",
          assetId: "asset_123",
          url: "https://uploads.webflow.com/hero.png",
          mode: "designer",
        },
      ],
    }) as any;

    expect(patched.payload.assets).toEqual([]);
    expect(patched.payload.nodes[0].data.attr.src).toBe("https://uploads.webflow.com/hero.png");
    expect(patched.payload.nodes[0].data.attr.srcset.replace(/,\s+/g, ", ")).toBe(
      "https://uploads.webflow.com/hero.png 1x, https://uploads.webflow.com/hero.png 2x",
    );
    expect(patched.payload.nodes[0].data.img.id).toBe("asset_123");
    expect(patched.payload.nodes[1].data.attr.style).toContain("https://uploads.webflow.com/hero.png");
    expect(patched.payload.ix3.interactions[0].pageId).toBe("page_123");
    expect(patched.payload.ix3.interactions[0].scope.value).toEqual(["page_123"]);
    expect(patched.payload.ix3.timelines[0].pageId).toBe("page_123");
    expect(patched.payload.ix2.interactions[0].target).toBe("page_123");
    expect(patched.payload.ix2.events[0].target.id).toBe("page_123");
    expect(patched.payload.ix2.events[0].targets[0].id).toBe("page_123");
  });

  it("replaces only targeted sourceUrl values in srcset, styleLess, and embed text", () => {
    const stagedUrl = "https://flowbridge-assets.example.com/lane-b/images/hero.png";
    const untouchedUrl = "https://flowbridge-assets.example.com/lane-b/images/other.png";
    const packageData: MasterCollectionPackage = {
      ...basePackage,
      xscpData: {
        type: "@webflow/XscpData",
        payload: {
          assets: [{ id: "old-asset" }],
          nodes: [
            {
              type: "Image",
              data: {
                attr: {
                  src: stagedUrl,
                  srcset: `${stagedUrl} 500w, ${untouchedUrl} 1000w`,
                },
                img: { id: "" },
              },
            },
            {
              type: "HtmlEmbed",
              v: `<img src="${stagedUrl}"><img src="${untouchedUrl}">`,
              data: { embed: { meta: { html: `<source srcset="${stagedUrl} 1x, ${untouchedUrl} 2x">` } } },
            },
          ],
          styles: [
            {
              styleLess: `background-image: url(${stagedUrl}); mask-image: url(${untouchedUrl});`,
              variants: {
                main_hover: {
                  styleLess: `background-image: url("${stagedUrl}"); background: url("${untouchedUrl}");`,
                },
              },
            },
          ],
        },
      },
      assets: [
        {
          key: "hero",
          fileName: "hero.png",
          url: stagedUrl,
          required: true,
          patchTargets: [
            { kind: "image-src", path: ["payload", "nodes", 0, "data", "attr", "src"], sourceUrl: stagedUrl },
            { kind: "image-srcset", path: ["payload", "nodes", 0, "data", "attr", "srcset"], sourceUrl: stagedUrl },
            { kind: "image-asset-id", path: ["payload", "nodes", 0, "data", "img", "id"], sourceUrl: stagedUrl },
            { kind: "text-url", path: ["payload", "nodes", 1, "v"], sourceUrl: stagedUrl },
            { kind: "text-url", path: ["payload", "nodes", 1, "data", "embed", "meta", "html"], sourceUrl: stagedUrl },
            { kind: "background-url", path: ["payload", "styles", 0, "styleLess"], sourceUrl: stagedUrl },
            { kind: "background-url", path: ["payload", "styles", 0, "variants", "main_hover", "styleLess"], sourceUrl: stagedUrl },
          ],
        },
      ],
    };

    const patched = patchXscpData({
      packageData,
      targetPageId: "page_123",
      uploadedAssets: [
        {
          packageAssetKey: "hero",
          fileName: "hero.png",
          assetId: "asset_123",
          url: "https://uploads.webflow.com/hero.png",
          mode: "designer",
        },
      ],
    }) as any;

    expect(JSON.stringify(patched)).toContain("https://uploads.webflow.com/hero.png");
    expect(JSON.stringify(patched)).toContain(untouchedUrl);
    expect(JSON.stringify(patched)).not.toContain(stagedUrl);
    expect(patched.payload.nodes[0].data.img.id).toBe("asset_123");
    expect(patched.payload.assets).toEqual([]);
  });

  it("throws when a required patch target path is missing", () => {
    const brokenPackage: MasterCollectionPackage = {
      ...basePackage,
      assets: [
        {
          ...basePackage.assets[0],
          patchTargets: [{ kind: "image-src", path: ["payload", "nodes", 9, "data", "attr", "src"] }],
        },
      ],
    };

    expect(() =>
      patchXscpData({
        packageData: brokenPackage,
        targetPageId: "page_123",
        uploadedAssets: [
          {
            packageAssetKey: "hero",
            fileName: "hero.png",
            assetId: "asset_123",
            url: "https://uploads.webflow.com/hero.png",
            mode: "designer",
          },
        ],
      }),
    ).toThrow(/patch target/i);
  });

  it("patches residual local image refs by uploaded asset basename before paste safety runs", () => {
    const packageData: MasterCollectionPackage = {
      ...basePackage,
      xscpData: {
        type: "@webflow/XscpData",
        payload: {
          assets: [{ id: "old-asset" }],
          nodes: [
            {
              type: "Image",
              data: {
                attr: {
                  src: "images/Arrow-Small.svg",
                  srcset: "images/Arrow-Small.svg 1x, images/Arrow-Small@2x.svg 2x",
                },
                img: { id: "" },
              },
            },
            {
              type: "HtmlEmbed",
              v: '<img src="images/Arrow-Small.svg">',
              data: { embed: { meta: { html: '<source srcset="images/Arrow-Small.svg 1x">' } } },
            },
          ],
          styles: [
            {
              styleLess: 'background-image: url("images/Arrow-Small.svg");',
              variants: {
                main_hover: {
                  styleLess: "mask-image: url(images/Arrow-Small.svg);",
                },
              },
            },
          ],
        },
      },
      assets: [
        {
          key: "arrow-small",
          fileName: "Arrow-Small.svg",
          url: "https://flowbridge-assets.example.com/lane-b/images/Arrow-Small.svg",
          mimeType: "image/svg+xml",
          required: true,
          patchTargets: [],
        },
        {
          key: "arrow-small-2x",
          fileName: "Arrow-Small@2x.svg",
          url: "https://flowbridge-assets.example.com/lane-b/images/Arrow-Small@2x.svg",
          mimeType: "image/svg+xml",
          required: true,
          patchTargets: [],
        },
      ],
    };

    const patched = patchXscpData({
      packageData,
      targetPageId: "page_123",
      uploadedAssets: [
        {
          packageAssetKey: "arrow-small",
          fileName: "Arrow-Small.svg",
          assetId: "asset_arrow",
          url: "https://uploads.webflow.com/Arrow-Small.svg",
          mode: "data-api",
        },
        {
          packageAssetKey: "arrow-small-2x",
          fileName: "Arrow-Small@2x.svg",
          assetId: "asset_arrow_2x",
          url: "https://uploads.webflow.com/Arrow-Small@2x.svg",
          mode: "data-api",
        },
      ],
    }) as any;

    const text = JSON.stringify(patched);
    expect(text).not.toContain("images/Arrow-Small");
    expect(patched.payload.nodes[0].data.attr.src).toBe("https://uploads.webflow.com/Arrow-Small.svg");
    expect(patched.payload.nodes[0].data.attr.srcset).toBe(
      "https://uploads.webflow.com/Arrow-Small.svg 1x, https://uploads.webflow.com/Arrow-Small@2x.svg 2x",
    );
    expect(patched.payload.nodes[0].data.img.id).toBe("asset_arrow");
    expect(patched.payload.nodes[1].v).toContain("https://uploads.webflow.com/Arrow-Small.svg");
    expect(patched.payload.styles[0].styleLess).toContain("https://uploads.webflow.com/Arrow-Small.svg");
    expect(patched.payload.styles[0].variants.main_hover.styleLess).toContain("https://uploads.webflow.com/Arrow-Small.svg");
    expect(patched.payload.assets).toEqual([]);
  });
});
