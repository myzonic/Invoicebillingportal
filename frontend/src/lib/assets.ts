/**
 * Uploaded files are stored as `/uploads/<file>` on the backend. When the
 * browser app is hosted on a different origin (e.g. Vercel), a relative URL
 * would be requested from the frontend host and rewritten to index.html.
 * Resolve every upload URL to the API origin, while keeping it relative when
 * the backend itself is serving the page (single-container payment domains).
 */
const configuredApi = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const apiOrigin = configuredApi.replace(/\/api$/, "");

function isBackendHere(): boolean {
  if (typeof window === "undefined") return false;
  if (!apiOrigin) return true; // dev proxy or same-origin deployment
  try {
    const api = new URL(apiOrigin, window.location.origin);
    if (api.host === window.location.host) return true;
  } catch {
    /* ignore invalid configured URL */
  }
  // White-label payment hosts are served by the backend container. Keep
  // uploads same-origin there so CSP/CORP never blocks the logo. Public
  // /invoice/checkout/:token pages on Vercel are not on a pay.* host, so they
  // still use the absolute API URL.
  return window.location.hostname.startsWith("pay.");
}

export function assetUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;

  // Accept legacy relative URLs and absolute URLs saved by any backend host.
  const uploaded = raw.match(/^(?:https?:\/\/[^/]+)?(\/uploads\/[^\s?#]+(?:\?[^\s#]*)?)$/i);
  if (uploaded) {
    const path = uploaded[1];
    return isBackendHere() ? path : `${apiOrigin}${path}`;
  }

  return raw;
}
