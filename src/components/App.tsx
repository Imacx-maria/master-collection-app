import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CmsImportPanel } from "@/components/CmsImportPanel";
import { LaneBClipboardStep } from "@/components/LaneBClipboardStep";
import { LaneBPagePlanStep } from "@/components/LaneBPagePlanStep";
import { WebflowAccessPanel } from "@/components/WebflowAccessPanel";
import { FontStatusPanel } from "@/components/FontStatusPanel";
import { AssetProgressPanel } from "@/components/AssetProgressPanel";
import { PrepastePreflightPanel } from "@/components/PrepastePreflightPanel";
import { isWebflowAuthError } from "@/lib/webflow/errors";
import type { AssetUploadProgress } from "@/lib/assets/upload";
import { copyXscpDataToClipboard } from "@/lib/clipboard/webflowClipboard";
import { parseConverterPayloadJson, type CmsManifest, type MultiPageConverterPayload, type SinglePageConverterPayload } from "@/lib/converter/parseConverterPayload";
import { buildInstallPlan } from "@/lib/install/buildInstallPlan";
import { preparePackageForWebflow } from "@/lib/install/preparePackageForWebflow";
import { resolveTargetPages, type ResolvedTargetPage } from "@/lib/install/resolveTargetPages";
import type { AppInstallPlan, AppInstallPlanPage } from "@/lib/install/types";
import type { MasterCollectionPackage } from "@/lib/package/types";
import { cn } from "@/lib/utils";
import { createWebflowAdapter } from "@/lib/webflow/adapter";
import { persistWebflowSiteToken, readStoredWebflowSiteToken } from "@/lib/webflow/token";
import type { FontDetectionResult, UploadedWebflowAsset, WebflowAdapter, WebflowTargetContext } from "@/lib/webflow/types";
import { assertWebflowPasteSafe } from "@/lib/xscp/webflowCrashAudit";

const APP_VERSION = "0.1.0";
const THEME_KEY = "master-collection-theme";

type Theme = "light" | "dark";
type EntryMode = "chooser" | "template" | "custom";
type TemplateStepId = "paste" | "pages" | "cms" | "copy";
type CustomStepId = "paste" | "prepare" | "done";

const TEMPLATE_STEPS_NO_CMS: Array<{ id: TemplateStepId; label: string }> = [
  { id: "paste", label: "Paste" },
  { id: "pages", label: "Pages" },
  { id: "copy", label: "Copy" },
];

const TEMPLATE_STEPS_WITH_CMS: Array<{ id: TemplateStepId; label: string }> = [
  { id: "paste", label: "Paste" },
  { id: "pages", label: "Pages" },
  { id: "cms", label: "CMS" },
  { id: "copy", label: "Copy" },
];

const CUSTOM_STEPS: Array<{ id: CustomStepId; label: string }> = [
  { id: "paste", label: "Paste" },
  { id: "prepare", label: "Prepare" },
  { id: "done", label: "Done" },
];

function getInitialTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isSinglePageXscpData(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.type === "@webflow/XscpData";
}

function assertSinglePageXscpData(value: unknown): asserts value is Record<string, unknown> {
  if (!isSinglePageXscpData(value)) {
    throw new Error("Final clipboard payload must be one @webflow/XscpData page payload.");
  }
}

export function App() {
  const adapter = useMemo(() => createWebflowAdapter(), []);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [entryMode, setEntryMode] = useState<EntryMode>("chooser");

  useEffect(() => {
    adapter.setExtensionSize?.({ width: 750, height: 900 })?.catch(() => {
      // Not available outside Webflow Designer — ignore
    });
  }, [adapter]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Master Collection</div>
          <div className="text-[10px] text-muted-foreground">Webflow Installer v{APP_VERSION}</div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </header>

      <main className="mt-4 space-y-3">
        {entryMode === "chooser" ? <EntryModeStep onChoose={setEntryMode} /> : null}
        {entryMode === "template" ? <TemplateInstallFlow adapter={adapter} onBackToChooser={() => setEntryMode("chooser")} /> : null}
        {entryMode === "custom" ? <CustomSiteInstallFlow adapter={adapter} onBackToChooser={() => setEntryMode("chooser")} /> : null}
      </main>
    </div>
  );
}

function TemplateInstallFlow({
  adapter,
  onBackToChooser,
}: {
  adapter: WebflowAdapter;
  onBackToChooser: () => void;
}) {
  const [step, setStep] = useState<TemplateStepId>("paste");
  const [webflowToken, setWebflowToken] = useState(readStoredWebflowSiteToken);
  const [laneBPlan, setLaneBPlan] = useState<AppInstallPlan | null>(null);
  const [laneBCmsManifest, setLaneBCmsManifest] = useState<CmsManifest | null>(null);
  const [resolvedLaneBPages, setResolvedLaneBPages] = useState<ResolvedTargetPage[]>([]);
  const [preparedLaneBPage, setPreparedLaneBPage] = useState<ResolvedTargetPage | null>(null);
  const [laneBPackageData, setLaneBPackageData] = useState<MasterCollectionPackage | null>(null);
  const [laneBTargetContext, setLaneBTargetContext] = useState<WebflowTargetContext | null>(null);
  const [fontScan, setFontScan] = useState<FontDetectionResult | null>(null);
  const [fontChecking, setFontChecking] = useState(false);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedWebflowAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, AssetUploadProgress>>({});
  const [patchedXscpData, setPatchedXscpData] = useState<unknown | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number | null>(null);
  const [pageStatuses, setPageStatuses] = useState<Record<number, string>>({});
  const [existingStyleCount, setExistingStyleCount] = useState<number | null>(null);
  const [fontsConfirmed, setFontsConfirmed] = useState(false);
  const [pageStateConfirmed, setPageStateConfirmed] = useState(false);
  const [hasCopiedToWebflow, setHasCopiedToWebflow] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAction(action: () => Promise<void>) {
    action().catch((caught) => {
      setStatus(null);
      setError(formatErrorMessage(caught));
    });
  }

  function handleTokenChange(token: string) {
    setWebflowToken(token);
    persistWebflowSiteToken(token);
  }

  async function handleDetectedLaneBPayload(payload: MultiPageConverterPayload) {
    setError(null);
    const plan = buildInstallPlan(payload);
    const resolvedPages = await resolveTargetPages(plan.pages, adapter);
    setLaneBPlan(plan);
    setLaneBCmsManifest(payload.cmsManifest ?? null);
    setResolvedLaneBPages(resolvedPages);
    setPreparedLaneBPage(null);
    setLaneBPackageData(null);
    setLaneBTargetContext(null);
    setFontScan(null);
    setFontChecking(false);
    setUploadedAssets([]);
    setUploadProgress({});
    setPatchedXscpData(null);
    setActivePageIndex(null);
    setPageStatuses(Object.fromEntries(resolvedPages.map((page) => [page.source.index, "Queued"])));
    setFontsConfirmed(false);
    setPageStateConfirmed(false);
    setHasCopiedToWebflow(false);
    setExistingStyleCount(null);
    setStatus(`Detected Master Collection multi-page payload with ${payload.pageCount} page(s).`);
    if (resolvedPages[0]) {
      const firstPackage = packageFromInstallPlanPage(resolvedPages[0].source);
      if (firstPackage.assets.length > 0 && !webflowToken.trim()) {
        setError("Paste a Webflow Site API Token before preparing assets.");
        setStep("paste");
        return;
      }
    }
    setStep("pages");
    if (resolvedPages[0]) {
      await handlePrepareLaneBPage(resolvedPages[0].source.index, plan, resolvedPages, payload.cmsManifest ?? null);
    }
  }

  async function handlePrepareLaneBPage(
    index: number,
    _activePlan: AppInstallPlan | null = laneBPlan,
    activeResolvedPages: ResolvedTargetPage[] = resolvedLaneBPages,
    activeCmsManifest: CmsManifest | null = laneBCmsManifest,
  ) {
    const resolved = activeResolvedPages.find((page) => page.source.index === index);
    if (!resolved) {
      throw new Error("Resolved Lane B page not found.");
    }

    const packageData = packageFromInstallPlanPage(resolved.source);
    if (packageData.assets.length > 0 && !webflowToken.trim()) {
      setError("Paste a Webflow Site API Token before preparing assets.");
      setActivePageIndex(null);
      setLaneBPackageData(null);
      setPreparedLaneBPage(null);
      setPageStatuses((current) => ({ ...current, [index]: "Token needed" }));
      setStep("paste");
      return;
    }

    setError(null);
    setActivePageIndex(index);
    setLaneBPackageData(packageData);
    setPreparedLaneBPage(resolved);
    setPageStatuses((current) => ({ ...current, [index]: "Preparing" }));
    setFontScan(null);
    setFontChecking(true);
    setUploadedAssets([]);
    setUploadProgress({});
    setPatchedXscpData(null);
    setStatus(`Preparing ${resolved.source.displayName} for Webflow paste...`);

    const prepared = await preparePackageForWebflow({
      packageData,
      adapter,
      token: webflowToken.trim(),
      targetPage: resolved.target,
      onPhase: setStatus,
      onAssetProgress: (progress) => {
        setPageStatuses((current) => ({ ...current, [index]: progress.status === "uploaded" ? "Assets uploading" : "Preparing" }));
        setUploadProgress((current) => ({
          ...current,
          [progress.key]: progress,
        }));
      },
    });

    setLaneBTargetContext(prepared.targetContext);
    setFontScan(prepared.fontScan);
    setFontChecking(false);
    setUploadedAssets(prepared.uploadedAssets);
    setPatchedXscpData(prepared.patchedXscpData);
    try {
      const styleCount = await adapter.countExistingStyles();
      setExistingStyleCount(styleCount);
    } catch {
      setExistingStyleCount(null);
    }
    setPageStatuses((current) => ({
      ...current,
      [index]: areRequiredFontsReady(packageData, prepared.fontScan) ? "Ready to copy" : "Fonts needed",
    }));
    const pageCount = _activePlan?.pages.length ?? laneBPlan?.pages.length ?? activeResolvedPages.length;
    setStatus(`Detected Master Collection multi-page payload with ${pageCount} page(s). Prepared ${resolved.source.displayName}. Copy the payload for the current Webflow page.`);
    const hasCms = (activeCmsManifest?.collectionLists.length ?? 0) > 0;
    setStep(hasCms ? "cms" : "copy");
  }

  async function handleRecheckLaneBFonts() {
    if (!laneBPackageData) return;
    setStatus("Rechecking fonts...");
    setFontChecking(true);
    const nextFontScan = await adapter.scanFonts(laneBPackageData.fonts);
    setFontScan(nextFontScan);
    setFontChecking(false);
    if (activePageIndex !== null) {
      setPageStatuses((current) => ({
        ...current,
        [activePageIndex]: areRequiredFontsReady(laneBPackageData, nextFontScan) ? "Ready to copy" : "Fonts needed",
      }));
    }
    setStatus(nextFontScan.message ?? "Font check complete.");
  }

  async function handleCopy() {
    if (!patchedXscpData) return;
    assertSinglePageXscpData(patchedXscpData);
    assertWebflowPasteSafe(patchedXscpData);
    setError(null);
    setStatus("Copying package payload...");
    const copyResult = await copyXscpDataToClipboard(patchedXscpData);
    if (activePageIndex !== null) {
      setPageStatuses((current) => ({ ...current, [activePageIndex]: "Copied" }));
    }
    setHasCopiedToWebflow(true);
    setStatus(
      copyResult.mode === "text-only"
        ? "Copied as text fallback. Webflow may reject this paste; use a browser/session that supports application/json clipboard data."
        : "Copied to Webflow clipboard. Click the Webflow canvas and paste, then click Re-check fonts to confirm.",
    );
  }

  function handleRestart() {
    setStep("paste");
    setLaneBPlan(null);
    setLaneBCmsManifest(null);
    setResolvedLaneBPages([]);
    setPreparedLaneBPage(null);
    setLaneBPackageData(null);
    setLaneBTargetContext(null);
    setFontScan(null);
    setFontChecking(false);
    setUploadedAssets([]);
    setUploadProgress({});
    setPatchedXscpData(null);
    setActivePageIndex(null);
    setPageStatuses({});
    setExistingStyleCount(null);
    setFontsConfirmed(false);
    setPageStateConfirmed(false);
    setHasCopiedToWebflow(false);
    setStatus(null);
    setError(null);
  }

  const hasCms = (laneBCmsManifest?.collectionLists.length ?? 0) > 0;
  const templateSteps = hasCms ? TEMPLATE_STEPS_WITH_CMS : TEMPLATE_STEPS_NO_CMS;
  const activeStepIndex = templateSteps.findIndex((item) => item.id === step);
  const requiredFontsCount = (laneBPackageData?.fonts ?? []).filter((font) => font.required).length;
  const fontsAcknowledged = requiredFontsCount === 0 || fontsConfirmed;
  const preflightConfirmed = fontsAcknowledged && pageStateConfirmed;
  const canCopy = Boolean(isSinglePageXscpData(patchedXscpData)) && preflightConfirmed;
  const copyBlockReason = canCopy
    ? null
    : describeTemplateCopyBlocker({
      packageData: laneBPackageData,
      fontScan,
      patchedXscpData,
      preflightConfirmed,
    });
  const isPreparingLaneBPage = Boolean(step === "pages" && laneBPackageData && activePageIndex !== null && !patchedXscpData);

  return (
    <section className="space-y-3">
      <LaneHeader
        label="Lane B / Import Template"
        description="Read the Master Collection multi-page clipboard, resolve Webflow pages, then prepare and copy each page payload."
        onBack={onBackToChooser}
      />
      {step === "paste" ? (
        <WebflowAccessPanel
          token={webflowToken}
          onTokenChange={handleTokenChange}
          cmsRequired={hasCms}
        />
      ) : null}
      <StepIndicator labels={templateSteps.map((item) => item.label)} activeStepIndex={activeStepIndex} />
      {status ? <StatusMessage tone="success" message={status} /> : null}
      {error ? <StatusMessage tone="error" message={error} /> : null}

      {step === "paste" ? (
        <Card>
          <CardHeader>
            <CardTitle>Lane B clipboard intake</CardTitle>
            <CardDescription>Paste the Master Collection multi-page converter payload to begin.</CardDescription>
          </CardHeader>
          <CardContent>
            <LaneBClipboardStep
              onDetected={(payload) => runAction(() => handleDetectedLaneBPayload(payload))}
              onError={setError}
            />
          </CardContent>
        </Card>
      ) : null}

      {step === "pages" && isPreparingLaneBPage && laneBPackageData ? (
        <LaneBPrepareProgressStep
          pageName={preparedLaneBPage?.source.displayName ?? "Selected page"}
          packageData={laneBPackageData}
          fontScan={fontScan}
          fontChecking={fontChecking}
          uploadProgress={uploadProgress}
          uploadedAssets={uploadedAssets}
          fontPhase={hasCopiedToWebflow ? "post-paste" : "pre-paste"}
          onRecheckFonts={() => runAction(handleRecheckLaneBFonts)}
        />
      ) : null}

      {step === "pages" && laneBPlan && resolvedLaneBPages.length > 0 && !isPreparingLaneBPage ? (
        <Card>
          <CardHeader>
            <CardTitle>{laneBPlan.displayName}</CardTitle>
            <CardDescription>Resolve each source page against the current Webflow site before preparing a payload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <LaneBPagePlanStep
              pages={resolvedLaneBPages}
              activePageIndex={activePageIndex}
              pageStatuses={pageStatuses}
              onSelectPage={(index) => runAction(() => handlePrepareLaneBPage(index))}
            />
          </CardContent>
        </Card>
      ) : null}

      {step === "cms" && laneBTargetContext ? (
        <div className="space-y-3">
          <CmsImportPanel
            siteId={laneBTargetContext.siteId}
            siteName={laneBTargetContext.siteName}
            token={webflowToken}
            onTokenChange={handleTokenChange}
            hideTokenField
          />
          <Button type="button" onClick={() => setStep("copy")}>
            Continue to Copy
          </Button>
        </div>
      ) : null}

      {step === "copy" && patchedXscpData ? (
        <LaneBCopyStep
          packageData={laneBPackageData}
          fontScan={fontScan}
          fontChecking={fontChecking}
          uploadProgress={uploadProgress}
          uploadedAssets={uploadedAssets}
          siteId={laneBTargetContext?.siteId ?? ""}
          canCopy={canCopy}
          copyBlockReason={copyBlockReason}
          existingStyleCount={existingStyleCount}
          fontsConfirmed={fontsConfirmed}
          pageStateConfirmed={pageStateConfirmed}
          fontPhase={hasCopiedToWebflow ? "post-paste" : "pre-paste"}
          onFontsConfirmedChange={setFontsConfirmed}
          onPageStateConfirmedChange={setPageStateConfirmed}
          onRecheckFonts={() => runAction(handleRecheckLaneBFonts)}
          onCopy={() => runAction(handleCopy)}
          onBack={() => setStep("pages")}
        />
      ) : null}

      {preparedLaneBPage ? (
        <div className="text-xs text-muted-foreground">
          Prepared page: <span className="font-medium text-foreground">{preparedLaneBPage.source.displayName}</span>
        </div>
      ) : null}

      {(laneBPlan || preparedLaneBPage) ? (
        <Button type="button" variant="outline" onClick={handleRestart}>
          Restart Lane B
        </Button>
      ) : null}
    </section>
  );
}

function CustomSiteInstallFlow({
  adapter,
  onBackToChooser,
}: {
  adapter: WebflowAdapter;
  onBackToChooser: () => void;
}) {
  const [step, setStep] = useState<CustomStepId>("paste");
  const [webflowToken, setWebflowToken] = useState(readStoredWebflowSiteToken);
  const [packageData, setPackageData] = useState<MasterCollectionPackage | null>(null);
  const [targetContext, setTargetContext] = useState<WebflowTargetContext | null>(null);
  const [fontScan, setFontScan] = useState<FontDetectionResult | null>(null);
  const [fontChecking, setFontChecking] = useState(false);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedWebflowAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, AssetUploadProgress>>({});
  const [patchedXscpData, setPatchedXscpData] = useState<unknown | null>(null);
  const [existingStyleCount, setExistingStyleCount] = useState<number | null>(null);
  const [fontsConfirmed, setFontsConfirmed] = useState(false);
  const [pageStateConfirmed, setPageStateConfirmed] = useState(false);
  const [hasCopiedToWebflow, setHasCopiedToWebflow] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAction(action: () => Promise<void>) {
    action().catch((caught) => {
      setStatus(null);
      setError(formatErrorMessage(caught));
    });
  }

  function handleTokenChange(token: string) {
    setWebflowToken(token);
    persistWebflowSiteToken(token);
  }

  async function handleDetectedPayload(nextPayload: SinglePageConverterPayload) {
    if (nextPayload.flowbridgeMeta?.lane !== "lane-a") {
      setError("This screen only accepts a Lane A single-page custom-site payload.");
      return;
    }

    const nextPackage = packageFromSingleConverterPayload(nextPayload);
    setPackageData(nextPackage);
    setFontScan(null);
    setUploadedAssets([]);
    setUploadProgress({});
    setPatchedXscpData(null);
    setExistingStyleCount(null);
    setFontsConfirmed(false);
    setPageStateConfirmed(false);
    setHasCopiedToWebflow(false);
    setError(null);
    if (nextPackage.assets.length > 0 && !webflowToken.trim()) {
      setStatus("Paste detected. Webflow access is required before asset preparation.");
      setError("Paste a Webflow Site API Token before preparing assets.");
      setStep("paste");
      return;
    }
    setStatus("Reading the current Webflow page...");
    const context = await adapter.getTargetContext();
    setTargetContext(context);
    setStep("prepare");
    await handlePrepareCustomSite(nextPackage, context);
  }

  async function handlePrepareCustomSite(
    activePackageData: MasterCollectionPackage = packageData as MasterCollectionPackage,
    activeTargetContext: WebflowTargetContext = targetContext as WebflowTargetContext,
  ) {
    if (!activePackageData || !activeTargetContext) return;
    if (activePackageData.assets.length > 0 && !webflowToken.trim()) {
      setError("Paste a Webflow Site API Token before preparing assets.");
      setStatus(null);
      setStep("prepare");
      return;
    }

    setError(null);
    setStep("prepare");
    setUploadProgress({});
    setUploadedAssets([]);
    setPatchedXscpData(null);
    setFontChecking(true);

    const prepared = await preparePackageForWebflow({
      packageData: activePackageData,
      adapter,
      token: webflowToken.trim(),
      onPhase: setStatus,
      onAssetProgress: (progress) => {
        setUploadProgress((current) => ({
          ...current,
          [progress.key]: progress,
        }));
      },
    });

    setTargetContext(prepared.targetContext);
    setFontScan(prepared.fontScan);
    setFontChecking(false);
    setUploadedAssets(prepared.uploadedAssets);
    setPatchedXscpData(prepared.patchedXscpData);
    try {
      const styleCount = await adapter.countExistingStyles();
      setExistingStyleCount(styleCount);
    } catch {
      setExistingStyleCount(null);
    }
    setStatus(
      activePackageData.blockedReason
        ? "Custom-site payload was prepared, but copy remains blocked until the converter-side issue is resolved."
        : "Custom-site payload is ready for Webflow paste.",
    );
  }

  async function handleRecheckFonts() {
    if (!packageData) return;
    setStatus("Rechecking fonts...");
    setFontChecking(true);
    const nextFontScan = await adapter.scanFonts(packageData.fonts);
    setFontScan(nextFontScan);
    setFontChecking(false);
    setStatus(nextFontScan.message ?? "Font check complete.");
  }

  async function handleCopy() {
    if (!patchedXscpData) return;
    assertSinglePageXscpData(patchedXscpData);
    assertWebflowPasteSafe(patchedXscpData);
    setError(null);
    setStatus("Copying custom-site payload...");
    const copyResult = await copyXscpDataToClipboard(patchedXscpData);
    setHasCopiedToWebflow(true);
    setStatus(
      copyResult.mode === "text-only"
        ? "Copied as text fallback. Webflow may reject this paste; use a browser/session that supports application/json clipboard data."
        : "Copied to Webflow clipboard. Click the Webflow canvas and paste, then click Re-check fonts to confirm.",
    );
    setStep("done");
  }

  function handleRestart() {
    setStep("paste");
    setPackageData(null);
    setTargetContext(null);
    setFontScan(null);
    setFontChecking(false);
    setUploadedAssets([]);
    setUploadProgress({});
    setPatchedXscpData(null);
    setExistingStyleCount(null);
    setFontsConfirmed(false);
    setPageStateConfirmed(false);
    setHasCopiedToWebflow(false);
    setStatus(null);
    setError(null);
  }

  const activeStepIndex = CUSTOM_STEPS.findIndex((item) => item.id === step);
  const requiredAssetsUploaded = !packageData || areRequiredAssetsReady(packageData, uploadedAssets);
  const requiredFontsCount = (packageData?.fonts ?? []).filter((font) => font.required).length;
  const fontsAcknowledged = requiredFontsCount === 0 || fontsConfirmed;
  const preflightConfirmed = fontsAcknowledged && pageStateConfirmed;
  const canCopy = Boolean(
    isSinglePageXscpData(patchedXscpData)
    && requiredAssetsUploaded
    && preflightConfirmed
    && !packageData?.blockedReason,
  );
  const copyBlockReason = canCopy
    ? null
    : describeCustomCopyBlocker({
      packageData,
      patchedXscpData,
      uploadedAssets,
      preflightConfirmed,
    });

  return (
    <section className="space-y-3">
      <LaneHeader
        label="Lane A / Import Custom Site"
        description="Paste one single-page Lane A payload, verify fonts, upload staged assets, then paste."
        onBack={onBackToChooser}
      />
      {step === "paste" ? (
        <WebflowAccessPanel
          token={webflowToken}
          onTokenChange={handleTokenChange}
        />
      ) : null}
      <StepIndicator labels={CUSTOM_STEPS.map((item) => item.label)} activeStepIndex={activeStepIndex} />
      {status ? <StatusMessage tone="success" message={status} /> : null}
      {error ? <StatusMessage tone="error" message={error} /> : null}

      {step === "paste" ? (
        <LaneAPasteStep onDetected={(payload) => runAction(() => handleDetectedPayload(payload))} onError={setError} onStatus={setStatus} />
      ) : null}

      {step === "prepare" && packageData && targetContext ? (
        <CustomPrepareStep
          packageData={packageData}
          fontScan={fontScan}
          fontChecking={fontChecking}
          uploadProgress={uploadProgress}
          uploadedAssets={uploadedAssets}
          canCopy={canCopy}
          copyBlockReason={copyBlockReason}
          existingStyleCount={existingStyleCount}
          fontsConfirmed={fontsConfirmed}
          pageStateConfirmed={pageStateConfirmed}
          fontPhase={hasCopiedToWebflow ? "post-paste" : "pre-paste"}
          onFontsConfirmedChange={setFontsConfirmed}
          onPageStateConfirmedChange={setPageStateConfirmed}
          onRecheckFonts={() => runAction(handleRecheckFonts)}
          onCopy={() => runAction(handleCopy)}
          onBack={() => setStep("paste")}
          onRestart={handleRestart}
        />
      ) : null}

      {step === "done" && packageData && targetContext ? (
        <DoneStep
          title="Custom site ready in Webflow"
          description="Click inside the Webflow canvas body and paste."
          packageData={packageData}
          targetContext={targetContext}
          uploadedAssets={uploadedAssets}
          onRestart={handleRestart}
          hidePageId
        />
      ) : null}
    </section>
  );
}

function LaneHeader({
  label,
  description,
  onBack,
}: {
  label: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        Back to import paths
      </Button>
    </div>
  );
}

function StepIndicator({ labels, activeStepIndex }: { labels: string[]; activeStepIndex: number }) {
  return (
    <div className="grid border border-border text-[10px]" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((label, index) => (
        <div
          key={label}
          className={cn(
            "border-r border-border px-2 py-1.5 text-center last:border-r-0",
            index <= activeStepIndex ? "bg-foreground text-background" : "bg-background text-muted-foreground",
          )}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function StatusMessage({ message, tone }: { message: string; tone: "success" | "error" }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={cn(
        "flex items-start gap-2 border px-3 py-2 text-xs",
        tone === "success" ? "border-border bg-muted" : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function EntryModeStep({ onChoose }: { onChoose: (mode: EntryMode) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a lane</CardTitle>
        <CardDescription>Lane B installs a multi-page converter payload. Lane A is the single-page custom-site installer.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="border border-border bg-background p-4 text-left hover:bg-muted"
          onClick={() => onChoose("custom")}
        >
          <div className="mb-1 text-sm font-medium">Lane A</div>
          <div className="text-xs text-muted-foreground">Import Custom Site. Paste a single-page Lane A payload from the minimal converter.</div>
        </button>
        <button
          type="button"
          className="border border-border bg-background p-4 text-left hover:bg-muted"
          onClick={() => onChoose("template")}
        >
          <div className="mb-1 text-sm font-medium">Lane B</div>
          <div className="text-xs text-muted-foreground">Import Template. Read the converter clipboard, resolve pages, then prepare each page for Webflow paste.</div>
        </button>
      </CardContent>
    </Card>
  );
}

function LaneAPasteStep({
  onDetected,
  onError,
  onStatus,
}: {
  onDetected: (payload: SinglePageConverterPayload) => void;
  onError: (message: string | null) => void;
  onStatus: (message: string | null) => void;
}) {
  const [detectedPayload, setDetectedPayload] = useState<SinglePageConverterPayload | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  function handleText(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setDetectedPayload(null);
      setLocalMessage(null);
      onStatus(null);
      onError(null);
      return;
    }

    try {
      const parsed = parseConverterPayloadJson(trimmed);
      if (parsed.kind !== "single" || parsed.flowbridgeMeta?.lane !== "lane-a") {
        const message = "Paste a Lane A single-page custom-site payload here.";
        setDetectedPayload(null);
        setLocalMessage(message);
        onStatus(null);
        onError(message);
        return;
      }

      setDetectedPayload(parsed);
      setLocalMessage("Paste detected. Ready to proceed.");
      onError(null);
      onStatus("Paste detected. Ready to proceed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "This is not a valid Master Collection payload.";
      setDetectedPayload(null);
      setLocalMessage(message);
      onStatus(null);
      onError(message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lane A / Import Custom Site</CardTitle>
        <CardDescription>Paste the single-page Lane A payload here. When it is valid, the app detects it automatically and enables proceed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div
          role="button"
          tabIndex={0}
          onPaste={(event) => {
            const pastedText = event.clipboardData.getData("text");
            if (pastedText) {
              event.preventDefault();
              handleText(pastedText);
            }
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
              return;
            }
          }}
          className="flex min-h-28 items-center justify-center border border-dashed border-input bg-background p-6 text-center outline-none focus:border-ring"
          aria-label="Lane A payload paste target"
        >
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">Paste payload here</div>
            <div className="text-xs text-muted-foreground">Click this area, then press Ctrl+V.</div>
          </div>
        </div>

        {localMessage ? (
          <section
            className={cn(
              "border p-3",
              /ready to proceed/i.test(localMessage)
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {localMessage}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              if (detectedPayload) onDetected(detectedPayload);
            }}
            disabled={!detectedPayload}
            className={cn(
              detectedPayload ? "bg-emerald-600 text-white hover:bg-emerald-500" : "",
            )}
          >
            Proceed
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function LaneBCopyStep({
  packageData,
  fontScan,
  fontChecking,
  uploadProgress,
  uploadedAssets,
  canCopy,
  copyBlockReason,
  existingStyleCount,
  fontsConfirmed,
  pageStateConfirmed,
  fontPhase,
  onFontsConfirmedChange,
  onPageStateConfirmedChange,
  onRecheckFonts,
  onCopy,
  onBack,
}: {
  packageData: MasterCollectionPackage | null;
  fontScan: FontDetectionResult | null;
  fontChecking: boolean;
  uploadProgress: Record<string, AssetUploadProgress>;
  uploadedAssets: UploadedWebflowAsset[];
  siteId: string;
  canCopy: boolean;
  copyBlockReason: string | null;
  existingStyleCount: number | null;
  fontsConfirmed: boolean;
  pageStateConfirmed: boolean;
  fontPhase: "pre-paste" | "post-paste";
  onFontsConfirmedChange: (confirmed: boolean) => void;
  onPageStateConfirmedChange: (confirmed: boolean) => void;
  onRecheckFonts: () => void;
  onCopy: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste into Webflow</CardTitle>
        <CardDescription>Copy the final payload, click inside the Webflow canvas, and paste.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {packageData ? (
          <>
            <PrepastePreflightPanel
              packageData={packageData}
              existingStyleCount={existingStyleCount}
              fontsConfirmed={fontsConfirmed}
              pageStateConfirmed={pageStateConfirmed}
              onFontsConfirmedChange={onFontsConfirmedChange}
              onPageStateConfirmedChange={onPageStateConfirmedChange}
            />
            <AssetProgressPanel
              packageData={packageData}
              uploadProgress={uploadProgress}
              uploadedAssets={uploadedAssets}
            />
            <FontStatusPanel
              packageData={packageData}
              fontScan={fontScan}
              checking={fontChecking}
              phase={fontPhase}
              onRecheckFonts={onRecheckFonts}
            />
          </>
        ) : null}
        <p className="text-xs text-muted-foreground">Copy the package payload, click the Webflow canvas, then paste.</p>
        {!canCopy && copyBlockReason ? (
          <div className="border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            {copyBlockReason}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" onClick={onCopy} disabled={!canCopy}>
            <Copy className="h-3.5 w-3.5" />
            Copy to Webflow
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LaneBPrepareProgressStep({
  pageName,
  packageData,
  fontScan,
  fontChecking,
  uploadProgress,
  uploadedAssets,
  fontPhase,
  onRecheckFonts,
}: {
  pageName: string;
  packageData: MasterCollectionPackage;
  fontScan: FontDetectionResult | null;
  fontChecking: boolean;
  uploadProgress: Record<string, AssetUploadProgress>;
  uploadedAssets: UploadedWebflowAsset[];
  fontPhase: "pre-paste" | "post-paste";
  onRecheckFonts: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preparing {pageName}</CardTitle>
        <CardDescription>Uploading staged images and checking fonts before the final Webflow paste payload is copied.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AssetProgressPanel
          packageData={packageData}
          uploadProgress={uploadProgress}
          uploadedAssets={uploadedAssets}
        />
        <FontStatusPanel
          packageData={packageData}
          fontScan={fontScan}
          checking={fontChecking}
          phase={fontPhase}
          onRecheckFonts={onRecheckFonts}
        />
      </CardContent>
    </Card>
  );
}

function CustomPrepareStep({
  packageData,
  fontScan,
  fontChecking,
  uploadProgress,
  uploadedAssets,
  canCopy,
  copyBlockReason,
  existingStyleCount,
  fontsConfirmed,
  pageStateConfirmed,
  fontPhase,
  onFontsConfirmedChange,
  onPageStateConfirmedChange,
  onRecheckFonts,
  onCopy,
  onBack,
  onRestart,
}: {
  packageData: MasterCollectionPackage;
  fontScan: FontDetectionResult | null;
  fontChecking: boolean;
  uploadProgress: Record<string, AssetUploadProgress>;
  uploadedAssets: UploadedWebflowAsset[];
  canCopy: boolean;
  copyBlockReason: string | null;
  existingStyleCount: number | null;
  fontsConfirmed: boolean;
  pageStateConfirmed: boolean;
  fontPhase: "pre-paste" | "post-paste";
  onFontsConfirmedChange: (confirmed: boolean) => void;
  onPageStateConfirmedChange: (confirmed: boolean) => void;
  onRecheckFonts: () => void;
  onCopy: () => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prepare custom site</CardTitle>
        <CardDescription>Verify fonts, upload staged assets, then copy the final one-page payload.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {packageData.blockedReason ? (
          <div className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {packageData.blockedReason}
          </div>
        ) : null}

        <PrepastePreflightPanel
          packageData={packageData}
          existingStyleCount={existingStyleCount}
          fontsConfirmed={fontsConfirmed}
          pageStateConfirmed={pageStateConfirmed}
          onFontsConfirmedChange={onFontsConfirmedChange}
          onPageStateConfirmedChange={onPageStateConfirmedChange}
        />

        <AssetProgressPanel
          packageData={packageData}
          uploadProgress={uploadProgress}
          uploadedAssets={uploadedAssets}
        />

        <FontStatusPanel
          packageData={packageData}
          fontScan={fontScan}
          checking={fontChecking}
          phase={fontPhase}
          onRecheckFonts={onRecheckFonts}
        />

        {packageData.warnings?.map((warning) => (
          <div key={`${warning.code}-${warning.message}`} className="border border-border bg-muted p-2 text-xs text-muted-foreground">
            {warning.message}
          </div>
        ))}

        {!canCopy && copyBlockReason ? (
          <div className="border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            {copyBlockReason}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCopy} disabled={!canCopy}>
            <Copy className="h-3.5 w-3.5" />
            Copy to Webflow
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="button" variant="ghost" onClick={onRestart}>
            Restart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DoneStep({
  title,
  description,
  packageData,
  targetContext,
  uploadedAssets,
  onRestart,
  hidePageId = false,
}: {
  title: string;
  description: string;
  packageData: MasterCollectionPackage;
  targetContext: WebflowTargetContext;
  uploadedAssets: UploadedWebflowAsset[];
  onRestart: () => void;
  hidePageId?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-xs">
          <div className="font-medium">{packageData.name} v{packageData.version}</div>
          <div className="text-muted-foreground">{uploadedAssets.length} asset prepared.</div>
          {!hidePageId ? <div className="font-mono text-[10px] text-muted-foreground">pageId: {targetContext.pageId}</div> : null}
          {packageData.warnings?.map((warning) => (
            <div key={`${warning.code}-${warning.message}`} className="border border-border bg-muted p-2 text-muted-foreground">
              {warning.message}
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={onRestart}>
          Install another package
        </Button>
      </CardContent>
    </Card>
  );
}

function packageFromSingleConverterPayload(payload: SinglePageConverterPayload): MasterCollectionPackage {
  const flowbridgeMeta = payload.flowbridgeMeta;
  return {
    schemaVersion: "master-collection-package@1",
    packageId: "converter-clipboard-lane-a",
    name: flowbridgeMeta?.name ?? payload.name,
    version: "1.0.0",
    xscpData: payload.xscpData,
    fonts: flowbridgeMeta?.fonts ?? [],
    assets: flowbridgeMeta?.assets ?? [],
    warnings: diagnosticsWarnings(payload.warnings),
    blockedReason: flowbridgeMeta?.blockedReason,
  };
}

function packageFromInstallPlanPage(page: AppInstallPlanPage): MasterCollectionPackage {
  return {
    schemaVersion: "master-collection-package@1",
    packageId: `lane-b-${page.index}`,
    name: page.displayName,
    version: "1.0.0",
    xscpData: page.xscpData,
    fonts: page.fonts,
    assets: page.assets,
    warnings: diagnosticsWarnings(page.warnings),
  };
}

function diagnosticsWarnings(warnings: string[]): MasterCollectionPackage["warnings"] {
  return warnings.map((message, index) => ({
    code: index === 0 ? "INTERACTIONS_LIMITED" : "CUSTOM_CODE_NOT_SUPPORTED",
    message,
  }));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function areRequiredAssetsReady(
  packageData: MasterCollectionPackage,
  uploadedAssets: UploadedWebflowAsset[],
): boolean {
  const uploadedKeys = new Set(uploadedAssets.map((asset) => asset.packageAssetKey));
  return packageData.assets
    .filter((asset) => asset.required)
    .every((asset) => uploadedKeys.has(asset.key));
}

function describeFinalPayloadBlocker(patchedXscpData: unknown | null): string {
  if (!patchedXscpData) {
    return "Copy is waiting for the prepared Webflow payload.";
  }

  if (!isRecord(patchedXscpData)) {
    return "Copy is blocked because the prepared payload is not an object.";
  }

  return `Copy is blocked because the prepared payload type is "${String(patchedXscpData.type ?? "missing")}", not "@webflow/XscpData".`;
}

function describeCustomCopyBlocker({
  packageData,
  patchedXscpData,
  uploadedAssets,
  preflightConfirmed,
}: {
  packageData: MasterCollectionPackage | null;
  patchedXscpData: unknown | null;
  uploadedAssets: UploadedWebflowAsset[];
  preflightConfirmed: boolean;
}): string {
  if (!packageData) {
    return "Copy is waiting for a valid package payload.";
  }

  if (!isSinglePageXscpData(patchedXscpData)) {
    return describeFinalPayloadBlocker(patchedXscpData);
  }

  if (!areRequiredAssetsReady(packageData, uploadedAssets)) {
    return "Copy is waiting for all required Webflow images to finish preparing.";
  }

  if (!preflightConfirmed) {
    return "Copy is waiting for both preflight checkboxes (fonts installed, target page acknowledged) above.";
  }

  if (packageData.blockedReason) {
    return packageData.blockedReason;
  }

  return "Copy is blocked by an unknown preparation state.";
}

function describeTemplateCopyBlocker({
  patchedXscpData,
  preflightConfirmed,
}: {
  packageData: MasterCollectionPackage | null;
  fontScan: FontDetectionResult | null;
  patchedXscpData: unknown | null;
  preflightConfirmed: boolean;
}): string {
  if (!isSinglePageXscpData(patchedXscpData)) {
    return describeFinalPayloadBlocker(patchedXscpData);
  }

  if (!preflightConfirmed) {
    return "Copy is waiting for both preflight checkboxes (fonts installed, target page acknowledged) above.";
  }

  return "Copy is blocked by an unknown preparation state.";
}

function formatErrorMessage(caught: unknown): string {
  if (isWebflowAuthError(caught)) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Something went wrong.";
}

function areRequiredFontsReady(
  packageData: MasterCollectionPackage,
  fontScan: FontDetectionResult | null,
): boolean {
  const requiredFonts = packageData.fonts.filter((font) => font.required);
  if (requiredFonts.length === 0) {
    return true;
  }

  if (!fontScan || fontScan.source === "unavailable") {
    return false;
  }

  return fontScan.missing.length === 0;
}
