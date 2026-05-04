import { parseConverterPayloadJson, type ConverterPayload } from "@/lib/converter/parseConverterPayload";

export interface ClipboardDetectionResult {
  status: "valid" | "empty" | "invalid" | "unavailable";
  payload?: ConverterPayload;
  rawText?: string;
  message: string;
}

export async function readConverterPayloadFromClipboard(): Promise<ClipboardDetectionResult> {
  if (!navigator.clipboard?.readText) {
    return {
      status: "unavailable",
      message: "Clipboard read is not available in this Webflow iframe. Copy from the converter, then try again.",
    };
  }

  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Clipboard permission was denied.",
    };
  }

  if (!text.trim()) {
    return {
      status: "empty",
      rawText: text,
      message: "Clipboard is empty.",
    };
  }

  try {
    const payload = parseConverterPayloadJson(text);
    return {
      status: "valid",
      payload,
      rawText: text,
      message:
        payload.kind === "multi"
          ? `Detected Master Collection multi-page payload with ${payload.pageCount} page(s).`
          : "Detected one @webflow/XscpData payload.",
    };
  } catch (error) {
    return {
      status: "invalid",
      rawText: text,
      message: error instanceof Error ? error.message : "Clipboard is not a Master Collection converter payload.",
    };
  }
}
