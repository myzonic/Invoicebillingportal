type PublicAppConfig = {
  portalName?: string;
  portalTagline?: string;
  companyName?: string;
  paymentHost?: string;
  paymentUrl?: string;
  logoUrl?: string;
  defaultBrandName?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: PublicAppConfig;
  }
}

const PORTAL_IDENTITY = "Crystal Reserve LLC";
const STALE_IDENTITIES = new Set([
  "billing portal",
  "your company",
  "myzonic portal",
  "burst digital limited",
  "burst digital",
]);

/** Ignore stale runtime values so old deployments cannot leak a previous brand. */
function identity(value: unknown, fallback: string): string {
  const text = String(value || "").trim();
  return text && !STALE_IDENTITIES.has(text.toLowerCase()) ? text : fallback;
}

const runtime = window.__APP_CONFIG__ || {};

export const branding = {
  portalName: identity(runtime.portalName || import.meta.env.VITE_PORTAL_NAME, PORTAL_IDENTITY),
  portalTagline: identity(runtime.portalTagline || import.meta.env.VITE_PORTAL_TAGLINE, "Finance & Billing"),
  companyName: identity(runtime.companyName || import.meta.env.VITE_COMPANY_NAME, PORTAL_IDENTITY),
  paymentHost: runtime.paymentHost || import.meta.env.VITE_PAYMENT_HOST || window.location.host,
  paymentUrl: (runtime.paymentUrl || import.meta.env.VITE_PAYMENT_URL || window.location.origin).replace(/\/+$/, ""),
  logoUrl: runtime.logoUrl || import.meta.env.VITE_PUBLIC_LOGO_URL || "",
  defaultBrandName: identity(runtime.defaultBrandName || import.meta.env.VITE_DEFAULT_BRAND_NAME, PORTAL_IDENTITY),
};

// Link-preview metadata is the single source of truth for title/description.
// Static index.html defines the OG tags so crawlers see them without JS;
// sync the live document to those same values when the app boots.
const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute("content");

document.title = ogTitle || `${branding.companyName} — ${branding.portalName}`;
document.querySelector('meta[name="description"]')?.setAttribute(
  "content",
  ogDescription || `${branding.companyName} ${branding.portalTagline} portal`,
);
