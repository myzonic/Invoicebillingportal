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

const runtime = window.__APP_CONFIG__ || {};

export const branding = {
  portalName: runtime.portalName || import.meta.env.VITE_PORTAL_NAME || "Billing Portal",
  portalTagline: runtime.portalTagline || import.meta.env.VITE_PORTAL_TAGLINE || "Finance & Billing",
  companyName: runtime.companyName || import.meta.env.VITE_COMPANY_NAME || "Your Company",
  paymentHost: runtime.paymentHost || import.meta.env.VITE_PAYMENT_HOST || window.location.host,
  paymentUrl: (runtime.paymentUrl || import.meta.env.VITE_PAYMENT_URL || window.location.origin).replace(/\/+$/, ""),
  logoUrl: runtime.logoUrl || import.meta.env.VITE_PUBLIC_LOGO_URL || "",
  defaultBrandName: runtime.defaultBrandName || import.meta.env.VITE_DEFAULT_BRAND_NAME || "Your Company",
};

document.title = `${branding.companyName} — ${branding.portalName}`;
document.querySelector('meta[name="description"]')?.setAttribute("content", `${branding.companyName} ${branding.portalTagline} portal`);
