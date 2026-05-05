import { describe, expect, it } from "vitest";
import { prepareInstallPayload } from "./prepareInstallPayload";

describe("prepareInstallPayload", () => {
  it("throws when the patched payload still contains blocking hazards", () => {
    expect(() =>
      prepareInstallPayload({
        packageData: {
          schemaVersion: "master-collection-package@1",
          packageId: "pkg",
          name: "Unsafe",
          version: "1.0.0",
          fonts: [],
          assets: [],
          xscpData: {
            type: "@webflow/XscpData",
            payload: {
              assets: [],
              nodes: [
                { type: "HtmlEmbed", data: { html: '<script>Webflow.require("ix2").init({})</script>' } },
              ],
            },
          },
        },
        targetPageId: "page_123",
        uploadedAssets: [],
      }),
    ).toThrow(/Unsafe Webflow paste payload/i);
  });

  it("throws before copy when the patched payload has more than one root node", () => {
    expect(() =>
      prepareInstallPayload({
        packageData: {
          schemaVersion: "master-collection-package@1",
          packageId: "pkg",
          name: "Multi Root",
          version: "1.0.0",
          fonts: [],
          assets: [],
          xscpData: {
            type: "@webflow/XscpData",
            payload: {
              assets: [],
              nodes: [
                { _id: "root_a", type: "Block", children: [] },
                { _id: "root_b", type: "HtmlEmbed", children: [] },
              ],
            },
          },
        },
        targetPageId: "page_123",
        uploadedAssets: [],
      }),
    ).toThrow(/payload\.nodes has 2 root nodes/i);
  });
});
