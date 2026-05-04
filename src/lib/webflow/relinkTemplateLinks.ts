// relinkTemplateLinks.ts
// Post-paste step: binds Link elements tagged data-fb-link-role="template-page"
// to their Collection Template Page via the Webflow Designer API.

interface CustomAttribute {
  name: string;
  value: string;
}

interface Page {
  id: string;
  getCollectionId(): Promise<string | null>;
}

interface AnyElement {
  id: string;
  type: string;
  getAllCustomAttributes(): Promise<CustomAttribute[]>;
  getParentElement(): Promise<AnyElement | null>;
  getCollectionId(): Promise<string | null>;
  setSettings(mode: string, target: Page): Promise<void>;
}

interface WebflowGlobal {
  getAllElements(): Promise<AnyElement[]>;
  getAllPages(): Promise<Page[]>;
}

function getWebflowGlobal(): WebflowGlobal | undefined {
  return (globalThis as unknown as { webflow?: WebflowGlobal }).webflow;
}

export interface RelinkDetail {
  elementId: string;
  status: "relinked" | "skipped" | "failed";
  collectionId?: string;
  templatePageId?: string;
  reason?: string;
}

export interface RelinkResult {
  relinked: number;
  skipped: number;
  failed: number;
  details: RelinkDetail[];
}

export async function relinkTemplateLinks(): Promise<RelinkResult> {
  const wf = getWebflowGlobal();
  if (!wf) throw new Error("webflow global not available");

  const elements = await wf.getAllElements();
  const pages = await wf.getAllPages();

  // Filter for Link elements tagged with the FlowBridge template-page signal
  const candidates: AnyElement[] = [];
  for (const el of elements) {
    if (el.type !== "Link") continue;
    let attrs: CustomAttribute[] = [];
    try {
      attrs = await el.getAllCustomAttributes();
    } catch {
      continue;
    }
    const isTagged = attrs.some(
      (a) => a.name === "data-fb-link-role" && a.value === "template-page",
    );
    if (isTagged) candidates.push(el);
  }

  const details: RelinkDetail[] = [];

  for (const candidate of candidates) {
    // Walk ancestors until we find DynamoItem or DynamoWrapper
    let cur: AnyElement | null = null;
    try {
      cur = await candidate.getParentElement();
      while (cur && cur.type !== "DynamoItem" && cur.type !== "DynamoWrapper") {
        cur = await cur.getParentElement();
      }
    } catch (e) {
      details.push({ elementId: candidate.id, status: "failed", reason: String(e) });
      continue;
    }

    if (!cur) {
      details.push({
        elementId: candidate.id,
        status: "failed",
        reason: "no DynamoItem/DynamoWrapper ancestor found",
      });
      continue;
    }

    // If we landed on DynamoItem, step up one more level to the DynamoWrapper
    let wrapper: AnyElement = cur;
    if (wrapper.type === "DynamoItem") {
      try {
        const parent = await wrapper.getParentElement();
        if (parent) wrapper = parent;
      } catch (e) {
        details.push({ elementId: candidate.id, status: "failed", reason: String(e) });
        continue;
      }
    }

    // Read the bound collection ID from the wrapper
    let collId: string | null = null;
    try {
      collId = await wrapper.getCollectionId();
    } catch (e) {
      details.push({ elementId: candidate.id, status: "failed", reason: String(e) });
      continue;
    }

    if (!collId) {
      details.push({
        elementId: candidate.id,
        status: "skipped",
        reason: "parent DynamoWrapper not Collection-bound — bind Collections first",
      });
      continue;
    }

    // Find the matching Collection Template Page
    let templatePage: Page | undefined;
    for (const page of pages) {
      try {
        const cid = await page.getCollectionId();
        if (cid === collId) {
          templatePage = page;
          break;
        }
      } catch {
        // Skip pages that throw — continue looking
      }
    }

    if (!templatePage) {
      details.push({
        elementId: candidate.id,
        status: "failed",
        collectionId: collId,
        reason: `no Collection Template Page for collection ${collId}`,
      });
      continue;
    }

    // Relink
    try {
      await (candidate as unknown as { setSettings(mode: string, target: Page): Promise<void> }).setSettings(
        "page",
        templatePage,
      );
      details.push({
        elementId: candidate.id,
        status: "relinked",
        collectionId: collId,
        templatePageId: templatePage.id,
      });
    } catch (e) {
      details.push({
        elementId: candidate.id,
        status: "failed",
        collectionId: collId,
        reason: String(e),
      });
    }
  }

  const result: RelinkResult = {
    relinked: details.filter((d) => d.status === "relinked").length,
    skipped: details.filter((d) => d.status === "skipped").length,
    failed: details.filter((d) => d.status === "failed").length,
    details,
  };

  console.info("[relinkTemplateLinks]", result);
  return result;
}
