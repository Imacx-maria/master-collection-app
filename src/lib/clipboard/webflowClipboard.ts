export async function copyXscpDataToClipboard(xscpData: unknown): Promise<void> {
  const json = JSON.stringify(xscpData);

  const copiedWithEvent = copyJsonWithClipboardEvent(json);
  if (copiedWithEvent) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(json);
    return;
  }

  throw new Error("Clipboard copy is not available in this browser.");
}

function copyJsonWithClipboardEvent(json: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  let copied = false;
  const copyHandler = (event: ClipboardEvent) => {
    event.clipboardData?.setData("application/json", json);
    event.clipboardData?.setData("text/plain", json);
    event.preventDefault();
    copied = true;
  };

  document.addEventListener("copy", copyHandler);
  try {
    document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", copyHandler);
  }

  return copied;
}
