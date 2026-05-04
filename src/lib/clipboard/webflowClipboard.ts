export interface ClipboardCopyResult {
  mode: "application-json" | "exec-command" | "text-only";
}

export async function copyXscpDataToClipboard(xscpData: unknown): Promise<ClipboardCopyResult> {
  const json = JSON.stringify(xscpData);

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const item = new ClipboardItem({
      "application/json": new Blob([json], { type: "application/json" }),
      "text/plain": new Blob([json], { type: "text/plain" }),
    });
    try {
      await navigator.clipboard.write([item]);
      return { mode: "application-json" };
    } catch {
      // Fall through to the older strategies.
    }
  }

  const copiedWithEvent = copyJsonWithClipboardEvent(json);
  if (copiedWithEvent) {
    return { mode: "exec-command" };
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(json);
    return { mode: "text-only" };
  }

  throw new Error("Clipboard copy is not available in this browser.");
}

function copyJsonWithClipboardEvent(json: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  let copied = false;
  const scratch = document.createElement("textarea");
  scratch.value = " ";
  scratch.setAttribute("aria-hidden", "true");
  scratch.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";

  const copyHandler = (event: ClipboardEvent) => {
    event.clipboardData?.setData("application/json", json);
    event.clipboardData?.setData("text/plain", json);
    event.preventDefault();
    copied = true;
  };

  document.body.appendChild(scratch);
  scratch.focus();
  scratch.select();
  document.addEventListener("copy", copyHandler);
  try {
    document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", copyHandler);
    scratch.remove();
  }

  return copied;
}
