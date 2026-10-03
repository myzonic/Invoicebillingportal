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
export const DEFAULT_BRAND_COLOR = "#111111";

function hexRgb(hex: string): [number, number, number] {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return [224, 164, 35];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Brand accent color for an invoice (falls back to the neutral default). */
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

/**
 * Tags that may survive sanitising. Intentionally limited to what the rich-text
 * editor and pasted invoice copy realistically produce.
 */
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "sub", "sup", "small",
  "p", "br", "div", "span", "hr", "blockquote", "code", "pre",
  "ul", "ol", "li", "a",
]);

const VOID_TAGS = new Set(["br", "hr"]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rebuilds a single tag. Returns the replacement markup, or `null` when the
 * input is not tag-shaped at all (e.g. the literal text `<100`) and should be
 * kept as escaped text.
 *
 * No attributes are ever passed through, which removes every `on*` event
 * handler and every `javascript:` URL in one move. Links keep a validated
 * http(s)/mailto href and nothing else.
 */
function rebuildTag(source: string): string | null {
  const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(source);
  if (!match) return null;

  const closing = match[1] === "/";
  const name = match[2].toLowerCase();
  if (!ALLOWED_TAGS.has(name)) return "";

  if (name === "a") {
    if (closing) return "</a>";
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(source);
    const url = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim();
    if (!/^(https?:\/\/|mailto:)[^\s"']+$/i.test(url)) return "";
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">`;
  }

  if (closing) return `</${name}>`;
  return VOID_TAGS.has(name) ? `<${name} />` : `<${name}>`;
}

/**
 * Strict allowlist sanitiser for stored rich-text descriptions.
 *
 * Text between tags is escaped, so a malformed tag can never become a real
 * element, and anything not explicitly allowed is dropped. Safe against the
 * stored-XSS path where an invoice description is rendered with
 * `dangerouslySetInnerHTML` on the admin and client-facing payment pages.
 */
export function sanitizeHtml(value?: string | null): string {
  const input = value || "";
  let out = "";
  let cursor = 0;

  while (cursor < input.length) {
    const open = input.indexOf("<", cursor);
    if (open === -1) {
      out += escapeHtml(input.slice(cursor));
      break;
    }
    out += escapeHtml(input.slice(cursor, open));

    const close = input.indexOf(">", open);
    if (close === -1) {
      // Unterminated tag: the remainder is plain text.
      out += escapeHtml(input.slice(open));
      break;
    }

    const tag = input.slice(open, close + 1);
    const rebuilt = rebuildTag(tag);
    out += rebuilt === null ? escapeHtml(tag) : rebuilt;
    cursor = close + 1;
  }

  return out;
}

/** Convert a stored description (HTML from the rich editor, or legacy plain text) into safe display HTML. */
export function richText(value?: string | null): string {
  if (!value) return "";
  // Legacy plain-text descriptions get real line breaks; everything then goes
  // through the same allowlist sanitiser.
  return sanitizeHtml(value.replace(/\n/g, "<br />"));
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
