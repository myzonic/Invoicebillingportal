import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Currency conversion rates (hybrid):
 *  - live market rates fetched from the ECB-backed Frankfurter API
 *  - manual admin overrides (stored in Settings) always win over live
 */

export const BASE_CURRENCY = "USD";
export const CURRENCIES = ["USD", "GBP", "EUR", "AUD", "CAD"];
const LIVE_TTL_MS = 6 * 60 * 60 * 1000;
const RATES_API = "https://api.frankfurter.app/latest";

interface LiveRates {
  base: string;
  date: string;
  fetchedAt: string;
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

/** Fetches fresh rates from Frankfurter and persists the snapshot. */
export async function refreshLiveRates(): Promise<{ ok: boolean; error?: string }> {
  try {
    const to = CURRENCIES.filter((c) => c !== BASE_CURRENCY).join(",");
    const res = await fetch(`${RATES_API}?from=${BASE_CURRENCY}&to=${to}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`rate api ${res.status}`);
    const body = (await res.json()) as { base: string; date: string; rates: Record<string, number> };
    const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
    for (const c of CURRENCIES) if (body.rates[c] != null) rates[c] = Number(body.rates[c]);
    const live: LiveRates = { base: body.base, date: body.date, fetchedAt: new Date().toISOString(), rates };
    await setSetting("fx_live", live);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not fetch rates" };
  }
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
    if (over[c] != null && over[c] > 0) rates[c] = over[c];
    else if (live?.rates[c] != null) rates[c] = live.rates[c];
    else rates[c] = 1;
  }
  const active = Object.keys(over).filter((k) => over[k] > 0);
  return {
    base: BASE_CURRENCY,
    currencies: CURRENCIES,
    rates,
    live: live?.rates || null,
    date: live?.date || null,
    updatedAt: live?.fetchedAt || null,
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
    if (!CURRENCIES.includes(cur)) continue;
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
