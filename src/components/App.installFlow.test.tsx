import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const { adapterMocks } = vi.hoisted(() => ({
  adapterMocks: {
    findPage: vi.fn(),
    createPage: vi.fn(),
    switchPage: vi.fn(),
    getTargetContext: vi.fn(),
    scanFonts: vi.fn(),
    createAsset: vi.fn(),
    listPages: vi.fn(),
    isAvailable: vi.fn().mockReturnValue(true),
    setExtensionSize: vi.fn(),
  },
}));

vi.mock("@/lib/webflow/adapter", () => ({
  createWebflowAdapter: () => adapterMocks,
}));

// Reusable valid multi-page payload JSON for Lane B paste tests
const VALID_LANE_B_PAYLOAD = JSON.stringify({
  type: "flowbridge/app-multipage-payload",
  pageCount: 2,
  generatedBy: "FlowBridge multi-page payload",
  warnings: [],
  pages: [
    {
      index: 0,
      name: "Home",
      slug: "home",
      assets: [
        {
          key: "hero",
          fileName: "hero.png",
          url: "https://cdn.example.com/hero.png",
          mimeType: "image/png",
          required: true,
          patchTargets: [],
        },
      ],
      fonts: [{ family: "Sora", required: true }],
      xscpData: { type: "@webflow/XscpData", payload: { assets: [] } },
      diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
      warnings: [],
    },
    {
      index: 1,
      name: "About",
      slug: "about",
      xscpData: { type: "@webflow/XscpData", payload: { assets: [] } },
      diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
      warnings: [],
    },
  ],
});

function pasteLaneBPayload(json: string) {
  fireEvent.paste(screen.getByRole("button", { name: /Lane B payload paste target/i }), {
    clipboardData: { getData: () => json },
  });
}

describe("App lane flows", () => {
  beforeEach(() => {
    adapterMocks.findPage
      .mockResolvedValueOnce({ id: "page_home", name: "Home", slug: "home", mode: "designer" })
      .mockResolvedValueOnce({ id: "page_about", name: "About", slug: "about", mode: "designer" });
    adapterMocks.createPage.mockReset();
    adapterMocks.switchPage.mockReset();
    adapterMocks.getTargetContext.mockReset();
    adapterMocks.scanFonts.mockReset();
    adapterMocks.createAsset.mockReset();
    adapterMocks.listPages.mockReset();
    adapterMocks.isAvailable.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("asset", { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows Lane B paste target and no site-token panel", async () => {
    render(<App />);

    expect(screen.queryByText(/Webflow site token/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    // The paste target must be present
    expect(screen.getByRole("button", { name: /Lane B payload paste target/i })).toBeInTheDocument();

    pasteLaneBPayload(VALID_LANE_B_PAYLOAD);

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 page\(s\) ready for install\./i)).toBeInTheDocument();
      expect(screen.getByText(/Home/i)).toBeInTheDocument();
      expect(screen.getByText(/About/i)).toBeInTheDocument();
    });
  });

  it("preserves Lane B staged asset metadata through the prepare path", async () => {
    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    adapterMocks.createAsset.mockResolvedValue({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_hero",
      url: "https://uploads.example.com/hero.png",
      mode: "designer",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));
    pasteLaneBPayload(VALID_LANE_B_PAYLOAD);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 page\(s\) ready for install\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Prepare payload/i })[0]);

    await waitFor(() => {
      expect(adapterMocks.switchPage).toHaveBeenCalledWith(
        expect.objectContaining({ id: "page_home", name: "Home" }),
      );
      expect(adapterMocks.createAsset).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Prepared Home\./i)).toBeInTheDocument();
    });
  });

  // --- New Lane B paste-validate tests (R1 + R5) ---

  it("pasting a valid flowbridge/app-multipage-payload enables Continue and clears pasting-invalid feedback", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    // First paste something invalid to set error state
    pasteLaneBPayload("not a payload");
    expect(screen.getAllByText(/pasting invalid/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Continue/i })).toBeDisabled();

    // Now paste valid — error must clear and Continue must enable
    pasteLaneBPayload(VALID_LANE_B_PAYLOAD);
    expect(screen.queryAllByText(/pasting invalid/i)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Continue/i })).toBeEnabled();
  });

  it("pasting invalid JSON shows pasting-invalid feedback and Continue stays disabled", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    pasteLaneBPayload("not a payload");

    expect(screen.getAllByText(/pasting invalid/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Continue/i })).toBeDisabled();
  });

  it("Lane B flow renders no element matching /load demo/i", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    expect(screen.queryByText(/load demo/i)).toBeNull();
  });

  it("Lane B flow renders no element matching /read converter clipboard/i", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    expect(screen.queryByText(/read converter clipboard/i)).toBeNull();
  });

  // --- End new Lane B paste-validate tests ---

  // --- Lane B font enforcement parity (APP-REG-010 / R2) ---

  it("Lane B: Copy button is enabled after prepare when all required fonts are present", async () => {
    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [{ family: "Sora", weights: [400], styles: ["normal"], required: true }],
      missing: [],
      checkedFamilies: ["Sora"],
      source: "styles-and-variables",
      message: "Required fonts detected.",
    });
    adapterMocks.createAsset.mockResolvedValue({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_hero",
      url: "https://uploads.example.com/hero.png",
      mode: "designer",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));
    pasteLaneBPayload(VALID_LANE_B_PAYLOAD);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 page\(s\) ready for install\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Prepare payload/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Prepared Home\./i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Copy for Webflow/i })).toBeEnabled();
  });

  it("Lane B: Copy button is disabled when a required font is missing, and re-enables after Recheck shows it installed", async () => {
    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    // First scan: required font missing
    adapterMocks.scanFonts.mockResolvedValueOnce({
      installed: [],
      missing: [{ family: "Sora", weights: [400], styles: ["normal"], required: true }],
      checkedFamilies: ["Sora"],
      source: "styles-and-variables",
      message: "Some required fonts were not detected.",
    });
    adapterMocks.createAsset.mockResolvedValue({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_hero",
      url: "https://uploads.example.com/hero.png",
      mode: "designer",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));
    pasteLaneBPayload(VALID_LANE_B_PAYLOAD);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 page\(s\) ready for install\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Prepare payload/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Prepared Home\./i)).toBeInTheDocument();
    });

    // Copy must be disabled — required font is missing
    expect(screen.getByRole("button", { name: /Copy for Webflow/i })).toBeDisabled();

    // Second scan: font now installed
    adapterMocks.scanFonts.mockResolvedValueOnce({
      installed: [{ family: "Sora", weights: [400], styles: ["normal"], required: true }],
      missing: [],
      checkedFamilies: ["Sora"],
      source: "styles-and-variables",
      message: "Required fonts detected.",
    });

    fireEvent.click(screen.getByRole("button", { name: /Recheck/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy for Webflow/i })).toBeEnabled();
    });
  });

  it("Lane B: Copy button stays enabled when only optional fonts are missing (no required fonts in payload)", async () => {
    const payloadWithOptionalFontOnly = JSON.stringify({
      type: "flowbridge/app-multipage-payload",
      pageCount: 1,
      generatedBy: "FlowBridge multi-page payload",
      warnings: [],
      pages: [
        {
          index: 0,
          name: "Home",
          slug: "home",
          assets: [],
          fonts: [{ family: "OptionalFont", required: false }],
          xscpData: { type: "@webflow/XscpData", payload: { assets: [] } },
          diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
          warnings: [],
        },
      ],
    });

    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    // Optional font is missing — required font list is empty so gate should pass
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [],
      missing: [{ family: "OptionalFont", required: false }],
      checkedFamilies: ["OptionalFont"],
      source: "styles-and-variables",
      message: "Some fonts not detected.",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    fireEvent.paste(screen.getByRole("button", { name: /Lane B payload paste target/i }), {
      clipboardData: { getData: () => payloadWithOptionalFontOnly },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 page\(s\) ready for install\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Prepare payload/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Prepared Home\./i)).toBeInTheDocument();
    });

    // Copy must be enabled — no required fonts are missing
    expect(screen.getByRole("button", { name: /Copy for Webflow/i })).toBeEnabled();
  });

  // --- End Lane B font enforcement parity tests ---

  // --- R4B: CMS step conditional on cmsManifest ---

  it("Lane B with cmsManifest containing collectionLists: CMS step renders CmsImportPanel after page plan", async () => {
    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [],
      missing: [],
      checkedFamilies: [],
      source: "styles-and-variables",
      message: "No required fonts.",
    });
    adapterMocks.createAsset.mockResolvedValue({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_hero",
      url: "https://uploads.example.com/hero.png",
      mode: "designer",
    });

    const payloadWithCms = JSON.stringify({
      type: "flowbridge/app-multipage-payload",
      pageCount: 1,
      generatedBy: "FlowBridge multi-page payload",
      warnings: [],
      cmsManifest: {
        collectionLists: [
          {
            slug: "team",
            displayName: "Team",
            bindings: [],
            fields: [],
            items: [],
            csvImport: { expected: true },
          },
        ],
      },
      pages: [
        {
          index: 0,
          name: "Home",
          slug: "home",
          assets: [
            {
              key: "hero",
              fileName: "hero.png",
              url: "https://cdn.example.com/hero.png",
              mimeType: "image/png",
              required: true,
              patchTargets: [],
            },
          ],
          fonts: [],
          xscpData: { type: "@webflow/XscpData", payload: { assets: [] } },
          diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
          warnings: [],
        },
      ],
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    fireEvent.paste(screen.getByRole("button", { name: /Lane B payload paste target/i }), {
      clipboardData: { getData: () => payloadWithCms },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 page\(s\) ready for install\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Prepare payload/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/CMS Import/i)).toBeInTheDocument();
    });

    // The copy step (LaneBCopyStep) must NOT be rendered yet
    expect(screen.queryByRole("button", { name: /Copy for Webflow/i })).toBeNull();
  });

  it("Lane B with cmsManifest absent: after prepare the flow advances directly to the copy step", async () => {
    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [],
      missing: [],
      checkedFamilies: [],
      source: "styles-and-variables",
      message: "No required fonts.",
    });
    adapterMocks.createAsset.mockResolvedValue({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_hero",
      url: "https://uploads.example.com/hero.png",
      mode: "designer",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));
    pasteLaneBPayload(VALID_LANE_B_PAYLOAD);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 page\(s\) ready for install\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Prepare payload/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy for Webflow/i })).toBeInTheDocument();
    });

    // No CMS UI when cmsManifest is absent
    expect(screen.queryByText(/CMS Import/i)).toBeNull();
  });

  it("Lane B with cmsManifest.collectionLists empty: flow skips CMS step silently and goes to copy", async () => {
    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [],
      missing: [],
      checkedFamilies: [],
      source: "styles-and-variables",
      message: "No required fonts.",
    });
    adapterMocks.createAsset.mockResolvedValue({
      packageAssetKey: "hero",
      fileName: "hero.png",
      assetId: "asset_hero",
      url: "https://uploads.example.com/hero.png",
      mode: "designer",
    });

    const payloadWithEmptyCms = JSON.stringify({
      type: "flowbridge/app-multipage-payload",
      pageCount: 1,
      generatedBy: "FlowBridge multi-page payload",
      warnings: [],
      cmsManifest: { collectionLists: [] },
      pages: [
        {
          index: 0,
          name: "Home",
          slug: "home",
          assets: [
            {
              key: "hero",
              fileName: "hero.png",
              url: "https://cdn.example.com/hero.png",
              mimeType: "image/png",
              required: true,
              patchTargets: [],
            },
          ],
          fonts: [],
          xscpData: { type: "@webflow/XscpData", payload: { assets: [] } },
          diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
          warnings: [],
        },
      ],
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));

    fireEvent.paste(screen.getByRole("button", { name: /Lane B payload paste target/i }), {
      clipboardData: { getData: () => payloadWithEmptyCms },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 page\(s\) ready for install\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Prepare payload/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy for Webflow/i })).toBeInTheDocument();
    });

    // No CMS UI when collectionLists is empty
    expect(screen.queryByText(/CMS Import/i)).toBeNull();
  });

  // --- End R4B CMS step tests ---

  it("blocks Lane A copy when required fonts are still missing", async () => {
    adapterMocks.getTargetContext.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_123",
      pageName: "Landing",
      mode: "designer",
    });
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [],
      missing: [
        {
          family: "Sora",
          weights: [400],
          styles: ["normal"],
          required: true,
        },
      ],
      checkedFamilies: [],
      source: "styles-and-variables",
      message: "Some required fonts were not detected in site styles or font variables.",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane A/i }));
    fireEvent.paste(screen.getByRole("button", { name: /Lane A payload paste target/i }), {
      clipboardData: {
        getData: () => JSON.stringify({
          type: "@webflow/XscpData",
          flowbridgeMeta: {
            lane: "lane-a",
            source: "custom-site",
            name: "Custom Landing",
            fonts: [
              {
                family: "Sora",
                weights: [400],
                styles: ["normal"],
                required: true,
              },
            ],
          },
          payload: {
            assets: [],
            nodes: [],
          },
        }),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Proceed/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Paste to Webflow/i })).toBeDisabled();
      expect(screen.getByText(/1 font\(s\) must be installed manually in Webflow\./i)).toBeInTheDocument();
    });
  });

  it("allows Lane A copy when an optional asset upload fails but required assets and fonts are ready", async () => {
    adapterMocks.getTargetContext.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_123",
      pageName: "Landing",
      mode: "designer",
    });
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [
        {
          family: "Sora",
          weights: [400],
          styles: ["normal"],
          required: true,
        },
      ],
      missing: [],
      checkedFamilies: ["Sora"],
      source: "styles-and-variables",
      message: "Required fonts were detected in this site.",
    });
    adapterMocks.createAsset
      .mockResolvedValueOnce({
        packageAssetKey: "hero",
        fileName: "hero.png",
        assetId: "asset_hero",
        url: "https://uploads.example.com/hero.png",
        mode: "designer",
      })
      .mockRejectedValueOnce(new Error("optional upload failed"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Lane A/i }));
    fireEvent.paste(screen.getByRole("button", { name: /Lane A payload paste target/i }), {
      clipboardData: {
        getData: () => JSON.stringify({
          type: "@webflow/XscpData",
          flowbridgeMeta: {
            lane: "lane-a",
            source: "custom-site",
            name: "Custom Landing",
            fonts: [
              {
                family: "Sora",
                weights: [400],
                styles: ["normal"],
                required: true,
              },
            ],
            assets: [
              {
                key: "hero",
                fileName: "hero.png",
                url: "https://cdn.example.com/hero.png",
                mimeType: "image/png",
                required: true,
                patchTargets: [],
              },
              {
                key: "badge",
                fileName: "badge.png",
                url: "https://cdn.example.com/badge.png",
                mimeType: "image/png",
                required: false,
                patchTargets: [],
              },
            ],
          },
          payload: {
            assets: [],
            nodes: [],
          },
        }),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Proceed/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Paste to Webflow/i })).toBeEnabled();
      expect(screen.getByText(/optional image upload failed\. Required images are ready in Webflow\./i)).toBeInTheDocument();
    });
  });
});
