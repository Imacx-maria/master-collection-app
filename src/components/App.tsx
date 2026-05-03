import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaneBClipboardStep } from "@/components/LaneBClipboardStep";
import { LaneBPagePlanStep } from "@/components/LaneBPagePlanStep";
import { uploadPackageAssets, type AssetUploadProgress } from "@/lib/assets/upload";
import { copyXscpDataToClipboard } from "@/lib/clipboard/webflowClipboard";
import { parseConverterPayloadJson, type MultiPageConverterPayload, type SinglePageConverterPayload } from "@/lib/converter/parseConverterPayload";
import { buildInstallPlan } from "@/lib/install/buildInstallPlan";
import { prepareInstallPayload } from "@/lib/install/prepareInstallPayload";
import { resolveTargetPages, type ResolvedTargetPage } from "@/lib/install/resolveTargetPages";
import type { AppInstallPlan, AppInstallPlanPage } from "@/lib/install/types";
import type { MasterCollectionPackage } from "@/lib/package/types";
import { cn } from "@/lib/utils";
import { createWebflowAdapter } from "@/lib/webflow/adapter";
import type { FontDetectionResult, UploadedWebflowAsset, WebflowAdapter, WebflowTargetContext } from "@/lib/webflow/types";
import { assertWebflowPasteSafe } from "@/lib/xscp/webflowCrashAudit";

const APP_VERSION = "0.1.0";
const THEME_KEY = "master-collection-theme";

type Theme = "light" | "dark";
type EntryMode = "chooser" | "template" | "custom";
type TemplateStepId = "paste" | "pages" | "copy";
type CustomStepId = "paste" | "prepare" | "done";

const TEMPLATE_STEPS: Array<{ id: TemplateStepId; label: string }> = [
  { id: "paste", label: "Paste" },
  { id: "pages", label: "Pages" },
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

function buildFontsDashboardUrl(siteId: string) {
  return `https://webflow.com/dashboard/sites/${siteId}/fonts`;
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
  const [laneBPlan, setLaneBPlan] = useState<AppInstallPlan | null>(null);
  const [resolvedLaneBPages, setResolvedLaneBPages] = useState<ResolvedTargetPage[]>([]);
  const [preparedLaneBPage, setPreparedLaneBPage] = useState<ResolvedTargetPage | null>(null);
  const [patchedXscpData, setPatchedXscpData] = useState<unknown | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAction(action: () => Promise<void>) {
    action().catch((caught) => {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    });
  }

  async function handleDetectedLaneBPayload(payload: MultiPageConverterPayload) {
    setError(null);
    const plan = buildInstallPlan(payload);
    const resolvedPages = await resolveTargetPages(plan.pages, adapter);
    setLaneBPlan(plan);
    setResolvedLaneBPages(resolvedPages);
    setPreparedLaneBPage(null);
    setPatchedXscpData(null);
    setStatus(`Detected FlowBridge multi-page payload with ${payload.pageCount} page(s).`);
    setStep("pages");
  }

  async function handlePrepareLaneBPage(index: number) {
    const resolved = resolvedLaneBPages.find((page) => page.source.index === index);
    if (!resolved) {
      throw new Error("Resolved Lane B page not found.");
    }

    setError(null);
    setPatchedXscpData(null);
    setStatus(`Preparing ${resolved.source.displayName} for Webflow paste...`);

    const targetContext = await adapter.switchPage(resolved.target);
    const packageData = packageFromInstallPlanPage(resolved.source);
    const uploadedAssets = await uploadPackageAssets({
      packageData,
      adapter,
      siteId: targetContext.siteId,
      siteName: targetContext.siteName,
    });
    const { patchedXscpData: prepared } = prepareInstallPayload({
      packageData,
      targetPageId: targetContext.pageId,
      uploadedAssets,
    });

    setPreparedLaneBPage(resolved);
    setPatchedXscpData(prepared);
    setStatus(`Prepared ${resolved.source.displayName}. Copy the payload for the current Webflow page.`);
    setStep("copy");
  }

  async function handleCopy() {
    if (!patchedXscpData) return;
    assertSinglePageXscpData(patchedXscpData);
    assertWebflowPasteSafe(patchedXscpData);
    setError(null);
    setStatus("Copying package payload...");
    const copyResult = await copyXscpDataToClipboard(patchedXscpData);
    setStatus(
      copyResult.mode === "text-only"
        ? "Copied as plain text only. Verify paste in Webflow before trusting this install."
        : "Copied. Click the Webflow canvas and paste.",
    );
  }

  function handleRestart() {
    setStep("paste");
    setLaneBPlan(null);
    setResolvedLaneBPages([]);
    setPreparedLaneBPage(null);
    setPatchedXscpData(null);
    setStatus(null);
    setError(null);
  }

  const activeStepIndex = TEMPLATE_STEPS.findIndex((item) => item.id === step);

  return (
    <section className="space-y-3">
      <LaneHeader
        label="Lane B / Import Template"
        description="Read the FlowBridge multi-page clipboard, resolve Webflow pages, then prepare and copy each page payload."
        onBack={onBackToChooser}
      />
      <StepIndicator labels={TEMPLATE_STEPS.map((item) => item.label)} activeStepIndex={activeStepIndex} />
      {status ? <StatusMessage tone="success" message={status} /> : null}
      {error ? <StatusMessage tone="error" message={error} /> : null}

      {step === "paste" ? (
        <Card>
          <CardHeader>
            <CardTitle>Lane B clipboard intake</CardTitle>
            <CardDescription>Paste the FlowBridge multi-page converter payload to begin.</CardDescription>
          </CardHeader>
          <CardContent>
            <LaneBClipboardStep
              onDetected={(payload) => runAction(() => handleDetectedLaneBPayload(payload))}
              onError={setError}
            />
          </CardContent>
        </Card>
      ) : null}

      {laneBPlan && resolvedLaneBPages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{laneBPlan.displayName}</CardTitle>
            <CardDescription>Resolve each source page against the current Webflow site before preparing a payload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <LaneBPagePlanStep
              pages={resolvedLaneBPages}
              onPreparePage={(index) => runAction(() => handlePrepareLaneBPage(index))}
            />
          </CardContent>
        </Card>
      ) : null}

      {step === "copy" && patchedXscpData ? (
        <ClipboardStep
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
  const [packageData, setPackageData] = useState<MasterCollectionPackage | null>(null);
  const [targetContext, setTargetContext] = useState<WebflowTargetContext | null>(null);
  const [fontScan, setFontScan] = useState<FontDetectionResult | null>(null);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedWebflowAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, AssetUploadProgress>>({});
  const [patchedXscpData, setPatchedXscpData] = useState<unknown | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAction(action: () => Promise<void>) {
    action().catch((caught) => {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    });
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
    setError(null);
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

    setError(null);
    setStep("prepare");
    setUploadProgress({});
    setUploadedAssets([]);
    setPatchedXscpData(null);

    setStatus("Checking fonts on the current site...");
    const nextFontScan = await adapter.scanFonts(activePackageData.fonts);
    setFontScan(nextFontScan);

    setStatus(
      activePackageData.assets.length > 0
        ? `Uploading ${activePackageData.assets.length} staged asset(s) to Webflow Assets...`
        : "No staged assets to upload.",
    );
    const uploaded = await uploadPackageAssets({
      packageData: activePackageData,
      adapter,
      onProgress: (progress) => {
        setUploadProgress((current) => ({
          ...current,
          [progress.key]: progress,
        }));
      },
    });

    const { patchedXscpData: patched } = prepareInstallPayload({
      packageData: activePackageData,
      targetPageId: activeTargetContext.pageId,
      uploadedAssets: uploaded,
    });

    setUploadedAssets(uploaded);
    setPatchedXscpData(patched);
    setStatus(
      activePackageData.blockedReason
        ? "Custom-site payload was prepared, but copy remains blocked until the converter-side issue is resolved."
        : "Custom-site payload is ready for Webflow paste.",
    );
  }

  async function handleRecheckFonts() {
    if (!packageData) return;
    setStatus("Rechecking fonts...");
    const nextFontScan = await adapter.scanFonts(packageData.fonts);
    setFontScan(nextFontScan);
    setStatus(nextFontScan.message ?? "Font check complete.");
  }

  async function handleCopy() {
    if (!patchedXscpData) return;
    assertSinglePageXscpData(patchedXscpData);
    assertWebflowPasteSafe(patchedXscpData);
    setError(null);
    setStatus("Copying custom-site payload...");
    const copyResult = await copyXscpDataToClipboard(patchedXscpData);
    setStatus(
      copyResult.mode === "text-only"
        ? "Copied as plain text only. Verify paste in Webflow before trusting this install."
        : "Copied. Click the Webflow canvas and paste.",
    );
    setStep("done");
  }

  function handleRestart() {
    setStep("paste");
    setPackageData(null);
    setTargetContext(null);
    setFontScan(null);
    setUploadedAssets([]);
    setUploadProgress({});
    setPatchedXscpData(null);
    setStatus(null);
    setError(null);
  }

  const activeStepIndex = CUSTOM_STEPS.findIndex((item) => item.id === step);
  const requiredAssetsUploaded = !packageData || areRequiredAssetsReady(packageData, uploadedAssets);
  const fontsConfirmed = !packageData || areRequiredFontsReady(packageData, fontScan);
  const canCopy = Boolean(
    isSinglePageXscpData(patchedXscpData)
    && requiredAssetsUploaded
    && fontsConfirmed
    && !packageData?.blockedReason,
  );

  return (
    <section className="space-y-3">
      <LaneHeader
        label="Lane A / Import Custom Site"
        description="Paste one single-page Lane A payload, verify fonts, upload staged assets, then paste."
        onBack={onBackToChooser}
      />
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
          uploadProgress={uploadProgress}
          uploadedAssets={uploadedAssets}
          canCopy={canCopy}
          onRecheckFonts={() => runAction(handleRecheckFonts)}
          onOpenWebflowFonts={() => window.open(buildFontsDashboardUrl(targetContext.siteId), "_blank", "noopener,noreferrer")}
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
      const message = error instanceof Error ? error.message : "This is not a valid FlowBridge payload.";
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

function ClipboardStep({
  onCopy,
  onBack,
}: {
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
        <p className="text-xs text-muted-foreground">Copy the package payload, click the Webflow canvas, then paste.</p>
        <div className="flex gap-2">
          <Button type="button" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
            Copy for Webflow
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomPrepareStep({
  packageData,
  fontScan,
  uploadProgress,
  uploadedAssets,
  canCopy,
  onRecheckFonts,
  onOpenWebflowFonts,
  onCopy,
  onBack,
  onRestart,
}: {
  packageData: MasterCollectionPackage;
  fontScan: FontDetectionResult | null;
  uploadProgress: Record<string, AssetUploadProgress>;
  uploadedAssets: UploadedWebflowAsset[];
  canCopy: boolean;
  onRecheckFonts: () => void;
  onOpenWebflowFonts: () => void;
  onCopy: () => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const assetSummary = summarizeAssetProgress(packageData, uploadProgress, uploadedAssets);

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

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">Images</p>
            <span className="font-mono text-[10px] text-muted-foreground">{assetSummary.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground transition-all" style={{ width: `${assetSummary.percent}%` }} />
          </div>
          <div className="text-muted-foreground">
            {buildLaneAAssetMessage(packageData, uploadProgress, uploadedAssets, canCopy)}
          </div>
        </section>

        <FontSection
          packageData={packageData}
          fontScan={fontScan}
          onRecheckFonts={onRecheckFonts}
          onOpenWebflowFonts={onOpenWebflowFonts}
        />

        {packageData.warnings?.map((warning) => (
          <div key={`${warning.code}-${warning.message}`} className="border border-border bg-muted p-2 text-xs text-muted-foreground">
            {warning.message}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCopy} disabled={!canCopy}>
            <Copy className="h-3.5 w-3.5" />
            Paste to Webflow
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

function FontSection({
  packageData,
  fontScan,
  onRecheckFonts,
  onOpenWebflowFonts,
}: {
  packageData: MasterCollectionPackage;
  fontScan: FontDetectionResult | null;
  onRecheckFonts: () => void;
  onOpenWebflowFonts: () => void;
}) {
  const requiredFonts = packageData.fonts.filter((font) => font.required);
  if (requiredFonts.length === 0) return null;

  const missing = fontScan?.missing ?? requiredFonts;
  const installed = fontScan?.installed ?? [];
  const scanUnavailable = fontScan?.source === "unavailable";
  if (!scanUnavailable && missing.length === 0) return null;

  return (
    <section className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">Fonts</p>
          <p className="text-muted-foreground">
            {scanUnavailable
              ? "Font detection is unavailable in this environment. Install the required fonts in Webflow before paste."
              : `${missing.length} font(s) must be installed manually in Webflow.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRecheckFonts}>
            <RefreshCw className="h-3.5 w-3.5" />
            Recheck
          </Button>
          {missing.length > 0 || scanUnavailable ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenWebflowFonts}>
              <ExternalLink className="h-3.5 w-3.5" />
              Install in Webflow
            </Button>
          ) : null}
        </div>
      </div>
      <div className="divide-y divide-border border border-border">
        {installed.map((font) => (
          <FontRow key={`installed-${font.family}`} font={font} status="detected" />
        ))}
        {missing.map((font) => (
          <FontRow key={`missing-${font.family}`} font={font} status="missing" />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Webflow does not expose a font-upload API. Click &quot;Install in Webflow&quot; to open Site settings.
      </p>
    </section>
  );
}

function FontRow({
  font,
  status,
}: {
  font: MasterCollectionPackage["fonts"][number];
  status: "detected" | "missing";
}) {
  return (
    <div className="space-y-1 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{font.family}</span>
        <span className={cn("text-[10px] uppercase", status === "detected" ? "text-emerald-600" : "text-amber-600")}>
          {status}
        </span>
      </div>
      <div className="text-muted-foreground">
        {[font.weights?.join(", "), font.styles?.join(", ")].filter(Boolean).join(" / ")}
      </div>
      {font.installNote ? <div className="text-muted-foreground">{font.installNote}</div> : null}
    </div>
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

function summarizeAssetProgress(
  packageData: MasterCollectionPackage,
  uploadProgress: Record<string, AssetUploadProgress>,
  uploadedAssets: UploadedWebflowAsset[],
) {
  const total = packageData.assets.length;
  if (total === 0) {
    return { total, completedCount: 0, failedCount: 0, percent: 100 };
  }

  const uploadedKeys = new Set(uploadedAssets.map((asset) => asset.packageAssetKey));
  const failedCount = packageData.assets.filter((asset) => uploadProgress[asset.key]?.status === "failed").length;
  const completedCount = packageData.assets.filter((asset) => uploadedKeys.has(asset.key)).length;
  const percent = Math.round((completedCount / total) * 100);

  return { total, completedCount, failedCount, percent };
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

function buildLaneAAssetMessage(
  packageData: MasterCollectionPackage,
  uploadProgress: Record<string, AssetUploadProgress>,
  uploadedAssets: UploadedWebflowAsset[],
  canCopy: boolean,
): string {
  if (packageData.assets.length === 0) {
    return "No images need importing.";
  }

  const summary = summarizeAssetProgress(packageData, uploadProgress, uploadedAssets);
  const requiredAssetsReady = areRequiredAssetsReady(packageData, uploadedAssets);
  if (summary.failedCount > 0) {
    return requiredAssetsReady
      ? `${summary.failedCount} optional image upload failed. Required images are ready in Webflow.`
      : `${summary.failedCount} image upload failed.`;
  }

  if (canCopy) {
    return "All images ready in Webflow.";
  }

  if (summary.completedCount === 0) {
    return `Preparing ${packageData.assets.length} image(s)...`;
  }

  return `Preparing images: ${summary.completedCount}/${packageData.assets.length}`;
}
