import { afterEach, describe, expect, it, vi } from "vitest";
import { copyXscpDataToClipboard } from "./webflowClipboard";

describe("copyXscpDataToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers application/json clipboard writes when ClipboardItem is available", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write, writeText: vi.fn() } });
    // @ts-expect-error test shim
    globalThis.ClipboardItem = class ClipboardItem {
      constructor(public data: Record<string, Blob>) {}
    };

    const result = await copyXscpDataToClipboard({ type: "@webflow/XscpData", payload: { assets: [] } });

    expect(write).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("application-json");
  });

  it("returns a degraded result when only writeText succeeds", async () => {
    Object.assign(navigator, {
      clipboard: {
        write: vi.fn().mockRejectedValue(new Error("no rich clipboard")),
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });

    const result = await copyXscpDataToClipboard({ type: "@webflow/XscpData", payload: { assets: [] } });

    expect(result.mode).toBe("text-only");
  });
});
