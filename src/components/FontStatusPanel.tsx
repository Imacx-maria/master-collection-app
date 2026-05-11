import { CheckCircle2, Info, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MasterCollectionPackage } from "@/lib/package/types";
import { cn } from "@/lib/utils";
import type { FontDetectionResult } from "@/lib/webflow/types";

export type FontStatusPhase = "pre-paste" | "post-paste";

export function FontStatusPanel({
  packageData,
  fontScan,
  checking = false,
  phase = "pre-paste",
  onRecheckFonts,
}: {
  packageData: MasterCollectionPackage;
  fontScan: FontDetectionResult | null;
  checking?: boolean;
  phase?: FontStatusPhase;
  onRecheckFonts: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const requiredFonts = packageData.fonts.filter((font) => font.required);
  const missing = fontScan?.missing ?? (checking ? [] : requiredFonts);
  const installed = fontScan?.installed ?? [];
  const unavailable = fontScan?.source === "unavailable";
  const hasNoRequiredFonts = requiredFonts.length === 0;
  const allDetected = !hasNoRequiredFonts && Boolean(fontScan) && !unavailable && missing.length === 0;
  const hasUndetectedFonts = !hasNoRequiredFonts && Boolean(fontScan) && missing.length > 0;
  const isPostPaste = phase === "post-paste";

  let title = "Checking fonts...";
  let body = "";
  let tone: "ok" | "warn" | "muted" = "muted";

  if (hasNoRequiredFonts) {
    title = "No required fonts";
    body = "This payload does not require custom fonts.";
    tone = "ok";
  } else if (allDetected) {
    title = "Fonts detected";
    body = "All required font families were detected in the current Webflow site.";
    tone = "ok";
  } else if (unavailable) {
    title = "Font scan unavailable";
    body = "The Designer API could not scan styles. Verify required fonts in Site Settings → Fonts.";
    tone = "warn";
  } else if (hasUndetectedFonts && isPostPaste) {
    title = "Required fonts not detected after paste";
    body = "Even after pasting, the Designer API can't see these fonts in any style. Open Site Settings → Fonts and confirm they're installed.";
    tone = "warn";
  } else if (hasUndetectedFonts && !isPostPaste) {
    title = "Required fonts — verify after paste";
    body = "The Designer API only sees fonts that are already applied to a style. After you paste into the Webflow canvas, click Re-check fonts to confirm.";
    tone = "muted";
  } else if (!checking) {
    title = "Required fonts";
    body = "Verify these are installed in Site Settings → Fonts.";
    tone = "muted";
  }

  const showRecheck = !hasNoRequiredFonts && !checking;

  return (
    <section
      className={cn(
        "space-y-2 border p-3 text-xs",
        tone === "ok"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : tone === "warn"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border bg-muted text-muted-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {tone === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-[10px] opacity-80">{body}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowHelp((current) => !current)} aria-label="Font install instructions">
            <Info className="h-3.5 w-3.5" />
          </Button>
          {showRecheck ? (
            <Button type="button" variant="outline" size="sm" onClick={onRecheckFonts}>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-check fonts
            </Button>
          ) : null}
        </div>
      </div>

      {requiredFonts.length > 0 ? (
        <div className="divide-y divide-border border border-border bg-background/70">
          {requiredFonts.map((font) => {
            const isInstalled = installed.some((item) => item.family === font.family);
            const isMissing = missing.some((item) => item.family === font.family);
            const label = labelFor({ isInstalled, isMissing, isPostPaste, checking });
            const labelTone = isInstalled
              ? "text-emerald-600"
              : isMissing && isPostPaste
                ? "text-amber-600"
                : "text-muted-foreground";
            return (
              <div key={font.family} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">{formatFontRequirement(font)}</span>
                <span className={cn("text-[10px] uppercase", labelTone)}>{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {showHelp ? (
        <div className="border border-border bg-background/70 p-3 text-[10px] leading-relaxed text-muted-foreground">
          The Designer API can only see fonts that a style references. To verify a font, open Webflow Site Settings → Fonts and confirm the family is installed; if it is, paste the package, then click Re-check fonts so the freshly pasted styles surface the fonts to the scan.
        </div>
      ) : null}
    </section>
  );
}

function labelFor({
  isInstalled,
  isMissing,
  isPostPaste,
  checking,
}: {
  isInstalled: boolean;
  isMissing: boolean;
  isPostPaste: boolean;
  checking: boolean;
}): string {
  if (isInstalled) return "detected";
  if (checking) return "checking";
  if (isMissing) return isPostPaste ? "not detected" : "pending paste";
  return "pending";
}

export function formatFontRequirement(font: MasterCollectionPackage["fonts"][number]): string {
  const details = [
    font.weights?.length ? `weights ${font.weights.join(", ")}` : "",
    font.styles?.length ? `styles ${font.styles.join(", ")}` : "",
  ].filter(Boolean);
  return details.length ? `${font.family} - ${details.join(" - ")}` : font.family;
}
