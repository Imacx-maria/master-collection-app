import { describe, expect, it } from "vitest";
import { demoPackage } from "@/mocks/demoPackage";
import { parseMasterCollectionPackage } from "./schema";

describe("parseMasterCollectionPackage", () => {
  it("accepts the DEMO package contract", () => {
    const parsed = parseMasterCollectionPackage(demoPackage);

    expect(parsed.schemaVersion).toBe("master-collection-package@1");
    expect(parsed.packageId).toBe("pkg_demo_001");
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.fonts[0]?.family).toBe("Inter");
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
});
