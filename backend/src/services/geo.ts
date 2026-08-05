import { env } from "../config/env";
import { CURRENCIES } from "./rates";

/** Country (ISO 3166-1 alpha-2) -> currency mapping for localised payments. */
const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  AU: "AUD",
  CA: "CAD",
};

/** A currency is usable for client payments only if a Square location is configured for it. */
function usable(currency: string): boolean {
  return currency === "USD" ? true : Boolean(env.square.locations[currency]);
}

const IP_CACHE = new Map<string, { country: string | null; at: number }>();
const IP_CACHE_TTL_MS = 60 * 60 * 1000;

async function countryByIp(ip: string): Promise<string | null> {
  const cached = IP_CACHE.get(ip);
  if (cached && Date.now() - cached.at < IP_CACHE_TTL_MS) return cached.country;

  let country: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=countryCode&lang=en`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const body = (await res.json()) as { countryCode?: string };
      if (body.countryCode) country = body.countryCode;
    }
  } catch {
    country = null;
  }
  IP_CACHE.set(ip, { country, at: Date.now() });
  return country;
}

/** Minimal request shape so geo detection also works for non-Express callers. */
export interface CurrencyRequest {
  query?: { currency?: unknown };
  headers?: Record<string, unknown>;
  ip?: string;
}

/**
 * Resolves the currency a client should pay in:
 *  1. explicit `?currency=` param (must be a supported currency)
 *  2. `CF-IPCountry` header (Cloudflare/edge)
 *  3. IP geolocation
 *  4. fallback (invoice currency)
 */
export async function resolveCurrency(req: CurrencyRequest, fallback: string): Promise<string> {
  const q = String(req.query?.currency || "").toUpperCase().trim();
  if (CURRENCIES.includes(q) && usable(q)) return q;

  const cf = String(req.headers?.["cf-ipcountry"] || "").toUpperCase().trim();
  if (COUNTRY_CURRENCY[cf] && usable(COUNTRY_CURRENCY[cf])) return COUNTRY_CURRENCY[cf];

  const ip = req.ip || "";
  if (ip && ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
    const country = await countryByIp(ip);
    if (country && COUNTRY_CURRENCY[country] && usable(COUNTRY_CURRENCY[country])) return COUNTRY_CURRENCY[country];
  }

  return CURRENCIES.includes(fallback) && usable(fallback) ? fallback : "USD";
}

export function isSupportedCurrency(currency: string): boolean {
  return CURRENCIES.includes(currency);
}

/**
 * Resolves the currency a client should SEE on the invoice (display only).
 * Country-based and independent of which Square locations the merchant has
 * configured: the invoice always shows the client their local currency, even
 * though the actual charge runs in the merchant's currency (USD).
 */
export async function detectCurrency(req: CurrencyRequest, fallback: string): Promise<string> {
  const q = String(req.query?.currency || "").toUpperCase().trim();
  if (CURRENCIES.includes(q)) return q;

  const cf = String(req.headers?.["cf-ipcountry"] || "").toUpperCase().trim();
  if (COUNTRY_CURRENCY[cf]) return COUNTRY_CURRENCY[cf];

  const ip = req.ip || "";
  if (ip && ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
    const country = await countryByIp(ip);
    if (country && COUNTRY_CURRENCY[country]) return COUNTRY_CURRENCY[country];
  }

  return CURRENCIES.includes(fallback) ? fallback : "USD";
}

