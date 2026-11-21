import type { Brand, InvoiceDesign, InvoiceDesignColors, InvoiceLayout } from "@/types";

export interface LayoutMeta {
  id: InvoiceLayout;
  label: string;
  blurb: string;
}

/** Order matters: it is the order shown in the layout picker. */
export const INVOICE_LAYOUTS: LayoutMeta[] = [
  { id: "modern", label: "Modern", blurb: "Crisp white header with a strong accent rule" },
  { id: "minimal", label: "Minimal", blurb: "Ultra-light rules and maximum whitespace" },
  { id: "corporate", label: "Corporate", blurb: "Solid brand band, structured and formal" },
  { id: "elegant", label: "Elegant", blurb: "Soft tinted panels, refined and quiet" },
  { id: "premium", label: "Premium", blurb: "Deep header band with a bold total panel" },
  { id: "creative", label: "Creative", blurb: "Offset colour block with lively accents" },
  { id: "compact", label: "Compact", blurb: "Dense one-pager for long item lists" },
  { id: "legacy", label: "Classic", blurb: "Original black & gold look (pre-redesign)" },
];

export const LAYOUT_LABEL: Record<InvoiceLayout, string> = INVOICE_LAYOUTS.reduce(
  (acc, l) => ({ ...acc, [l.id]: l.label }),
  {} as Record<InvoiceLayout, string>,
);

export const DEFAULT_INVOICE_DESIGN: InvoiceDesign = {
  layout: "modern",
  colors: {
    primary: "#111827",
    secondary: "#2563eb",
    accent: "#0f766e",
    supporting: "#f1f5f9",
  },
};

export const COLOR_ROLES: Array<{ key: keyof InvoiceDesignColors; label: string; hint: string }> = [
  { key: "primary", label: "Primary", hint: "Header, ink, total panel" },
  { key: "secondary", label: "Secondary", hint: "Headings and labels" },
  { key: "accent", label: "Accent", hint: "Totals and highlights" },
  { key: "supporting", label: "Supporting", hint: "Soft panels and fills" },
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hex(value: unknown, fallback: string): string {
  const raw = String(value || "").trim();
  if (!HEX_RE.test(raw)) return fallback;
  if (raw.length === 4) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  return raw.toLowerCase();
}

/** Normalise stored design JSON; malformed or missing values return null. */
export function normalizeInvoiceDesign(value: unknown): InvoiceDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const layout = typeof raw.layout === "string" && LAYOUT_LABEL[raw.layout as InvoiceLayout]
    ? (raw.layout as InvoiceLayout)
    : DEFAULT_INVOICE_DESIGN.layout;
  const colorsRaw = (
    raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors) ? raw.colors : raw
  ) as Record<string, unknown>;
  return {
    layout,
    colors: {
      primary: hex(colorsRaw.primary, DEFAULT_INVOICE_DESIGN.colors.primary),
      secondary: hex(colorsRaw.secondary, DEFAULT_INVOICE_DESIGN.colors.secondary),
      accent: hex(colorsRaw.accent, DEFAULT_INVOICE_DESIGN.colors.accent),
      supporting: hex(colorsRaw.supporting, DEFAULT_INVOICE_DESIGN.colors.supporting),
    },
  };
}

/** Invoice-level override wins, then the brand design. */
export function resolveInvoiceDesign(
  invoice?: { designOverride?: unknown } | null,
  brand?: Pick<Brand, "invoiceDesign"> | null,
): InvoiceDesign | null {
  return normalizeInvoiceDesign(invoice?.designOverride) || normalizeInvoiceDesign(brand?.invoiceDesign);
}

export function sameDesign(a?: InvoiceDesign | null, b?: InvoiceDesign | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.layout === b.layout &&
    a.colors.primary === b.colors.primary &&
    a.colors.secondary === b.colors.secondary &&
    a.colors.accent === b.colors.accent &&
    a.colors.supporting === b.colors.supporting
  );
}

/* ------------------------------------------------------------------ */
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

export function hexToRgb(hexColor: string): [number, number, number] {
  let h = (hexColor || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return [17, 24, 39];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend `t` of `b` into `a` (0 = a, 1 = b). */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Move towards white (amount > 0) or black (amount < 0). */
export function tint(hexColor: string, amount: number): string {
  return mixHex(hexColor, amount >= 0 ? "#ffffff" : "#000000", Math.abs(amount));
}

export function luminance(hexColor: string): number {
  const [r, g, b] = hexToRgb(hexColor).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour for a given background. */
export function readableOn(hexColor: string): string {
  return luminance(hexColor) > 0.55 ? "#111827" : "#ffffff";
}

function rgbDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/* ------------------------------------------------------------------ */
/* Logo palette extraction                                             */
/* ------------------------------------------------------------------ */

function isBackgroundish(r: number, g: number, b: number): boolean {
  // White / near-white page backgrounds and very light greys are not brand colours.
  return r > 244 && g > 244 && b > 244;
}

async function drawToPalette(img: HTMLImageElement | ImageBitmap, maxSide = 180): Promise<string[]> {
  const naturalW = "naturalWidth" in img ? img.naturalWidth : img.width;
  const naturalH = "naturalHeight" in img ? img.naturalHeight : img.height;
  if (!naturalW || !naturalH) return [];

  const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 140) continue; // transparent pixel
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isBackgroundish(r, g, b)) continue;
    // Quantise to 16 levels per channel so similar pixels collapse together.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  const candidates = [...buckets.values()]
    .map((bk) => ({
      count: bk.count,
      hex: rgbToHex(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count),
    }))
    .sort((x, y) => y.count - x.count);

  // Keep visually distinct colours, strongest first; drop muddy near-duplicates.
  const picked: string[] = [];
  for (const c of candidates) {
    if (picked.length >= 8) break;
    if (picked.some((p) => rgbDistance(p, c.hex) < 58)) continue;
    picked.push(c.hex);
  }
  return picked;
}

async function loadImageElement(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo load failed"));
    img.src = src;
  });
}

/**
 * Extract the dominant, visually distinct colours of a logo.
 * Never throws: returns [] when the image cannot be read (e.g. cross-origin
 * without CORS), so the UI can fall back to manual colour selection.
 */
export async function extractLogoPalette(src: string): Promise<string[]> {
  if (!src) return [];

  // 1) Same-origin / CORS-enabled: fetch as a blob so the canvas never taints.
  try {
    const res = await fetch(src, { credentials: "omit" });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadImageElement(url, false);
        const palette = await drawToPalette(img);
        if (palette.length) return palette;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    /* fall through */
  }

  // 2) Direct load with CORS headers.
  try {
    const img = await loadImageElement(src, true);
    return await drawToPalette(img);
  } catch {
    /* fall through */
  }

  // 3) Last resort: plain load. Works same-origin; throws if the canvas is tainted.
  try {
    const img = await loadImageElement(src, false);
    return await drawToPalette(img);
  } catch {
    return [];
  }
}

/** Suggest sensible role assignments from an extracted palette (strongest colour = primary). */
export function suggestColors(palette: string[]): InvoiceDesignColors {
  const [first, second, third, fourth] = palette;
  const primary = first || DEFAULT_INVOICE_DESIGN.colors.primary;
  return {
    primary,
    secondary: second || tint(primary, -0.15),
    accent: third || second || tint(primary, 0.25),
    supporting: fourth || tint(primary, 0.9),
  };
}

/** Build a brand design from a palette (used right after the first extraction). */
export function designFromPalette(palette: string[], layout: InvoiceLayout = "modern"): InvoiceDesign {
  return { layout, colors: suggestColors(palette) };
}
