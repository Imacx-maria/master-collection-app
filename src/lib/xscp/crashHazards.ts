export function collectCrashHazardsFromXscpData(xscpData: unknown): string[] {
  const hazards = new Set<string>();
  const payload = isRecord(xscpData) && isRecord(xscpData.payload) ? xscpData.payload : null;
  if (!payload) return [];

  if (Array.isArray(payload.assets) && payload.assets.length > 0) {
    hazards.add("payload.assets[] populated");
  }

  const rootCount = countXscpRoots(payload.nodes);
  if (rootCount > 1) {
    hazards.add(`payload.nodes has ${rootCount} root nodes`);
  }

  const ix3 = isRecord(payload.ix3) ? payload.ix3 : null;
  for (const collectionKey of ["interactions", "timelines"] as const) {
    const collection = Array.isArray(ix3?.[collectionKey]) ? ix3[collectionKey] : [];
    for (const entry of collection as Array<Record<string, unknown>>) {
      if (entry?.pageId === "__MASTER_COLLECTION_CURRENT_PAGE_ID__") {
        hazards.add("IX3 page placeholder remains");
      }
    }
  }

  walk(payload, (value) => {
    if (typeof value !== "string") return;
    if (/@font-face/i.test(value)) hazards.add("HtmlEmbed contains @font-face");
    if (/Webflow\.require\((['"])ix2\1\)\.init\s*\(/i.test(value)) hazards.add("HtmlEmbed contains inline ix2 init script");
    if (/selectorGuids/i.test(value)) hazards.add("HtmlEmbed contains selectorGuids");
  });

  return Array.from(hazards).sort();
}

function countXscpRoots(nodes: unknown): number {
  if (!Array.isArray(nodes)) return 0;
  const referenced = new Set<string>();
  const ids = new Set<string>();

  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (typeof node._id === "string") ids.add(node._id);
    const children = Array.isArray(node.children) ? node.children : [];
    for (const childId of children) {
      if (typeof childId === "string") referenced.add(childId);
    }
  }

  if (ids.size === 0) return 0;
  let roots = 0;
  for (const id of ids) {
    if (!referenced.has(id)) roots += 1;
  }
  return roots;
}

function walk(value: unknown, visit: (value: unknown) => void) {
  visit(value);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  Object.values(value).forEach((nextValue) => walk(nextValue, visit));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
