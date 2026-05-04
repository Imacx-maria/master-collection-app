import {
  CMS_SYSTEM_COLS,
  extractCollectionName,
  inferFieldType,
  parseCsv,
  toFieldSlug,
  type CmsFieldType,
} from "./csv";
import {
  bulkCreateItems,
  createCollection,
  createField,
  listCollections,
  publishItems,
  publishSite,
} from "./webflowApi";

export interface CsvFileEntry {
  fileName: string;
  content: string;
}

export interface ImportProgressEvent {
  kind: "status";
  message: string;
  tone: "info" | "ok" | "err";
}

export type ProgressHandler = (event: ImportProgressEvent) => void;

export interface ImportResult {
  collectionsCreated: number;
  collectionsSkipped: number;
  totalItems: number;
  totalCollections: number;
}

interface FieldDef {
  displayName: string;
  slug: string;
  type: CmsFieldType;
  index: number;
}

export async function importCmsCollections(
  siteId: string,
  token: string,
  files: CsvFileEntry[],
  onProgress: ProgressHandler,
): Promise<ImportResult> {
  if (!files.length) {
    throw new Error("No CSV files — drop Webflow CMS CSV exports first.");
  }

  let collectionsDone = 0;
  let collectionsSkipped = 0;
  let totalItems = 0;
  const totalCols = files.length;

  for (const file of files) {
    const colName = extractCollectionName(file.fileName);
    const parsed = parseCsv(file.content);
    if (!parsed.headers.length || !parsed.rows.length) {
      collectionsDone++;
      continue;
    }

    const hdrs = parsed.headers;
    const rows = parsed.rows;
    const nameIdx = hdrs.findIndex((h) => h === "Name" || h === "Nombre" || h === "Nome");
    const slugIdx = hdrs.findIndex((h) => h === "Slug");

    const customCols = hdrs
      .map((name, index) => ({ name, index }))
      .filter((c) => !CMS_SYSTEM_COLS.has(c.name));

    const fieldDefs: FieldDef[] = customCols.map((col) => {
      const vals = rows.slice(0, 8).map((r) => r[col.index] || "");
      return {
        displayName: col.name,
        slug: toFieldSlug(col.name),
        type: inferFieldType(vals),
        index: col.index,
      };
    });

    onProgress({
      kind: "status",
      message: `(${collectionsDone + 1}/${totalCols}) Creating: ${colName}...`,
      tone: "info",
    });

    const singularName = colName.endsWith("s") ? colName.slice(0, -1) : colName;
    const colSlug = toFieldSlug(colName);
    const createResp = await createCollection(siteId, colName, singularName, colSlug, token);

    let colId: string | null = null;
    if (createResp.ok) {
      const collection = (await createResp.json()) as { id: string };
      colId = collection.id;
    } else {
      const errBody = await createResp.text();
      let errJson: { code?: string } = {};
      try {
        errJson = JSON.parse(errBody);
      } catch {
        /* ignore */
      }
      if (errJson.code === "duplicate_collection" || createResp.status === 409) {
        const existing = (await listCollections(siteId, token)).find((c) => c.slug === colSlug);
        if (existing) {
          onProgress({
            kind: "status",
            message: `(${collectionsDone + 1}/${totalCols}) "${colName}" already exists — skipping. Remove it in Webflow to re-import.`,
            tone: "info",
          });
          collectionsSkipped++;
          collectionsDone++;
          continue;
        }
      }
      throw new Error(`Create collection "${colName}" failed: ${errBody}`);
    }

    for (const fd of fieldDefs) {
      const fResp = await createField(colId, fd.type, fd.displayName, token);
      if (!fResp.ok) {
        const errText = await fResp.text();
        console.warn(`Field "${fd.displayName}" failed:`, errText);
      }
    }

    const items: Array<{ fieldData: Record<string, unknown> }> = [];
    for (const row of rows) {
      if (row.every((c) => !c)) continue;
      const fd: Record<string, unknown> = {};
      fd.name = nameIdx >= 0 ? row[nameIdx] || "" : "";
      fd.slug = slugIdx >= 0 ? row[slugIdx] || toFieldSlug(String(fd.name)) : toFieldSlug(String(fd.name));
      for (const fdef of fieldDefs) {
        const val = row[fdef.index] || "";
        if (!val) continue;
        fd[fdef.slug] = fdef.type === "Image" ? { url: val, alt: "" } : val;
      }
      items.push({ fieldData: fd });
    }

    const itemIds: string[] = [];
    for (let start = 0; start < items.length; start += 100) {
      const batch = items.slice(start, start + 100);
      onProgress({
        kind: "status",
        message: `(${collectionsDone + 1}/${totalCols}) ${colName}: ${Math.min(start + 100, items.length)}/${items.length} items...`,
        tone: "info",
      });
      const bulkResp = await bulkCreateItems(
        colId,
        batch.map((item) => item.fieldData),
        token,
      );
      if (!bulkResp.ok) {
        const errText = await bulkResp.text();
        throw new Error(`Bulk create failed: ${errText}`);
      }
      const bulkData = (await bulkResp.json()) as { items?: Array<{ id?: string }> };
      (bulkData.items || []).forEach((item) => {
        if (item.id) itemIds.push(item.id);
      });
    }

    for (let ps = 0; ps < itemIds.length; ps += 100) {
      await publishItems(colId, itemIds.slice(ps, ps + 100), token);
    }

    totalItems += items.length;
    collectionsDone++;
  }

  if (totalItems > 0) {
    onProgress({ kind: "status", message: "Publishing site...", tone: "info" });
    const pubResp = await publishSite(siteId, token);
    if (!pubResp.ok) {
      const errText = await pubResp.text();
      console.warn("Site publish failed:", errText);
    }
  }

  const created = collectionsDone - collectionsSkipped;
  let finalMsg: string;
  if (collectionsSkipped > 0 && collectionsSkipped === totalCols) {
    finalMsg = `All ${collectionsSkipped} collections already exist — nothing imported.`;
  } else if (collectionsSkipped > 0) {
    finalMsg = `Done — ${created} collections created (${totalItems} items), ${collectionsSkipped} skipped.`;
  } else {
    finalMsg = `Done — ${collectionsDone} collections, ${totalItems} items live.`;
  }
  onProgress({ kind: "status", message: finalMsg, tone: "ok" });

  return {
    collectionsCreated: created,
    collectionsSkipped,
    totalItems,
    totalCollections: totalCols,
  };
}
