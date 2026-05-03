import { describe, expect, it } from "vitest";
import type { MasterCollectionPackage } from "./types";
import { parseMasterCollectionPackage } from "./schema";

// Minimal inline fixture replacing the deleted mocks/demoPackage.ts
const fixturePackage: MasterCollectionPackage = {
  schemaVersion: "master-collection-package@1",
  packageId: "pkg_demo_001",
  productId: "demo-product",
  name: "Demo Component",
  version: "1.0.0",
  fonts: [],
  assets: [
    {
      key: "demo-hero",
      fileName: "master-collection-demo.svg",
      url: "data:image/svg+xml;charset=utf-8,<svg/>",
      mimeType: "image/svg+xml",
      required: true,
      patchTargets: [
        { kind: "image-src", path: ["payload", "nodes", 0, "data", "attr", "src"] },
        { kind: "image-asset-id", path: ["payload", "nodes", 0, "data", "img", "id"] },
      ],
    },
  ],
  warnings: [],
  xscpData: {
    type: "@webflow/XscpData",
    payload: { assets: [], nodes: [] },
  },
};

describe("parseMasterCollectionPackage", () => {
  it("accepts the DEMO package contract", () => {
    const parsed = parseMasterCollectionPackage(fixturePackage);

    expect(parsed.schemaVersion).toBe("master-collection-package@1");
    expect(parsed.packageId).toBe("pkg_demo_001");
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.fonts).toEqual([]);
  });

  it("rejects packages without the Master Collection schema version", () => {
    expect(() =>
      parseMasterCollectionPackage({
        packageId: "pkg_bad",
        name: "Bad Package",
        version: "1.0.0",
        xscpData: {},
        fonts: [],
        assets: [],
      }),
    ).toThrow(/schemaVersion/i);
  });

  it("rejects FlowBridge multi-page envelopes in the single-page xscpData field", () => {
    expect(() =>
      parseMasterCollectionPackage({
        ...fixturePackage,
        xscpData: {
          type: "flowbridge/app-multipage-payload",
          pages: [{ xscpData: { type: "@webflow/XscpData" } }],
        },
      }),
    ).toThrow(/multi-page app envelope/i);
  });
});
