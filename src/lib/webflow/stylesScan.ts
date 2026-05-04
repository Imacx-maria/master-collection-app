type WebflowGlobal = {
  getAllStyles?: () => Promise<
    Array<{
      getName?: () => Promise<string>;
      remove?: () => Promise<void>;
    }>
  >;
};

function getWebflowGlobal(): WebflowGlobal | undefined {
  return (globalThis as unknown as { webflow?: WebflowGlobal }).webflow;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractPackageStyleNames(xscpData: unknown): string[] {
  if (!isRecord(xscpData) || !isRecord(xscpData.payload)) return [];
  const styles = xscpData.payload.styles;
  if (!Array.isArray(styles)) return [];

  const names: string[] = [];
  for (const style of styles) {
    if (isRecord(style) && typeof style.name === "string" && style.name.trim()) {
      names.push(style.name);
    }
  }
  return names;
}

export async function scanStyleCollisions(packageStyleNames: string[]): Promise<string[]> {
  if (packageStyleNames.length === 0) return [];
  const wf = getWebflowGlobal();
  if (!wf?.getAllStyles) return [];

  const siteStyles = await wf.getAllStyles();
  const siteNames = new Set<string>();
  for (const style of siteStyles) {
    if (!style.getName) continue;
    try {
      const name = await style.getName();
      if (typeof name === "string") siteNames.add(name);
    } catch {
      /* skip unreadable style */
    }
  }

  const packageSet = new Set(packageStyleNames);
  return Array.from(packageSet).filter((name) => siteNames.has(name));
}

export function renamePackageStyles(
  xscpData: unknown,
  collidingNames: string[],
  suffix = "-2",
): unknown {
  if (collidingNames.length === 0) return xscpData;
  const cloned = JSON.parse(JSON.stringify(xscpData));
  if (!isRecord(cloned) || !isRecord(cloned.payload) || !Array.isArray(cloned.payload.styles)) {
    return cloned;
  }

  const renameSet = new Set(collidingNames);
  for (const style of cloned.payload.styles) {
    if (isRecord(style) && typeof style.name === "string" && renameSet.has(style.name)) {
      style.name = style.name + suffix;
    }
  }
  return cloned;
}

export async function removeSiteStyles(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const wf = getWebflowGlobal();
  if (!wf?.getAllStyles) return [];

  const siteStyles = await wf.getAllStyles();
  const nameSet = new Set(names);
  const removed: string[] = [];

  for (const style of siteStyles) {
    if (!style.getName || !style.remove) continue;
    try {
      const name = await style.getName();
      if (typeof name === "string" && nameSet.has(name)) {
        await style.remove();
        removed.push(name);
      }
    } catch {
      /* one failed removal shouldn't block the rest */
    }
  }
  return removed;
}
