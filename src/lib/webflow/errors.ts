export class WebflowAuthError extends Error {
  readonly status: number;
  readonly isWebflowAuthError = true as const;

  constructor(status: number, raw?: string) {
    const detail = raw && raw.trim() ? ` (server: ${raw.trim().slice(0, 200)})` : "";
    super(
      "This isn't a valid Webflow API token, or it's missing the required scopes (assets:read, assets:write, sites:read)." + detail,
    );
    this.name = "WebflowAuthError";
    this.status = status;
  }
}

export function isWebflowAuthError(error: unknown): error is WebflowAuthError {
  if (error instanceof WebflowAuthError) return true;
  return Boolean(error) && typeof error === "object" && (error as { isWebflowAuthError?: boolean }).isWebflowAuthError === true;
}
