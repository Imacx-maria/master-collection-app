import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterCollectionPackage } from "@/lib/package/types";
import { uploadPackageAssets } from "./upload";

const cmsMocks = vi.hoisted(() => ({
  listSiteAssets: vi.fn(),
  createSiteAssetUpload: vi.fn(),
}));

vi.mock("@/lib/cms/webflowApi", () => ({
  listSiteAssets: cmsMocks.listSiteAssets,
  createSiteAssetUpload: cmsMocks.createSiteAssetUpload,
}));

const basePackage: MasterCollectionPackage = {
  schemaVersion: "master-collection-package@1",
  packageId: "pkg_asset_test",
  name: "Asset Test",
  version: "1.0.0",
  xscpData: {
    type: "@webflow/XscpData",
    payload: {
      assets: [],
      nodes: [],
    },
  },
  fonts: [],
  warnings: [],
  assets: [
    {
      key: "hero",
      fileName: "hero.png",
      url: "https://flowbridge-assets.example.com/hero.png",
      mimeType: "image/png",
      required: true,
      patchTargets: [],
    },
  ],
};

describe("uploadPackageAssets", () => {
  beforeEach(() => {
    cmsMocks.listSiteAssets.mockResolvedValue([]);
    cmsMocks.createSiteAssetUpload.mockResolvedValue({
      id: "asset_123",
      hostedUrl: "https://uploads.webflow.com/hero.png",
      uploadUrl: "https://s3.example.com/upload",
      uploadDetails: { key: "uploads/hero.png", policy: "policy" },
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://s3.example.com/upload") {
        return Promise.resolve(new Response("", { status: 200 }));
      }
      return Promise.resolve(new Response("asset", { status: 200, headers: { "Content-Type": "image/png" } }));
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("blocks production asset preparation when the Webflow Site API Token is missing", async () => {
    const adapter = {
      isAvailable: vi.fn().mockReturnValue(true),
      createAsset: vi.fn(),
    } as any;

    await expect(uploadPackageAssets({
      packageData: basePackage,
      adapter,
      siteId: "site_123",
    })).rejects.toThrow(/Paste a Webflow Site API Token/i);

    expect(adapter.createAsset).not.toHaveBeenCalled();
  });

  it("keeps Designer API fallback for preview adapters without a site token", async () => {
    const adapter = {
      isAvailable: vi.fn().mockReturnValue(false),
      createAsset: vi.fn().mockResolvedValue({
        packageAssetKey: "hero",
        fileName: "hero.png",
        assetId: "asset_preview",
        url: "https://uploads.webflow.com/hero.png",
        mode: "designer",
      }),
    } as any;

    const uploaded = await uploadPackageAssets({
      packageData: basePackage,
      adapter,
      siteId: "site_123",
    });

    expect(uploaded).toHaveLength(1);
    expect(adapter.createAsset).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing Webflow asset by filename before upload", async () => {
    cmsMocks.listSiteAssets.mockResolvedValue([
      {
        id: "asset_existing",
        originalFileName: "hero.png",
        hostedUrl: "https://uploads.webflow.com/hero.png",
      },
    ]);

    const uploaded = await uploadPackageAssets({
      packageData: basePackage,
      adapter: { isAvailable: vi.fn().mockReturnValue(true), createAsset: vi.fn() } as any,
      siteId: "site_123",
      token: "wf-token",
    });

    expect(uploaded).toEqual([
      expect.objectContaining({
        assetId: "asset_existing",
        mode: "existing",
      }),
    ]);
    expect(cmsMocks.createSiteAssetUpload).not.toHaveBeenCalled();
  });

  it("reuses a duplicate Webflow asset when create returns a duplicate response", async () => {
    cmsMocks.listSiteAssets
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "asset_existing_after_conflict",
          originalFileName: "hero.png",
          hostedUrl: "https://uploads.webflow.com/hero.png",
        },
      ]);
    cmsMocks.createSiteAssetUpload.mockRejectedValue(new Error("Create asset failed (HTTP 409): duplicate asset already exists"));

    const uploaded = await uploadPackageAssets({
      packageData: basePackage,
      adapter: { isAvailable: vi.fn().mockReturnValue(true), createAsset: vi.fn() } as any,
      siteId: "site_123",
      token: "wf-token",
    });

    expect(uploaded).toEqual([
      expect.objectContaining({
        assetId: "asset_existing_after_conflict",
        mode: "existing",
      }),
    ]);
  });

  it("creates a Data API asset with fileName and MD5 fileHash, then uploads the binary", async () => {
    const uploaded = await uploadPackageAssets({
      packageData: {
        ...basePackage,
        assets: [{ ...basePackage.assets[0], fileName: "hero.png", url: "https://cdn.example.com/hero.png" }],
      },
      adapter: { isAvailable: vi.fn().mockReturnValue(true), createAsset: vi.fn() } as any,
      siteId: "site_123",
      token: "wf-token",
    });

    expect(cmsMocks.createSiteAssetUpload).toHaveBeenCalledWith(
      "site_123",
      "wf-token",
      "hero.png",
      "c04e34d445e31a2159c1bfeb882ba212",
    );
    expect(fetch).toHaveBeenCalledWith("https://s3.example.com/upload", expect.objectContaining({
      method: "POST",
      body: expect.any(FormData),
    }));
    expect(uploaded[0]).toEqual(expect.objectContaining({ mode: "data-api", assetId: "asset_123" }));
  });

  it("lets optional asset failures pass after required assets are ready", async () => {
    const packageData: MasterCollectionPackage = {
      ...basePackage,
      assets: [
        { ...basePackage.assets[0], key: "hero", fileName: "hero.png", required: true },
        {
          ...basePackage.assets[0],
          key: "badge",
          fileName: "badge.png",
          url: "https://cdn.example.com/missing-badge.png",
          required: false,
        },
      ],
    };
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://cdn.example.com/missing-badge.png") {
        return Promise.resolve(new Response("missing", { status: 404 }));
      }
      if (url === "https://s3.example.com/upload") {
        return Promise.resolve(new Response("", { status: 200 }));
      }
      return Promise.resolve(new Response("asset", { status: 200, headers: { "Content-Type": "image/png" } }));
    });

    const uploaded = await uploadPackageAssets({
      packageData,
      adapter: { isAvailable: vi.fn().mockReturnValue(true), createAsset: vi.fn() } as any,
      siteId: "site_123",
      token: "wf-token",
    });

    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].packageAssetKey).toBe("hero");
  });
});
