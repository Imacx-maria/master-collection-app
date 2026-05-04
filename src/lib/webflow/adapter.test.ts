import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebflowAdapter } from "./adapter";

describe("createWebflowAdapter page creation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds the existing homepage before creating duplicates", async () => {
    const homePage = {
      id: "home-page",
      type: "Page",
      getName: vi.fn().mockResolvedValue("Home"),
      getSlug: vi.fn().mockResolvedValue(""),
      getPublishPath: vi.fn().mockResolvedValue("/"),
      isHomepage: vi.fn().mockResolvedValue(true),
    };

    vi.stubGlobal("webflow", {
      getAllPagesAndFolders: vi.fn().mockResolvedValue([homePage]),
    });

    await expect(createWebflowAdapter().findPage({ name: "Home", path: "/" })).resolves.toMatchObject({
      id: "home-page",
      isHomepage: true,
    });
  });

  it("matches existing pages by slug", async () => {
    const detailPage = {
      id: "detail-page",
      type: "Page",
      getName: vi.fn().mockResolvedValue("Detail Candidatas 2025"),
      getSlug: vi.fn().mockResolvedValue("detail_candidatas-2025"),
      getPublishPath: vi.fn().mockResolvedValue("/detail_candidatas-2025"),
    };

    vi.stubGlobal("webflow", {
      getAllPagesAndFolders: vi.fn().mockResolvedValue([detailPage]),
    });

    await expect(
      createWebflowAdapter().findPage({
        name: "Detail Candidatas 2025",
        slug: "detail_candidatas-2025",
      }),
    ).resolves.toMatchObject({
      id: "detail-page",
      slug: "detail_candidatas-2025",
    });
  });

  it("reports a clear error when Designer cannot create pages", async () => {
    vi.stubGlobal("webflow", {
      createPage: vi.fn(),
      appModes: { canCreatePage: "canCreatePage" },
      canForAppMode: vi.fn().mockResolvedValue({ canCreatePage: false }),
    });

    await expect(createWebflowAdapter().createPage({ name: "About", slug: "about" })).rejects.toThrow(
      /Switch to Design mode/i,
    );
  });

  it("wraps createPage failures with user-facing context", async () => {
    vi.stubGlobal("webflow", {
      createPage: vi.fn().mockRejectedValue(new Error("plan page limit exceeded")),
      canForAppMode: vi.fn().mockResolvedValue({ canCreatePage: true }),
    });

    await expect(createWebflowAdapter().createPage({ name: "About", slug: "about" })).rejects.toThrow(
      /could not create a page.*plan page limit exceeded/i,
    );
  });

  it("reuses an existing Webflow asset by filename before creating a duplicate", async () => {
    const createAsset = vi.fn();
    vi.stubGlobal("webflow", {
      createAsset,
      getAllAssets: vi.fn().mockResolvedValue([
        {
          id: "asset_existing",
          originalFileName: "hero.png",
          hostedUrl: "https://cdn.prod.website-files.com/site/asset_existing_hero.png",
        },
      ]),
    });

    const file = new File(["hero"], "hero.png", { type: "image/png" });
    await expect(createWebflowAdapter().createAsset(file, "hero")).resolves.toEqual({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_existing",
      url: "https://cdn.prod.website-files.com/site/asset_existing_hero.png",
      mode: "existing",
    });
    expect(createAsset).not.toHaveBeenCalled();
  });

  it("falls back to createAsset when no existing asset matches", async () => {
    const createAsset = vi.fn().mockResolvedValue({
      id: "asset_new",
      hostedUrl: "https://cdn.prod.website-files.com/site/asset_new_hero.png",
    });
    vi.stubGlobal("webflow", {
      createAsset,
      getAllAssets: vi.fn().mockResolvedValue([
        { id: "asset_other", originalFileName: "other.png" },
      ]),
    });

    const file = new File(["hero"], "hero.png", { type: "image/png" });
    await expect(createWebflowAdapter().createAsset(file, "hero")).resolves.toMatchObject({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_new",
      url: "https://cdn.prod.website-files.com/site/asset_new_hero.png",
      mode: "designer",
    });
    expect(createAsset).toHaveBeenCalledTimes(1);
  });
});
