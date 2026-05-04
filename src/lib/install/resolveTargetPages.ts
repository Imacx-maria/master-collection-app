import type { WebflowAdapter, WebflowPageReference } from "@/lib/webflow/types";

import type { AppInstallPlanPage } from "./types";

export interface ResolvedTargetPage {
  source: AppInstallPlanPage;
  target: WebflowPageReference;
  action: "existing" | "created";
}

export async function resolveTargetPages(
  pages: AppInstallPlanPage[],
  adapter: WebflowAdapter,
): Promise<ResolvedTargetPage[]> {
  const resolved: ResolvedTargetPage[] = [];

  for (const page of pages) {
    const existing = await adapter.findPage({
      name: page.displayName,
      slug: page.slug,
      path: page.path,
    });

    if (existing) {
      resolved.push({
        source: page,
        target: existing,
        action: "existing",
      });
      continue;
    }

    const created = await adapter.createPage({
      name: page.displayName,
      slug: page.slug ?? slugify(page.displayName),
    });

    resolved.push({
      source: page,
      target: created,
      action: "created",
    });
  }

  return resolved;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
