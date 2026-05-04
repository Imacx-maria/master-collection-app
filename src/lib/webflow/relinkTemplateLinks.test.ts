import { afterEach, describe, expect, it, vi } from "vitest";
import { relinkTemplateLinks } from "./relinkTemplateLinks";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockEl = {
  id: string;
  type: string;
  getAllCustomAttributes: ReturnType<typeof vi.fn>;
  getParentElement: ReturnType<typeof vi.fn>;
  getCollectionId: ReturnType<typeof vi.fn>;
  setSettings: ReturnType<typeof vi.fn>;
};

function makeEl(overrides: Partial<MockEl> = {}): MockEl {
  return {
    id: "el-" + Math.random().toString(36).slice(2),
    type: "Unknown",
    getAllCustomAttributes: vi.fn().mockResolvedValue([]),
    getParentElement: vi.fn().mockResolvedValue(null),
    getCollectionId: vi.fn().mockResolvedValue(null),
    setSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeWebflow(elements: MockEl[], pages: { id: string; getCollectionId: ReturnType<typeof vi.fn> }[]) {
  return {
    getAllElements: vi.fn().mockResolvedValue(elements),
    getAllPages: vi.fn().mockResolvedValue(pages),
  };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).webflow;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("relinkTemplateLinks", () => {
  it("test 1 — happy path: relinks a tagged Link inside a DynamoItem/DynamoWrapper to the matching Collection Template Page", async () => {
    const dWrapper = makeEl({ type: "DynamoWrapper", getCollectionId: vi.fn().mockResolvedValue("col-1") });
    const dItem = makeEl({ type: "DynamoItem", getParentElement: vi.fn().mockResolvedValue(dWrapper) });
    const templatePage = { id: "page-1", getCollectionId: vi.fn().mockResolvedValue("col-1") };
    const linkEl = makeEl({
      id: "link-1",
      type: "Link",
      getAllCustomAttributes: vi.fn().mockResolvedValue([{ name: "data-fb-link-role", value: "template-page" }]),
      getParentElement: vi.fn().mockResolvedValue(dItem),
    });

    (globalThis as Record<string, unknown>).webflow = makeWebflow([linkEl], [templatePage]);

    const result = await relinkTemplateLinks();

    expect(result.relinked).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(linkEl.setSettings).toHaveBeenCalledWith("page", templatePage);
  });

  it("test 2 — skipped: DynamoWrapper not Collection-bound (getCollectionId returns null)", async () => {
    const dWrapper = makeEl({ type: "DynamoWrapper", getCollectionId: vi.fn().mockResolvedValue(null) });
    const dItem = makeEl({ type: "DynamoItem", getParentElement: vi.fn().mockResolvedValue(dWrapper) });
    const linkEl = makeEl({
      type: "Link",
      getAllCustomAttributes: vi.fn().mockResolvedValue([{ name: "data-fb-link-role", value: "template-page" }]),
      getParentElement: vi.fn().mockResolvedValue(dItem),
    });

    (globalThis as Record<string, unknown>).webflow = makeWebflow([linkEl], []);

    const result = await relinkTemplateLinks();

    expect(result.skipped).toBe(1);
    expect(result.relinked).toBe(0);
    expect(result.failed).toBe(0);
    expect(linkEl.setSettings).not.toHaveBeenCalled();
  });

  it("test 3 — failed: Collection bound but no matching Collection Template Page", async () => {
    const dWrapper = makeEl({ type: "DynamoWrapper", getCollectionId: vi.fn().mockResolvedValue("col-2") });
    const dItem = makeEl({ type: "DynamoItem", getParentElement: vi.fn().mockResolvedValue(dWrapper) });
    const linkEl = makeEl({
      type: "Link",
      getAllCustomAttributes: vi.fn().mockResolvedValue([{ name: "data-fb-link-role", value: "template-page" }]),
      getParentElement: vi.fn().mockResolvedValue(dItem),
    });
    const wrongPage = { id: "page-x", getCollectionId: vi.fn().mockResolvedValue("col-99") };

    (globalThis as Record<string, unknown>).webflow = makeWebflow([linkEl], [wrongPage]);

    const result = await relinkTemplateLinks();

    expect(result.failed).toBe(1);
    expect(result.relinked).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("test 4 — ignores untagged Link elements", async () => {
    const linkEl = makeEl({
      type: "Link",
      getAllCustomAttributes: vi.fn().mockResolvedValue([]),
    });

    (globalThis as Record<string, unknown>).webflow = makeWebflow([linkEl], []);

    const result = await relinkTemplateLinks();

    expect(result.relinked).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("test 5 — failed: tagged Link has no DynamoItem/DynamoWrapper ancestor (getParentElement returns null)", async () => {
    const linkEl = makeEl({
      type: "Link",
      getAllCustomAttributes: vi.fn().mockResolvedValue([{ name: "data-fb-link-role", value: "template-page" }]),
      getParentElement: vi.fn().mockResolvedValue(null),
    });

    (globalThis as Record<string, unknown>).webflow = makeWebflow([linkEl], []);

    const result = await relinkTemplateLinks();

    expect(result.failed).toBe(1);
    expect(result.details[0].reason).toMatch(/ancestor/);
  });
});
