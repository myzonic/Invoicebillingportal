import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Currency conversion rates (hybrid):
 *  - live market rates fetched from the ECB-backed Frankfurter API
 *  - manual admin overrides (stored in Settings) always win over live
 */

export const BASE_CURRENCY = "USD";
export const CURRENCIES = [
  "USD", "EUR", "GBP", "AUD", "CAD", "JPY", "CHF", "CNY", "NZD",
  "SEK", "NOK", "DKK", "PLN", "TRY", "SGD", "HKD", "INR",
];
const LIVE_TTL_MS = 6 * 60 * 60 * 1000;
const FRANKFURTER_API = "https://api.frankfurter.app/latest";
const FALLBACK_API = "https://open.er-api.com/v6/latest/USD";

interface LiveRates {
  base: string;
  date: string;
  fetchedAt: string;
  provider: string;
  rates: Record<string, number>;
}

type Overrides = Record<string, number>;

async function getSetting<T>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? (row.value as unknown as T) : null;
}

async function setSetting(key: string, value: unknown) {
  const v = value as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
}

interface RateSnapshot {
  date: string;
  rates: Record<string, number>;
}

async function fromFrankfurter(): Promise<RateSnapshot> {
  const to = CURRENCIES.filter((c) => c !== BASE_CURRENCY).join(",");
  const res = await fetch(`${FRANKFURTER_API}?from=${BASE_CURRENCY}&to=${to}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);
  const body = (await res.json()) as { date: string; rates: Record<string, number> };
  return { date: body.date, rates: body.rates };
}

async function fromFallback(): Promise<RateSnapshot> {
  const res = await fetch(FALLBACK_API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`fallback rate API returned ${res.status}`);
  const body = (await res.json()) as { rates: Record<string, number>; time_last_update_unix?: number };
  return {
    date: body.time_last_update_unix ? new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    rates: body.rates || {},
  };
}

/** Fetches fresh rates (ECB via Frankfurter, with a fallback) and persists the snapshot. */
export async function refreshLiveRates(): Promise<{ ok: boolean; provider?: string; error?: string }> {
  let snapshot: RateSnapshot | null = null;
  let provider = "";
  try {
    snapshot = await fromFrankfurter();
    provider = "Frankfurter (ECB)";
  } catch {
    try {
      snapshot = await fromFallback();
      provider = "ExchangeRate-API";
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not fetch rates" };
    }
  }

  const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
  for (const c of CURRENCIES) {
    if (c !== BASE_CURRENCY && snapshot.rates[c] != null && Number(snapshot.rates[c]) > 0) rates[c] = Number(snapshot.rates[c]);
  }
  const live: LiveRates = {
    base: BASE_CURRENCY,
    date: snapshot.date,
    fetchedAt: new Date().toISOString(),
    provider,
    rates,
  };
  await setSetting("fx_live", live);
  return { ok: true, provider };
}

async function getLive(): Promise<LiveRates | null> {
  let live = await getSetting<LiveRates>("fx_live");
  if (!live || Date.now() - new Date(live.fetchedAt).getTime() > LIVE_TTL_MS) {
    const res = await refreshLiveRates();
    if (!res.ok && !live) return null;
  }
  live = await getSetting<LiveRates>("fx_live");
  return live;
}

/** Merged effective rates: override wins, else live, else base=1. */
export async function getRates() {
  const [live, overrides] = await Promise.all([getLive(), getSetting<Overrides>("fx_overrides")]);
  const over = overrides || {};
  const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
  for (const c of CURRENCIES) {
    if (c !== BASE_CURRENCY && over[c] != null && over[c] > 0) rates[c] = over[c];
    else if (live?.rates[c] != null) rates[c] = live.rates[c];
    else rates[c] = 1;
  }
  const active = Object.keys(over).filter((k) => k !== BASE_CURRENCY && over[k] > 0);
  return {
    base: BASE_CURRENCY,
    currencies: CURRENCIES,
    rates,
    live: live?.rates || null,
    date: live?.date || null,
    updatedAt: live?.fetchedAt || null,
    provider: live?.provider || null,
    overrides: active.reduce<Overrides>((a, k) => {
      a[k] = over[k];
      return a;
    }, {}),
    source: active.length ? (live ? "mixed" : "override") : live ? "live" : "none",
  };
}

/** Sets/clears manual overrides. `null`/`undefined` clears a currency. */
export async function setOverrides(input: Record<string, number | null | undefined>) {
  const over = (await getSetting<Overrides>("fx_overrides")) || {};
  for (const [cur, val] of Object.entries(input)) {
    // USD is the base currency: its rate is definitionally 1, so allowing an
    // override would silently re-scale every converted amount and therefore
    // every amount charged. Ignore it here as well as when applying rates.
    if (!CURRENCIES.includes(cur) || cur === BASE_CURRENCY) continue;
    if (val != null && val > 0) over[cur] = val;
    else delete over[cur];
  }
  await setSetting("fx_overrides", over);
  return over;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Converts an amount from one currency to another using effective (override-aware) rates. */
export async function convertAmount(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return round2(Number(amount));
  const { rates } = await getRates();
  const rateFrom = rates[from] || 1;
  const rateTo = rates[to] || rateFrom;
  return round2((Number(amount) / rateFrom) * rateTo);
}

export interface UsdConversion {
  /** Exact USD amount, rounded to Square's 2-decimal (cent) precision. */
  amount: number;
  /** Units of `sourceCurrency` per 1 USD (e.g. 1.5 AUD/USD). */
  rate: number;
  /** Which provider/rule produced the rate, stored for reconciliation. */
  provider: string;
  /** When that rate was published/fetched. */
  rateAt: Date;
  sourceCurrency: string;
}

/** The part of `getRates()` the conversion maths actually needs. */
export interface RatesSnapshot {
  rates: Record<string, number>;
  live: Record<string, number> | null;
  overrides: Record<string, number>;
  provider: string | null;
  updatedAt: string | null;
}

/**
 * Pure USD conversion. Kept separate from `getRates()` so the exact maths and
 * fail-closed rules can be verified without a database or network access.
 */
export function computeUsdConversion(amount: number, from: string, snapshot: RatesSnapshot): UsdConversion {
  const source = String(from || "").toUpperCase();
  const value = round2(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid amount for USD conversion");
  if (source === BASE_CURRENCY) {
    return { amount: value, rate: 1, provider: "base", rateAt: new Date(), sourceCurrency: source };
  }
  if (!CURRENCIES.includes(source)) throw new Error(`Unsupported invoice currency: ${source}`);

  const isOverride = snapshot.overrides[source] != null;
  const rate = snapshot.rates[source];
  // Never fall back to 1:1 for a foreign currency: that would charge the
  // client the wrong USD amount. A rate must come from live data or an override.
  if (!rate || !(rate > 0) || (!isOverride && snapshot.live?.[source] == null)) {
    throw new Error(`No usable exchange rate for ${source}; refusing to charge`);
  }
  return {
    amount: round2(value / rate),
    rate,
    provider: isOverride ? "Manual override" : snapshot.provider || "unknown",
    rateAt: isOverride ? new Date() : new Date(snapshot.updatedAt || Date.now()),
    sourceCurrency: source,
  };
}

/**
 * Converts an invoice amount into USD for the US Square merchant account and
 * returns the full FX snapshot needed to reconcile the resulting charge.
 */
export async function convertToUsd(amount: number, from: string): Promise<UsdConversion> {
  return computeUsdConversion(amount, from, await getRates());
}

interface InvoiceLike {
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
}

/**
 * Returns a currency-converted copy of an invoice's monetary fields, so a
 * client can view/pay the invoice in their local currency without changing
 * the stored invoice (which keeps its original currency).
 */
export async function convertInvoice(invoice: InvoiceLike, toCurrency: string): Promise<InvoiceLike> {
  if (invoice.currency === toCurrency) return invoice;
  const items = await Promise.all(
    invoice.items.map(async (it) => ({
      ...it,
      unitPrice: await convertAmount(it.unitPrice, invoice.currency, toCurrency),
    })),
  );
  return {
    ...invoice,
    currency: toCurrency,
    subtotal: await convertAmount(invoice.subtotal, invoice.currency, toCurrency),
    taxAmount: await convertAmount(invoice.taxAmount, invoice.currency, toCurrency),
    discountAmount: await convertAmount(invoice.discountAmount, invoice.currency, toCurrency),
    total: await convertAmount(invoice.total, invoice.currency, toCurrency),
    items,
  };
}

let schedulerStarted = false;

/** Keep the rate snapshot fresh even when nobody opens the app. */
export function startRatesScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    try {
      const live = await getSetting<LiveRates>("fx_live");
      if (live && Date.now() - new Date(live.fetchedAt).getTime() <= LIVE_TTL_MS) return;
      const result = await refreshLiveRates();
      console.log(result.ok ? `[rates] refreshed via ${result.provider}` : `[rates] refresh failed: ${result.error}`);
    } catch (e) {
      console.error("[rates] scheduler error", e);
    }
  };

  void tick();
  const timer = setInterval(tick, LIVE_TTL_MS);
  timer.unref();
}
