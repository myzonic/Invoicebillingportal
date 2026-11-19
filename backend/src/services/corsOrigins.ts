import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { paymentDomain } from "./permalink";

/**
 * Dynamic CORS origin resolution.
 *
 * The portal is served under one or more white-label payment hosts
 * (`pay.<brand-domain>`). Those hosts are added/edited at runtime, so a static
 * allowlist cannot cover them. We allow:
 *   1. the configured CLIENT_URL / API_URL,
 *   2. any pattern in CORS_ALLOWED_ORIGINS (e.g. `https://pay.*`),
 *   3. every active brand's computed payment domain from the database.
 *
 * Brand domains are cached briefly to avoid a query on every browser request.
 */

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

const patterns = env.corsAllowedOrigins.map(wildcardToRegex);
const staticOrigins = [env.clientUrl, env.apiUrl].filter(Boolean).map((o) => o.replace(/\/+$/, "").toLowerCase());

let cachedDomains: Set<string> = new Set();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function refreshBrandDomains(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && cachedDomains.size) return;
  try {
    const brands = await prisma.brand.findMany({
      where: { isActive: true },
      select: { domain: true, paymentSubdomain: true },
    });
    cachedDomains = new Set(brands.map((b) => `https://${paymentDomain(b)}`.toLowerCase()).filter((d) => d !== "https://"));
    cacheLoadedAt = Date.now();
  } catch (e) {
    // If the DB is briefly unavailable, keep the last known set (or empty).
    console.error("[cors] could not refresh brand domains", e);
  }
}

/** Call from a scheduled task or after brand writes to refresh immediately. */
export function invalidateCorsOrigins(): void {
  cacheLoadedAt = 0;
}

export async function isOriginAllowed(origin?: string | null): Promise<boolean> {
  // Non-browser requests (curl, server-to-server) send no Origin header.
  if (!origin) return true;
  const value = origin.replace(/\/+$/, "").toLowerCase();
  if (staticOrigins.includes(value) || patterns.some((re) => re.test(value))) return true;
  await refreshBrandDomains();
  return cachedDomains.has(value);
}
