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
