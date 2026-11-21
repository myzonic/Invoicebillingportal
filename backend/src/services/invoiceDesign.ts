export const INVOICE_LAYOUTS = [
  "legacy",
  "modern",
  "minimal",
  "corporate",
  "elegant",
  "premium",
  "creative",
  "compact",
] as const;

export type InvoiceLayout = (typeof INVOICE_LAYOUTS)[number];

export interface InvoiceDesignColors {
  primary: string;
  secondary: string;
  accent: string;
  supporting: string;
}

export interface InvoiceDesign {
  layout: InvoiceLayout;
  colors: InvoiceDesignColors;
}

export const DEFAULT_INVOICE_DESIGN: InvoiceDesign = {
  layout: "modern",
  colors: {
    primary: "#111827",
    secondary: "#2563eb",
    accent: "#0f766e",
    supporting: "#f1f5f9",
  },
};

/** The portal now ships one clean document style for every new invoice. */
export const SINGLE_INVOICE_LAYOUT: InvoiceLayout = "minimal";

function hex(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    if (raw.length === 4) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    return raw.toLowerCase();
  }
  return fallback;
}

/** Normalise a stored design JSON value; malformed values return null. */
export function normalizeInvoiceDesign(value: unknown): InvoiceDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const layout = (
    typeof raw.layout === "string" && (INVOICE_LAYOUTS as readonly string[]).includes(raw.layout)
      ? raw.layout
      : DEFAULT_INVOICE_DESIGN.layout
  ) as InvoiceLayout;
  const colorsRaw = (raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors) ? raw.colors : raw) as Record<string, unknown>;
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

function tintHex(value: string, amount: number): string {
  const raw = hex(value, DEFAULT_INVOICE_DESIGN.colors.primary).slice(1);
  const n = parseInt(raw, 16);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * (1 - t) + target * t).toString(16).padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * The one design used by the editor, saved invoice, PDF and customer page.
 * Layout is fixed; only the selected brand's saved colours are carried across.
 */
export function designForBrand(brand?: { invoiceDesign?: unknown; color?: string | null; logoPalette?: unknown } | null): InvoiceDesign {
  const saved = normalizeInvoiceDesign(brand?.invoiceDesign);
  if (saved) return { layout: SINGLE_INVOICE_LAYOUT, colors: saved.colors };

  const palette = Array.isArray(brand?.logoPalette) ? brand.logoPalette : [];
  const base = hex(brand?.color || palette[0], DEFAULT_INVOICE_DESIGN.colors.primary);
  return {
    layout: SINGLE_INVOICE_LAYOUT,
    colors: {
      primary: base,
      secondary: tintHex(base, -0.18),
      accent: tintHex(base, 0.28),
      supporting: tintHex(base, 0.92),
    },
  };
}

/**
 * Invoice-level override wins, then the brand design. `null` means the invoice
 * has no explicit design and should inherit its brand (or use the legacy
 * renderer when the brand has never been configured).
 */
export function resolveInvoiceDesign(
  invoice: { designOverride?: unknown; color?: string | null },
  brand: { invoiceDesign?: unknown; color?: string | null } | null | undefined,
): InvoiceDesign | null {
  const override = normalizeInvoiceDesign(invoice?.designOverride);
  if (override) return override;
  return normalizeInvoiceDesign(brand?.invoiceDesign);
}
