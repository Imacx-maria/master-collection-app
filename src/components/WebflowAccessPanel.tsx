import { Info, KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WebflowAccessPanel({
  token,
  onTokenChange,
  cmsRequired = false,
}: {
  token: string;
  onTokenChange: (token: string) => void;
  cmsRequired?: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" />
              Webflow access
            </CardTitle>
            <CardDescription>
              Paste the target site's API token before preparing assets.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Webflow token instructions"
            onClick={() => setShowHelp((current) => !current)}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Webflow Site API Token
        </label>
        <input
          type="text"
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="Paste a Site API Token with assets:read, assets:write, sites:read"
          className="h-9 w-full border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring"
          aria-label="Webflow Site API Token"
        />
        <p className="text-[10px] text-muted-foreground">
          Stored only in this browser. Required scopes: <span className="font-mono">assets:read</span>,{" "}
          <span className="font-mono">assets:write</span>, and{" "}
          <span className="font-mono">sites:read</span>
          {cmsRequired ? (
            <>
              {" "}
              plus <span className="font-mono">cms:read</span> and <span className="font-mono">cms:write</span>
            </>
          ) : null}
          .
        </p>
        {showHelp ? (
          <div className="border border-border bg-muted p-3 text-[10px] leading-relaxed text-muted-foreground">
            Open the target Webflow site, go to Site settings, then Apps &amp; integrations, then API access. Create or copy a Site API Token with assets:read, assets:write, and sites:read. Add cms:read and cms:write only when this package includes CMS import.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
