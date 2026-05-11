import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MasterCollectionPackage, SimpleFontRequirement } from "@/lib/package/types";
import { cn } from "@/lib/utils";

export function PrepastePreflightPanel({
  packageData,
  existingStyleCount,
  fontsConfirmed,
  pageStateConfirmed,
  onFontsConfirmedChange,
  onPageStateConfirmedChange,
}: {
  packageData: MasterCollectionPackage;
  existingStyleCount: number | null;
  fontsConfirmed: boolean;
  pageStateConfirmed: boolean;
  onFontsConfirmedChange: (confirmed: boolean) => void;
  onPageStateConfirmedChange: (confirmed: boolean) => void;
}) {
  const requiredFonts = packageData.fonts.filter((font) => font.required);
  const hasFonts = requiredFonts.length > 0;
  const hasExistingStyles = typeof existingStyleCount === "number" && existingStyleCount > 0;

  return (
    <section className="space-y-3 border border-border bg-background p-3 text-xs">
      <header className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
        <h3 className="text-sm font-medium">Before you paste</h3>
      </header>

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <input
            id="preflight-fonts"
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
            checked={fontsConfirmed}
            onChange={(event) => onFontsConfirmedChange(event.target.checked)}
            disabled={!hasFonts}
          />
          <label htmlFor="preflight-fonts" className={cn("flex-1 leading-relaxed", !hasFonts && "text-muted-foreground")}>
            <div className="font-medium text-foreground">
              {hasFonts
                ? "I installed the required fonts (with the right weights and styles) in Site Settings → Fonts."
                : "No required fonts for this package."}
            </div>
            {hasFonts ? <FontList fonts={requiredFonts} /> : null}
          </label>
        </div>

        <div className="flex items-start gap-2">
          <input
            id="preflight-page"
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
            checked={pageStateConfirmed}
            onChange={(event) => onPageStateConfirmedChange(event.target.checked)}
          />
          <label htmlFor="preflight-page" className="flex-1 leading-relaxed">
            <div className="font-medium text-foreground">
              I'm pasting into a fresh Webflow page (or I accept that existing styles and interactions will be duplicated, not merged).
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {hasExistingStyles
                ? `This site currently has ${existingStyleCount} existing class${existingStyleCount === 1 ? "" : "es"}. Webflow's paste will create duplicates (e.g. \"button-2\") for any name collisions. For cleanest results, use a brand-new blank page.`
                : "Webflow's paste duplicates classes and interactions when names already exist on the page. We can't merge them — that's a Webflow limitation."}
            </div>
          </label>
        </div>
      </div>

      {fontsConfirmed && pageStateConfirmed ? (
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          <span className="text-[10px]">Preflight confirmed — Copy to Webflow is enabled below.</span>
        </div>
      ) : null}
    </section>
  );
}

function FontList({ fonts }: { fonts: SimpleFontRequirement[] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
      {fonts.map((font) => (
        <li key={font.family} className="font-mono">
          {formatFontLine(font)}
        </li>
      ))}
    </ul>
  );
}

function formatFontLine(font: SimpleFontRequirement): string {
  const parts: string[] = [font.family];
  if (font.weights?.length) parts.push(`weights ${font.weights.join(", ")}`);
  if (font.styles?.length) parts.push(`styles ${font.styles.join(", ")}`);
  return parts.join(" — ");
}
