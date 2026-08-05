import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Currency code -> display symbol shown before the amount. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  CAD: "CA$",
};

export function currencySymbol(currency?: string | null): string {
  if (!currency) return "$";
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
}

export function money(value: number | string | undefined | null, currency = "USD") {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${currencySymbol(currency)}${number}`;
}

/** Default brand accent used when an invoice has no custom color. */
export const DEFAULT_BRAND_COLOR = "#e0a423";

function hexRgb(hex: string): [number, number, number] {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return [224, 164, 35];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Brand accent color for an invoice (falls back to the gold default). */
export function brandColor(color?: string | null): string {
  if (!color) return DEFAULT_BRAND_COLOR;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : DEFAULT_BRAND_COLOR;
}

/** `rgba(r,g,b,a)` from a hex color. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Lighten (amount > 0) or darken (amount < 0) a hex color. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexRgb(hex);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const c = (v: number) => Math.round((t - v) * p + v);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { response?: { data?: { message?: string } }; message?: string };
    return e.response?.data?.message || e.message || "Something went wrong";
  }
  return String(err);
}

/** Convert a stored description (HTML from the rich editor, or legacy plain text) into display HTML. */
export function richText(value?: string | null): string {
  if (!value) return "";
  if (/<\/?[a-z][^>]*>/i.test(value)) return value;
  return value.replace(/\n/g, "<br>");
}

/** Strip tags so a rich-text description can be validated as non-empty. */
export function stripTags(value?: string | null): string {
  return (value || "").replace(/<[^>]*>/g, "").trim();
}

/**
 * Converts an amount from one currency to another using rates expressed as
 * "1 USD = rate[currency]" (rates keyed by currency with USD as base).
 */
export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>): number {
  const rateFrom = rates[from] || 1;
  const rateTo = rates[to] || rates[to === "USD" ? from : "USD"] || 1;
  if (from === to) return amount;
  const inUsd = amount / rateFrom;
  return inUsd * rateTo;
}
