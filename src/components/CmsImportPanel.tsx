import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractCollectionName } from "@/lib/cms/csv";
import { importCmsCollections, type CsvFileEntry } from "@/lib/cms/importCollections";
import { cn } from "@/lib/utils";

const WF_TOKEN_KEY = "wfApiToken";

export function CmsImportPanel({
  siteId,
  siteName,
  token: controlledToken,
  onTokenChange,
  hideTokenField = false,
}: {
  siteId: string;
  siteName: string;
  token?: string;
  onTokenChange?: (token: string) => void;
  hideTokenField?: boolean;
}) {
  const [token, setToken] = useState("");
  const [files, setFiles] = useState<CsvFileEntry[]>([]);
  const [status, setStatus] = useState<{ message: string; tone: "info" | "ok" | "err" } | null>(null);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (controlledToken !== undefined) {
      setToken(controlledToken);
      return;
    }
    const saved = window.localStorage.getItem(WF_TOKEN_KEY);
    if (saved) setToken(saved);
  }, [controlledToken]);

  function persistToken(next: string) {
    setToken(next);
    if (onTokenChange) {
      onTokenChange(next);
      return;
    }
    window.localStorage.setItem(WF_TOKEN_KEY, next);
  }

  async function readCsvFiles(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    const csvs = Array.from(fileList).filter((f) => /\.csv$/i.test(f.name));
    if (!csvs.length) {
      setStatus({ message: "No .csv files found in selection.", tone: "err" });
      return;
    }
    const entries: CsvFileEntry[] = await Promise.all(
      csvs.map(async (f) => ({ fileName: f.name, content: await f.text() })),
    );
    setFiles((prev) => {
      const map = new Map(prev.map((e) => [e.fileName, e]));
      for (const entry of entries) map.set(entry.fileName, entry);
      return Array.from(map.values());
    });
    setStatus({ message: `${entries.length} CSV file(s) loaded.`, tone: "info" });
  }

  function removeFile(fileName: string) {
    setFiles((prev) => prev.filter((e) => e.fileName !== fileName));
  }

  async function runImport() {
    if (!token.trim()) {
      setStatus({ message: "Webflow API Token required.", tone: "err" });
      return;
    }
    if (!files.length) {
      setStatus({ message: "Drop CMS CSV exports first.", tone: "err" });
      return;
    }
    setRunning(true);
    try {
      await importCmsCollections(siteId, token.trim(), files, (event) => {
        setStatus({ message: event.message, tone: event.tone });
      });
    } catch (err) {
      setStatus({
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
        tone: "err",
      });
    } finally {
      setRunning(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    void readCsvFiles(event.dataTransfer.files);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-3.5 w-3.5" />
          CMS Import
        </CardTitle>
        <CardDescription>
          Drop Webflow CMS CSV exports to create collections + items in{" "}
          <span className="font-medium">{siteName}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {!hideTokenField ? <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Webflow Site API Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => persistToken(e.target.value)}
            placeholder="Paste a Site API Token (scopes: cms:write, assets:write, sites:read)"
            className="h-9 w-full border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring"
            aria-label="Webflow Site API Token"
          />
          <p className="text-[10px] text-muted-foreground">
            Generate inside the target site: Site settings → Apps &amp; integrations → API access →
            Generate API token. Select <span className="font-mono">cms:read/write</span>,{" "}
            <span className="font-mono">assets:read/write</span>,{" "}
            <span className="font-mono">sites:read</span>. Workspace tokens do NOT expose CMS/Assets
            scopes — they only cover Cloud Apps, Code components, and Workspace activity. Stored in
            this browser only (localStorage).
          </p>
        </div> : null}

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-3 py-6 text-center text-muted-foreground transition-colors",
            dragOver ? "border-ring bg-muted" : "border-border",
          )}
          role="button"
          aria-label="Drop CMS CSV files"
        >
          <FileText className="h-4 w-4" />
          <span>Drop CMS CSV exports here, or click to browse</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => void readCsvFiles(e.target.files)}
          />
        </div>

        {files.length > 0 ? (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Queued collections
            </div>
            <div className="divide-y divide-border border border-border">
              {files.map((entry) => (
                <div key={entry.fileName} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{extractCollectionName(entry.fileName)}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{entry.fileName}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(entry.fileName)}
                    disabled={running}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={runImport} disabled={running || !files.length || !token.trim()}>
            <ArrowUp className="h-3.5 w-3.5" />
            {running ? "Importing..." : "Import to Webflow CMS"}
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground">siteId: {siteId}</span>
        </div>

        {status ? (
          <div
            className={cn(
              "border px-3 py-2 text-xs",
              status.tone === "err"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : status.tone === "ok"
                  ? "border-border bg-muted text-foreground"
                  : "border-border bg-muted text-muted-foreground",
            )}
          >
            {status.message}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
