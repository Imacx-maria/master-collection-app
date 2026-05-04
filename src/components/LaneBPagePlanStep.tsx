import type { ResolvedTargetPage } from "@/lib/install/resolveTargetPages";

export function LaneBPagePlanStep({
  pages,
  activePageIndex,
  pageStatuses,
  onSelectPage,
}: {
  pages: ResolvedTargetPage[];
  activePageIndex: number | null;
  pageStatuses: Record<number, string>;
  onSelectPage: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{pages.length} page(s) ready for install.</p>
      <div className="divide-y divide-border border border-border">
        {pages.map((page) => (
          <button
            key={page.target.id}
            type="button"
            onClick={() => onSelectPage(page.source.index)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted"
          >
            <div>
              <div className="font-medium">{page.source.displayName}</div>
              <div className="text-muted-foreground">
                {page.action === "created" ? "Created in Webflow" : "Matched existing Webflow page"}
              </div>
            </div>
            <span className="text-[10px] uppercase text-muted-foreground">
              {page.source.index === activePageIndex ? pageStatuses[page.source.index] ?? "Preparing" : pageStatuses[page.source.index] ?? "Queued"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
