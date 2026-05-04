import { beforeEach, describe, expect, it, vi } from "vitest";
import { readConverterPayloadFromClipboard } from "./readConverterClipboard";

const validPayload = JSON.stringify({
  type: "@webflow/XscpData",
  payload: {
    assets: [],
    nodes: [],
  },
});

describe("readConverterPayloadFromClipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a valid payload when clipboard text is converter JSON", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: vi.fn().mockResolvedValue(validPayload),
      },
    });

    const result = await readConverterPayloadFromClipboard();

    expect(result.status).toBe("valid");
    expect(result.payload?.kind).toBe("single");
  });

  it("returns a valid multi-page payload from converter clipboard JSON", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: vi.fn().mockResolvedValue(
          JSON.stringify({
            type: "flowbridge/app-multipage-payload",
            pages: [
              {
                name: "Home",
                path: "index.html",
                slug: "/",
                sourcePageId: "fb-source-page-index",
                xscpData: JSON.parse(validPayload),
              },
            ],
          }),
        ),
      },
    });

    const result = await readConverterPayloadFromClipboard();

    expect(result.status).toBe("valid");
    expect(result.payload?.kind).toBe("multi");
    expect(result.message).toMatch(/multi-page payload with 1 page/i);
  });

  it("returns invalid without throwing when clipboard text is not converter JSON", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: vi.fn().mockResolvedValue("hello"),
      },
    });

    const result = await readConverterPayloadFromClipboard();

    expect(result.status).toBe("invalid");
    expect(result.payload).toBeUndefined();
  });
});
