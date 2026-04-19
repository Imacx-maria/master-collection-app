import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Moon, PackageCheck, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { copyXscpDataToClipboard } from "@/lib/clipboard/webflowClipboard";
import { uploadPackageAssets, type AssetUploadProgress } from "@/lib/assets/upload";
import { resolveInstallCode } from "@/lib/package/resolve";
import type { MasterCollectionPackage } from "@/lib/package/types";
import { createWebflowAdapter, previewTargetContext } from "@/lib/webflow/adapter";
import type { UploadedWebflowAsset, WebflowTargetContext } from "@/lib/webflow/types";
import { patchXscpData } from "@/lib/xscp/patch";
import { cn } from "@/lib/utils";

const APP_VERSION = "0.1.0";
const THEME_KEY = "master-collection-theme";

type Theme = "light" | "dark";
type StepId = "code" | "target" | "fonts" | "assets" | "clipboard" | "done";

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "code", label: "Code" },
  { id: "target", label: "Target" },
  { id: "fonts", label: "Fonts" },
  { id: "assets", label: "Assets" },
  { id: "clipboard", label: "Paste" },
  { id: "done", label: "Done" },
];

function getInitialTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const adapter = useMemo(() => createWebflowAdapter(), []);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [step, setStep] = useState<StepId>("code");
  const [packageData, setPackageData] = useState<MasterCollectionPackage | null>(null);
  const [targetContext, setTargetContext] = useState<WebflowTargetContext | null>(null);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedWebflowAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, AssetUploadProgress>>({});
  const [patchedXscpData, setPatchedXscpData] = useState<unknown | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  async function handleResolveInstallCode(code: string) {
    setError(null);
    setStatus("Resolving install code...");
    const resolvedPackage = await resolveInstallCode(code);
    setPackageData(resolvedPackage);
    setTargetContext(null);
    setUploadedAssets([]);
    setPatchedXscpData(null);
    setUploadProgress({});
    setStatus(`Loaded ${resolvedPackage.name} v${resolvedPackage.version}`);
    setStep("target");
  }

  async function handleDetectTarget() {
    setError(null);
    setStatus("Reading the current Webflow site and page...");
    const context = await adapter.getTargetContext();
    setTargetContext(context);
    setStatus(`Target ready: ${context.siteName} / ${context.pageName}`);
  }

  function handleUsePreviewTarget() {
    setError(null);
    setTargetContext(previewTargetContext);
    setStatus("Browser preview target enabled. Webflow upload still needs Designer verification.");
  }

  async function handlePrepareAssets() {
    if (!packageData || !targetContext) return;

    setError(null);
    setStatus("Preparing package assets...");
    setUploadProgress({});

    const uploaded = await uploadPackageAssets(packageData, adapter, (progress) => {
      setUploadProgress((current) => ({
        ...current,
        [progress.key]: progress,
      }));
    });

    const patched = patchXscpData({
      packageData,
      targetPageId: targetContext.pageId,
      uploadedAssets: uploaded,
    });

    setUploadedAssets(uploaded);
    setPatchedXscpData(patched);
    setStatus("Package payload is ready for Webflow paste.");
    setStep("clipboard");
  }

  async function handleCopy() {
    if (!patchedXscpData) return;
    setError(null);
    setStatus("Copying package payload...");
    await copyXscpDataToClipboard(patchedXscpData);
    setStatus("Copied. Paste in the Webflow Designer canvas.");
    setStep("done");
  }

  function runAction(action: () => Promise<void>) {
    action().catch((caught) => {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    });
  }

  const activeStepIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Master Collection</div>
          <div className="text-[10px] text-muted-foreground">Webflow Installer v{APP_VERSION}</div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </header>

      <main className="mt-4 space-y-3">
        <StepIndicator activeStepIndex={activeStepIndex} />

        {status ? <StatusMessage tone="success" message={status} /> : null}
        {error ? <StatusMessage tone="error" message={error} /> : null}

        {step === "code" ? (
          <InstallCodeStep onSubmit={(code) => runAction(() => handleResolveInstallCode(code))} />
        ) : null}

        {step === "target" && packageData ? (
          <TargetCheckStep
            packageData={packageData}
            targetContext={targetContext}
            isDesignerAvailable={adapter.isAvailable()}
            onDetect={() => runAction(handleDetectTarget)}
            onUsePreview={handleUsePreviewTarget}
            onContinue={() => setStep("fonts")}
            onBack={() => setStep("code")}
          />
        ) : null}

        {step === "fonts" && packageData ? (
          <FontChecklistStep
            packageData={packageData}
            onContinue={() => setStep("assets")}
            onBack={() => setStep("target")}
          />
        ) : null}

        {step === "assets" && packageData && targetContext ? (
          <AssetUploadStep
            packageData={packageData}
            uploadProgress={uploadProgress}
            uploadedAssets={uploadedAssets}
            onPrepare={() => runAction(handlePrepareAssets)}
            onBack={() => setStep("fonts")}
          />
        ) : null}

        {step === "clipboard" && packageData && patchedXscpData ? (
          <ClipboardStep
            packageData={packageData}
            onCopy={() => runAction(handleCopy)}
            onBack={() => setStep("assets")}
          />
        ) : null}

        {step === "done" && packageData && targetContext ? (
          <DoneStep
            packageData={packageData}
            targetContext={targetContext}
            uploadedAssets={uploadedAssets}
            onRestart={() => {
              setStep("code");
              setPackageData(null);
              setTargetContext(null);
              setUploadedAssets([]);
              setPatchedXscpData(null);
              setUploadProgress({});
              setStatus(null);
              setError(null);
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

function StepIndicator({ activeStepIndex }: { activeStepIndex: number }) {
  return (
    <div className="grid grid-cols-6 border border-border text-[10px]">
      {STEPS.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "border-r border-border px-2 py-1.5 text-center last:border-r-0",
            index <= activeStepIndex ? "bg-foreground text-background" : "bg-background text-muted-foreground",
          )}
        >
          {item.label}
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

function InstallCodeStep({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("DEMO");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter install code</CardTitle>
        <CardDescription>Use DEMO until the package API is connected.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="DEMO"
          className="h-9 w-full border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          aria-label="Install code"
        />
        <Button type="button" onClick={() => onSubmit(code)} disabled={!code.trim()}>
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function TargetCheckStep({
  packageData,
  targetContext,
  isDesignerAvailable,
  onDetect,
  onUsePreview,
  onContinue,
  onBack,
}: {
  packageData: MasterCollectionPackage;
  targetContext: WebflowTargetContext | null;
  isDesignerAvailable: boolean;
  onDetect: () => void;
  onUsePreview: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Target check</CardTitle>
        <CardDescription>{packageData.name} will install into the current Webflow page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {targetContext ? (
          <div className="space-y-1 border border-border bg-muted p-3 text-xs">
            <div className="font-medium">{targetContext.siteName}</div>
            <div className="text-muted-foreground">{targetContext.pageName}</div>
            <div className="text-[10px] uppercase text-muted-foreground">{targetContext.mode}</div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            The app reads the site and page from Webflow Designer. No site ID or token is needed.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onDetect}>
            Detect Webflow target
          </Button>
          {!isDesignerAvailable ? (
            <Button type="button" variant="outline" onClick={onUsePreview}>
              Preview in browser
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="button" variant="outline" onClick={onContinue} disabled={!targetContext}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FontChecklistStep({
  packageData,
  onContinue,
  onBack,
}: {
  packageData: MasterCollectionPackage;
  onContinue: () => void;
  onBack: () => void;
}) {
  const hasRequiredFonts = packageData.fonts.some((font) => font.required);
  const [confirmed, setConfirmed] = useState(!hasRequiredFonts);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Font checklist</CardTitle>
        <CardDescription>Install required fonts in Webflow before pasting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y divide-border border border-border">
          {packageData.fonts.map((font) => (
            <div key={font.family} className="space-y-1 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{font.family}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{font.required ? "Required" : "Optional"}</span>
              </div>
              <div className="text-muted-foreground">
                {[font.weights?.join(", "), font.styles?.join(", ")].filter(Boolean).join(" / ")}
              </div>
              {font.installNote ? <div className="text-muted-foreground">{font.installNote}</div> : null}
            </div>
          ))}
        </div>
        {hasRequiredFonts ? (
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>I installed the required fonts in this Webflow site.</span>
          </label>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" onClick={onContinue} disabled={!confirmed}>
            Continue
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetUploadStep({
  packageData,
  uploadProgress,
  uploadedAssets,
  onPrepare,
  onBack,
}: {
  packageData: MasterCollectionPackage;
  uploadProgress: Record<string, AssetUploadProgress>;
  uploadedAssets: UploadedWebflowAsset[];
  onPrepare: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prepare images</CardTitle>
        <CardDescription>Assets upload into the current Webflow site before paste.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y divide-border border border-border">
          {packageData.assets.map((asset) => {
            const progress = uploadProgress[asset.key];
            const uploaded = uploadedAssets.find((item) => item.packageAssetKey === asset.key);
            return (
              <div key={asset.key} className="space-y-1 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{asset.fileName}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {progress?.status ?? (uploaded ? "uploaded" : "pending")}
                  </span>
                </div>
                <div className="text-muted-foreground">{progress?.message ?? asset.url.slice(0, 80)}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={onPrepare}>
            Upload and patch
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ClipboardStep({
  packageData,
  onCopy,
  onBack,
}: {
  packageData: MasterCollectionPackage;
  onCopy: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste into Webflow</CardTitle>
        <CardDescription>{packageData.name} is patched for the current page.</CardDescription>
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

function DoneStep({
  packageData,
  targetContext,
  uploadedAssets,
  onRestart,
}: {
  packageData: MasterCollectionPackage;
  targetContext: WebflowTargetContext;
  uploadedAssets: UploadedWebflowAsset[];
  onRestart: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready in Webflow</CardTitle>
        <CardDescription>Paste was copied for {targetContext.pageName}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-xs">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-3.5 w-3.5" />
            <span>{packageData.name} v{packageData.version}</span>
          </div>
          <div className="text-muted-foreground">{uploadedAssets.length} asset prepared.</div>
          {packageData.warnings?.map((warning) => (
            <div key={warning.code} className="border border-border bg-muted p-2 text-muted-foreground">
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
