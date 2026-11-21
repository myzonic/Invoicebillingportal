import { env } from "../config/env";

/**
 * White-label payment domains.
 *
 * Each brand owns a primary domain (`crystalwebsites.com.au`) and a payment
 * subdomain (`pay`). Invoices for that brand get a permanent link at:
 *   https://pay.crystalwebsites.com.au/invoice/checkout/<publicToken>
 *
 * The link opens secure checkout directly (the invoice is shown beside the
 * card form). Older `/invoice/<token>` links still redirect there.
 *
 * The token in the path carries branding/identity, so one hosted app can
 * serve every brand's pay domain. DNS + TLS for those hostnames are provisioned
 * outside this app (see README); this service generates and validates URLs.
 */

export interface BrandDomain {
  domain?: string | null;
  paymentSubdomain?: string | null;
  isActive?: boolean;
  paymentEnabled?: boolean;
}

/** Accepts `https://www.pay.Example.com.au/path`, `pay.example.com`, or a bare domain. */
export function normalizeDomain(input: string | null | undefined): string {
  if (!input) return "";
  let value = String(input).trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split(/[/?#]/)[0] || "";
  value = value.replace(/^pay\./, "");
  return value.replace(/\/+$/, "");
}

/** The label before the primary domain; defaults to `pay`. */
export function normalizeSubdomain(input: string | null | undefined): string {
  const value = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\..*$/, "");
  return value || "pay";
}

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SUBDOMAIN_RE = /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Returns a human-readable error, or null when valid. */
export function validateDomain(value: string): string | null {
  if (!value) return "Primary domain is required";
  if (!DOMAIN_RE.test(value)) return "Enter a valid domain, e.g. crystalwebsites.com.au";
  return null;
}

export function validateSubdomain(value: string): string | null {
  if (!SUBDOMAIN_RE.test(value)) return "Subdomain may contain only letters, numbers and hyphens";
  return null;
}

/** e.g. `pay.crystalwebsites.com.au` (empty when no domain is configured). */
export function paymentDomain(brand?: BrandDomain | null): string {
  const domain = normalizeDomain(brand?.domain);
  return domain ? `${normalizeSubdomain(brand?.paymentSubdomain)}.${domain}` : "";
}

/** Fallback is the configured payment URL when a brand has no domain. */
export function paymentBaseUrl(brand?: BrandDomain | null): string {
  const host = paymentDomain(brand);
  return host ? `https://${host}` : env.branding.paymentUrl.replace(/\/+$/, "");
}

/** Permanent, shareable payment link for an invoice. */
export function invoicePermalink(
  invoice: { id: string; publicToken?: string | null },
  brand?: BrandDomain | null,
): string {
  return `${paymentBaseUrl(brand)}/invoice/checkout/${invoice.publicToken || invoice.id}`;
}

/** Attach the computed permalink and payment domain to an invoice API response. */
export function withPermalink<T extends { id: string; publicToken?: string | null }>(
  invoice: T,
  brand?: BrandDomain | null,
): T & { permalink: string; paymentDomain: string } {
  return { ...invoice, permalink: invoicePermalink(invoice, brand), paymentDomain: paymentDomain(brand) };
}

/** Host header (may include port) -> configured brand, if any. */
export function brandFromHost<T extends BrandDomain>(host: string | undefined, brands: T[]): T | null {
  if (!host) return null;
  const clean = host.toLowerCase().split(":")[0].replace(/\.$/, "");
  return brands.find((brand) => paymentDomain(brand).toLowerCase() === clean) || null;
}
