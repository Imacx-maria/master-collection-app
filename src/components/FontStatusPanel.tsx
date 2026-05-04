import { CheckCircle2, Info, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MasterCollectionPackage } from "@/lib/package/types";
import { cn } from "@/lib/utils";
import type { FontDetectionResult } from "@/lib/webflow/types";

export function FontStatusPanel({
  packageData,
  fontScan,
  checking = false,
  onRecheckFonts,
}: {
  packageData: MasterCollectionPackage;
  fontScan: FontDetectionResult | null;
  checking?: boolean;
  onRecheckFonts: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const requiredFonts = packageData.fonts.filter((font) => font.required);
  const missing = fontScan?.missing ?? (checking ? [] : requiredFonts);
  const installed = fontScan?.installed ?? [];
  const unavailable = fontScan?.source === "unavailable";
  const allInstalled = requiredFonts.length > 0 && Boolean(fontScan) && !unavailable && missing.length === 0;
  const hasNoRequiredFonts = requiredFonts.length === 0;

  let title = "Checking fonts...";
  let tone: "ok" | "warn" | "muted" = "muted";
  if (hasNoRequiredFonts) {
    title = "No required fonts";
    tone = "ok";
  } else if (allInstalled) {
    title = "Fonts installed";
    tone = "ok";
  } else if (!checking) {
    title = "Install required fonts";
    tone = "warn";
  }

  const showRecheck = !hasNoRequiredFonts && !checking && (!fontScan || missing.length > 0 || unavailable);

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
            <p className="text-[10px] opacity-80">
              {hasNoRequiredFonts
                ? "This payload does not require custom fonts."
                : allInstalled
                  ? "All required font families were detected in this Webflow site."
                  : "Install the missing fonts in Webflow, refresh the Designer, then re-check."}
            </p>
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
            return (
              <div key={font.family} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">{formatFontRequirement(font)}</span>
                <span className={cn("text-[10px] uppercase", isInstalled ? "text-emerald-600" : isMissing ? "text-amber-600" : "text-muted-foreground")}>
                  {isInstalled ? "installed" : isMissing ? "missing" : "pending"}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {showHelp ? (
        <div className="border border-border bg-background/70 p-3 text-[10px] leading-relaxed text-muted-foreground">
          Open Webflow Site Settings, go to Fonts, upload or install the listed font family, weights, and styles, return to Designer, refresh the Designer/app page, then click Re-check fonts.
        </div>
      ) : null}
    </section>
  );
}

function formatFontRequirement(font: MasterCollectionPackage["fonts"][number]): string {
  const details = [
    font.weights?.length ? `weights ${font.weights.join(", ")}` : "",
    font.styles?.length ? `styles ${font.styles.join(", ")}` : "",
  ].filter(Boolean);
  return details.length ? `${font.family} - ${details.join(" - ")}` : font.family;
}
