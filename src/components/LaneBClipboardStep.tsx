import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parseConverterPayloadJson, type MultiPageConverterPayload } from "@/lib/converter/parseConverterPayload";
import { cn } from "@/lib/utils";

export function LaneBClipboardStep({
  onDetected,
  onError,
}: {
  onDetected: (payload: MultiPageConverterPayload) => void;
  onError: (message: string | null) => void;
}) {
  const [detectedPayload, setDetectedPayload] = useState<MultiPageConverterPayload | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  function handleText(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setDetectedPayload(null);
      setLocalMessage(null);
      setIsValid(false);
      onError(null);
      return;
    }

    try {
      const parsed = parseConverterPayloadJson(trimmed);
      if (parsed.kind !== "multi") {
        const message = "pasting invalid — paste a FlowBridge multi-page payload here.";
        setDetectedPayload(null);
        setLocalMessage(message);
        setIsValid(false);
        onError(message);
        return;
      }

      setDetectedPayload(parsed);
      setLocalMessage("Paste detected. Ready to continue.");
      setIsValid(true);
      onError(null);
    } catch (error) {
      const message = `pasting invalid — ${error instanceof Error ? error.message : "not a valid FlowBridge payload."}`;
      setDetectedPayload(null);
      setLocalMessage(message);
      setIsValid(false);
      onError(message);
    }
  }

  return (
    <div className="space-y-3 text-xs">
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
        aria-label="Lane B payload paste target"
      >
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">Paste payload here</div>
          <div className="text-xs text-muted-foreground">Copy the FlowBridge multi-page payload from the converter, then press Ctrl+V here.</div>
        </div>
      </div>

      {localMessage ? (
        <section
          className={cn(
            "border p-3",
            isValid
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
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
