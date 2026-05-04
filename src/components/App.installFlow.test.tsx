import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEBFLOW_SITE_TOKEN_KEY, LEGACY_WEBFLOW_SITE_TOKEN_KEY } from "@/lib/webflow/token";
import { App } from "./App";

const { adapterMocks, cmsMocks, clipboardMocks } = vi.hoisted(() => ({
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
  cmsMocks: {
    listSiteAssets: vi.fn(),
    createSiteAssetUpload: vi.fn(),
  },
  clipboardMocks: {
    copyXscpDataToClipboard: vi.fn(),
  },
}));

vi.mock("@/lib/webflow/adapter", () => ({
  createWebflowAdapter: () => adapterMocks,
}));

vi.mock("@/lib/cms/webflowApi", () => ({
  listSiteAssets: cmsMocks.listSiteAssets,
  createSiteAssetUpload: cmsMocks.createSiteAssetUpload,
}));

vi.mock("@/lib/clipboard/webflowClipboard", () => ({
  copyXscpDataToClipboard: clipboardMocks.copyXscpDataToClipboard,
}));

const laneBOnePagePayload = JSON.stringify({
  type: "flowbridge/app-multipage-payload",
  pageCount: 1,
  generatedBy: "FlowBridge Minimal Converter 4.1",
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
      fonts: [{ family: "Sora", weights: [400, 700], styles: ["normal"], required: true }],
      xscpData: { type: "@webflow/XscpData", payload: { assets: [], nodes: [] } },
      diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
      warnings: [],
    },
  ],
});

const laneBTwoPagePayload = JSON.stringify({
  type: "flowbridge/app-multipage-payload",
  pageCount: 2,
  generatedBy: "FlowBridge multi-page payload",
  warnings: [],
  pages: [
    {
      index: 0,
      name: "Home",
      slug: "home",
      assets: [],
      fonts: [],
      xscpData: { type: "@webflow/XscpData", payload: { assets: [], nodes: [] } },
      diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
      warnings: [],
    },
    {
      index: 1,
      name: "About",
      slug: "about",
      assets: [],
      fonts: [],
      xscpData: { type: "@webflow/XscpData", payload: { assets: [], nodes: [] } },
      diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
      warnings: [],
    },
  ],
});

function laneBWithCmsPayload() {
  return JSON.stringify({
    type: "flowbridge/app-multipage-payload",
    pageCount: 1,
    generatedBy: "FlowBridge Minimal Converter 4.1",
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
        assets: [],
        fonts: [],
        xscpData: { type: "@webflow/XscpData", payload: { assets: [], nodes: [] } },
        diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
        warnings: [],
      },
    ],
  });
}

function laneAPayload(options: {
  assets?: unknown[];
  fonts?: unknown[];
  blockedReason?: string;
} = {}) {
  return JSON.stringify({
    type: "@webflow/XscpData",
    flowbridgeMeta: {
      lane: "lane-a",
      source: "custom-site",
      name: "Custom Landing",
      fonts: options.fonts ?? [],
      assets: options.assets ?? [],
      blockedReason: options.blockedReason,
    },
    payload: { assets: [], nodes: [] },
  });
}

function chooseLaneB() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Lane B/i }));
}

function chooseLaneA() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Lane A/i }));
}

function pasteLaneBPayload(json: string) {
  fireEvent.paste(screen.getByRole("button", { name: /Lane B payload paste target/i }), {
    clipboardData: { getData: () => json },
  });
}

function pasteLaneAPayload(json: string) {
  fireEvent.paste(screen.getByRole("button", { name: /Lane A payload paste target/i }), {
    clipboardData: { getData: () => json },
  });
}

describe("App lane flows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    adapterMocks.findPage.mockImplementation(async ({ name, slug }: { name: string; slug?: string }) => ({
      id: slug === "about" ? "page_about" : "page_home",
      name,
      slug: slug ?? "home",
      mode: "designer",
    }));
    adapterMocks.createPage.mockResolvedValue({ id: "page_created", name: "Created", slug: "created", mode: "designer" });
    adapterMocks.switchPage.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_home",
      pageName: "Home",
      mode: "designer",
    });
    adapterMocks.getTargetContext.mockResolvedValue({
      siteId: "site_123",
      siteName: "Test Site",
      pageId: "page_123",
      pageName: "Landing",
      mode: "designer",
    });
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [{ family: "Sora", weights: [400, 700], styles: ["normal"], required: true }],
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
    adapterMocks.isAvailable.mockReturnValue(true);
    cmsMocks.listSiteAssets.mockResolvedValue([]);
    cmsMocks.createSiteAssetUpload.mockResolvedValue({
      id: "asset_hero",
      hostedUrl: "https://uploads.example.com/hero.png",
    });
    clipboardMocks.copyXscpDataToClipboard.mockResolvedValue({ mode: "application-json" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("asset", { status: 200, headers: { "Content-Type": "image/png" } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows the shared Webflow Site API Token field first in Lane A", () => {
    chooseLaneA();

    const tokenField = screen.getByLabelText(/Webflow Site API Token/i);
    const pasteTarget = screen.getByRole("button", { name: /Lane A payload paste target/i });

    expect(tokenField).toBeInTheDocument();
    expect(tokenField.compareDocumentPosition(pasteTarget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the shared Webflow Site API Token field first in Lane B", () => {
    chooseLaneB();

    const tokenField = screen.getByLabelText(/Webflow Site API Token/i);
    const pasteTarget = screen.getByRole("button", { name: /Lane B payload paste target/i });

    expect(tokenField).toBeInTheDocument();
    expect(tokenField.compareDocumentPosition(pasteTarget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows token instructions from the Webflow access info button", () => {
    chooseLaneB();

    fireEvent.click(screen.getByRole("button", { name: /Webflow token instructions/i }));

    expect(screen.getByText(/Open the target Webflow site/i)).toBeInTheDocument();
    expect(screen.getByText(/assets:read, assets:write, and sites:read/i)).toBeInTheDocument();
  });

  it("migrates the legacy wfApiToken value into the shared token key", () => {
    window.localStorage.setItem(LEGACY_WEBFLOW_SITE_TOKEN_KEY, "legacy-token");

    chooseLaneA();

    expect(screen.getByLabelText<HTMLInputElement>(/Webflow Site API Token/i).value).toBe("legacy-token");
    expect(window.localStorage.getItem(WEBFLOW_SITE_TOKEN_KEY)).toBe("legacy-token");
  });

  it("blocks Lane A asset preparation when the token is missing", async () => {
    chooseLaneA();
    pasteLaneAPayload(laneAPayload({
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
    }));

    fireEvent.click(screen.getByRole("button", { name: /Proceed/i }));

    await waitFor(() => {
      expect(screen.getByText(/Paste a Webflow Site API Token before preparing assets/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Webflow Site API Token/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy to Webflow/i })).toBeNull();
  });

  it("blocks Lane B auto-preparation when the token is missing", async () => {
    chooseLaneB();
    pasteLaneBPayload(laneBOnePagePayload);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Paste a Webflow Site API Token before preparing assets/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Webflow Site API Token/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prepare payload/i })).toBeNull();
  });

  it("auto-prepares a Lane B one-page payload and shows asset progress without a Prepare button", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    chooseLaneB();
    pasteLaneBPayload(laneBOnePagePayload);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(adapterMocks.switchPage).toHaveBeenCalledWith(expect.objectContaining({ id: "page_home", name: "Home" }));
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeEnabled();
    });

    expect(screen.queryByRole("button", { name: /Prepare payload/i })).toBeNull();
    expect(screen.queryByLabelText(/Webflow Site API Token/i)).toBeNull();
    expect(screen.getByText(/All images ready in Webflow/i)).toBeInTheDocument();
    expect(screen.getByText(/Fonts detected/i)).toBeInTheDocument();
    expect(screen.getByText(/Detected Master Collection multi-page payload with 1 page\(s\)\./i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/FlowBridge|FlowBridge Minimal Converter 4\.1/);
  });

  it("shows the asset progress bar during Lane B upload and hides the page resolution card", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    const deferredSourceFetch: { resolve?: () => void } = {};
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://cdn.example.com/hero.png") {
        return new Promise((resolve) => {
          deferredSourceFetch.resolve = () => resolve(new Response("asset", { status: 200, headers: { "Content-Type": "image/png" } }));
        });
      }
      if (url === "https://s3.example.com/upload") {
        return Promise.resolve(new Response("", { status: 200 }));
      }
      return Promise.resolve(new Response("asset", { status: 200, headers: { "Content-Type": "image/png" } }));
    });

    chooseLaneB();
    pasteLaneBPayload(laneBOnePagePayload);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Preparing Home/i)).toBeInTheDocument();
      expect(screen.getByText(/Preparing 1 image\(s\)/i)).toBeInTheDocument();
      expect(screen.getByText("0%")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Master Collection page payload/i)).toBeNull();
    expect(screen.queryByText(/1 page\(s\) ready for install/i)).toBeNull();

    if (!deferredSourceFetch.resolve) throw new Error("Expected Lane B source fetch to be pending.");
    deferredSourceFetch.resolve();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeEnabled();
    });
  });

  it("auto-prepares Lane A after a valid paste and renames the copy action", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    chooseLaneA();
    pasteLaneAPayload(laneAPayload({
      fonts: [{ family: "Sora", weights: [400], styles: ["normal"], required: true }],
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
    }));

    fireEvent.click(screen.getByRole("button", { name: /Proceed/i }));

    await waitFor(() => {
      expect(screen.getByText(/Custom-site payload is ready for Webflow paste/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeEnabled();
    });
    expect(screen.queryByRole("button", { name: /Paste to Webflow/i })).toBeNull();
  });

  it("enables Lane A copy even when required fonts are not detected", async () => {
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [],
      missing: [{ family: "Fixture Sans", weights: [400], styles: ["normal"], required: true }],
      checkedFamilies: ["Fixture Sans"],
      source: "styles-and-variables" as const,
      message: "Some fonts were not detected.",
    });

    chooseLaneA();
    pasteLaneAPayload(laneAPayload({
      fonts: [{ family: "Fixture Sans", weights: [400], styles: ["normal"], required: true }],
    }));

    fireEvent.click(screen.getByRole("button", { name: /Proceed/i }));

    await waitFor(() => {
      expect(screen.getByText(/Font check inconclusive/i)).toBeInTheDocument();
      expect(screen.getByText(/not detected/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeEnabled();
    });
  });

  it("enables Copy to Webflow button even when required fonts are not detected", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    adapterMocks.scanFonts.mockResolvedValue({
      installed: [],
      missing: [{ family: "Fixture Sans", weights: [400], styles: ["normal"], required: true }],
      checkedFamilies: ["Fixture Sans"],
      source: "styles-and-variables" as const,
      message: "Some fonts were not detected.",
    });

    chooseLaneB();

    const payloadWithFonts = JSON.stringify({
      type: "flowbridge/app-multipage-payload",
      pageCount: 1,
      generatedBy: "FlowBridge minimal converter 4.1",
      warnings: [],
      pages: [
        {
          index: 0,
          name: "Home",
          slug: "home",
          assets: [],
          fonts: [{ family: "Fixture Sans", weights: [400], styles: ["normal"], required: true }],
          xscpData: { type: "@webflow/XscpData", payload: { assets: [], nodes: [] } },
          diagnostics: { payloadAssetsLength: 0, localImageRefs: [], crashHazards: [], pageIds: [] },
          warnings: [],
        },
      ],
    });

    pasteLaneBPayload(payloadWithFonts);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).not.toBeDisabled();
    });
  });

  it("shows not-detected font rows, manual info, and re-check without an Install in Webflow button", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    adapterMocks.scanFonts
      .mockResolvedValueOnce({
        installed: [],
        missing: [{ family: "Sora", weights: [400], styles: ["normal"], required: true }],
        checkedFamilies: ["Sora"],
        source: "styles-and-variables",
        message: "Some required fonts were not detected.",
      })
      .mockResolvedValueOnce({
        installed: [{ family: "Sora", weights: [400], styles: ["normal"], required: true }],
        missing: [],
        checkedFamilies: ["Sora"],
        source: "styles-and-variables",
        message: "Required fonts detected.",
      });

    chooseLaneB();
    pasteLaneBPayload(laneBOnePagePayload);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Font check inconclusive/i)).toBeInTheDocument();
      expect(screen.getByText(/Sora - weights 400, 700 - styles normal/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeEnabled();
    });

    expect(screen.queryByRole("button", { name: /Install in Webflow/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Font install instructions/i }));
    expect(screen.getByText(/right typography panel shows these families assigned correctly/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Re-check fonts/i }));

    await waitFor(() => {
      expect(screen.getByText("Fonts detected")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeEnabled();
    });
  });

  it("passes the shared token into CMS and does not render a second token field", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    chooseLaneB();
    pasteLaneBPayload(laneBWithCmsPayload());
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/CMS Import/i)).toBeInTheDocument();
    });

    expect(screen.queryAllByLabelText(/Webflow Site API Token/i)).toHaveLength(0);
  });

  it("copies through the application/json Webflow clipboard path when ready", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    chooseLaneB();
    pasteLaneBPayload(laneBOnePagePayload);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Copy to Webflow/i }));

    await waitFor(() => {
      expect(clipboardMocks.copyXscpDataToClipboard).toHaveBeenCalledWith(expect.objectContaining({
        type: "@webflow/XscpData",
        payload: expect.objectContaining({ assets: [] }),
      }));
      expect(screen.getByText(/Copied to Webflow clipboard/i)).toBeInTheDocument();
    });
  });

  it("keeps CMS absent payloads on the copy step after auto-preparation", async () => {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, "wf-token");
    chooseLaneB();
    pasteLaneBPayload(laneBTwoPagePayload);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copy to Webflow/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/CMS Import/i)).toBeNull();
    expect(screen.getByText(/No required fonts/i)).toBeInTheDocument();
  });
});
