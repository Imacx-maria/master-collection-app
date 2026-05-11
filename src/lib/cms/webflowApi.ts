// Webflow Data API v2 calls go through the FlowBridge Cloudflare Worker proxy
// to bypass browser CORS. The token travels browser -> Worker -> api.webflow.com;
// it is never persisted server-side.
import { WebflowAuthError } from "@/lib/webflow/errors";

const DEFAULT_WF_PROXY = "https://flowbridge-assets.vanquish-ideas.workers.dev/wf-api";

function throwIfAuthError(status: number, body: string): void {
  if (status === 401 || status === 403) {
    throw new WebflowAuthError(status, body);
  }
}

export const WF_PROXY = String(import.meta.env.VITE_MASTER_COLLECTION_WF_PROXY || DEFAULT_WF_PROXY).replace(/\/+$/, "");

export type CmsFieldType = "PlainText" | "RichText" | "Image";

export interface WebflowCollectionSummary {
  id: string;
  displayName: string;
  slug: string;
}

export interface WebflowSiteAssetSummary {
  id: string;
  displayName?: string;
  originalFileName?: string;
  hostedUrl?: string;
  url?: string;
  cdnUrl?: string;
  contentType?: string;
}

export interface WebflowCreateAssetResponse {
  id?: string;
  assetId?: string;
  displayName?: string;
  originalFileName?: string;
  hostedUrl?: string;
  url?: string;
  cdnUrl?: string;
  uploadUrl?: string;
  uploadDetails?: Record<string, string>;
}

export interface WebflowSiteSummary {
  id: string;
  displayName?: string;
  shortName?: string;
  previewUrl?: string;
}

export async function wfFetch(
  method: string,
  path: string,
  body: unknown,
  token: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    Accept: "application/json",
  };
  const opts: RequestInit = { method, headers };
  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch(WF_PROXY + path, opts);
}

export async function listCollections(
  siteId: string,
  token: string,
): Promise<WebflowCollectionSummary[]> {
  const resp = await wfFetch("GET", `/v2/sites/${siteId}/collections`, null, token);
  if (!resp.ok) {
    const text = await resp.text();
    throwIfAuthError(resp.status, text);
    throw new Error(`List collections failed (HTTP ${resp.status}): ${text}`);
  }
  const data = (await resp.json()) as { collections?: WebflowCollectionSummary[] };
  return data.collections ?? [];
}

export async function listAccessibleSites(token: string): Promise<WebflowSiteSummary[]> {
  const resp = await wfFetch("GET", "/v2/sites", null, token);
  if (!resp.ok) {
    const text = await resp.text();
    throwIfAuthError(resp.status, text);
    throw new Error(`List sites failed (HTTP ${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { sites?: WebflowSiteSummary[] };
  return data.sites ?? [];
}

export async function listSiteAssets(
  siteId: string,
  token: string,
): Promise<WebflowSiteAssetSummary[]> {
  const assets: WebflowSiteAssetSummary[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const resp = await wfFetch("GET", `/v2/sites/${siteId}/assets?limit=${limit}&offset=${offset}`, null, token);
    if (!resp.ok) {
      const text = await resp.text();
      throwIfAuthError(resp.status, text);
      throw new Error(`List assets failed (HTTP ${resp.status}): ${text}`);
    }

    const data = (await resp.json()) as { assets?: WebflowSiteAssetSummary[] };
    const batch = data.assets ?? [];
    assets.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
  }

  return assets;
}

export async function createSiteAssetUpload(
  siteId: string,
  token: string,
  fileName: string,
  fileHash: string,
): Promise<WebflowCreateAssetResponse> {
  const resp = await wfFetch("POST", `/v2/sites/${siteId}/assets`, { fileName, fileHash }, token);
  if (!resp.ok) {
    const text = await resp.text();
    throwIfAuthError(resp.status, text);
    throw new Error(`Create asset failed (HTTP ${resp.status}): ${text}`);
  }
  return (await resp.json()) as WebflowCreateAssetResponse;
}

export async function createCollection(
  siteId: string,
  displayName: string,
  singularName: string,
  slug: string,
  token: string,
): Promise<Response> {
  return wfFetch(
    "POST",
    `/v2/sites/${siteId}/collections`,
    { displayName, singularName, slug },
    token,
  );
}

export async function createField(
  collectionId: string,
  type: CmsFieldType,
  displayName: string,
  token: string,
): Promise<Response> {
  return wfFetch(
    "POST",
    `/v2/collections/${collectionId}/fields`,
    { type, displayName, isRequired: false },
    token,
  );
}

export async function bulkCreateItems(
  collectionId: string,
  fieldDataBatch: Array<Record<string, unknown>>,
  token: string,
): Promise<Response> {
  return wfFetch(
    "POST",
    `/v2/collections/${collectionId}/items/bulk`,
    {
      fieldData: fieldDataBatch,
      isDraft: false,
      isArchived: false,
    },
    token,
  );
}

export async function publishItems(
  collectionId: string,
  itemIds: string[],
  token: string,
): Promise<Response> {
  return wfFetch(
    "POST",
    `/v2/collections/${collectionId}/items/publish`,
    { itemIds },
    token,
  );
}

export async function publishSite(siteId: string, token: string): Promise<Response> {
  return wfFetch(
    "POST",
    `/v2/sites/${siteId}/publish`,
    { publishToWebflowSubdomain: true },
    token,
  );
}
