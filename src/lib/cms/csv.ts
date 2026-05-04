export const CMS_SYSTEM_COLS = new Set<string>([
  "Name",
  "Nombre",
  "Nome",
  "Slug",
  "Collection ID",
  "Locale ID",
  "Item ID",
  "Archived",
  "Draft",
  "Created On",
  "Updated On",
  "Published On",
]);

export type CmsFieldType = "PlainText" | "RichText" | "Image";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsv(content: string): ParsedCsv {
  const lines = content.split(/[\r\n]+/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  return {
    headers: parseCsvLine(lines[0]),
    rows: lines.slice(1).map(parseCsvLine),
  };
}

export function toFieldSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function inferFieldType(sampleVals: string[]): CmsFieldType {
  const nonEmpty = sampleVals.filter((v) => v && v.trim());
  if (!nonEmpty.length) return "PlainText";
  if (nonEmpty.some((v) => /<[a-z]/i.test(v))) return "RichText";
  if (
    nonEmpty.some((v) =>
      /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(v),
    )
  ) {
    return "Image";
  }
  return "PlainText";
}

export function extractCollectionName(fileName: string): string {
  const parts = fileName.replace(/\.csv$/i, "").split(" - ");
  return parts.length >= 3
    ? parts[parts.length - 2]
    : fileName.replace(/\.csv$/i, "");
}
