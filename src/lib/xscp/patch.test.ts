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
        interactions: [{ pageId: "__MASTER_COLLECTION_CURRENT_PAGE_ID__" }],
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
    expect(patched.payload.nodes[0].data.img.id).toBe("asset_123");
    expect(patched.payload.nodes[1].data.attr.style).toContain("https://uploads.webflow.com/hero.png");
    expect(patched.payload.ix3.interactions[0].pageId).toBe("page_123");
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
});
