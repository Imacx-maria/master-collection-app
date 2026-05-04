export const WEBFLOW_SITE_TOKEN_KEY = "masterCollection.webflowSiteApiToken";
export const LEGACY_WEBFLOW_SITE_TOKEN_KEY = "wfApiToken";

export interface WebflowAccessTokenState {
  token: string;
  hasToken: boolean;
  status: "empty" | "unvalidated" | "validating" | "valid" | "invalid";
  message?: string;
}

export function readStoredWebflowSiteToken(): string {
  if (typeof window === "undefined") return "";

  const current = window.localStorage.getItem(WEBFLOW_SITE_TOKEN_KEY);
  if (current) return current;

  const legacy = window.localStorage.getItem(LEGACY_WEBFLOW_SITE_TOKEN_KEY);
  if (legacy) {
    window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, legacy);
    return legacy;
  }

  return "";
}

export function persistWebflowSiteToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WEBFLOW_SITE_TOKEN_KEY, token);
}

export function buildWebflowAccessTokenState(token: string): WebflowAccessTokenState {
  const trimmed = token.trim();
  return {
    token,
    hasToken: trimmed.length > 0,
    status: trimmed ? "unvalidated" : "empty",
    message: trimmed ? "Token ready for Webflow asset preparation." : "Paste a Webflow Site API Token before preparing assets.",
  };
}
