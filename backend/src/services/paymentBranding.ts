import { normalizeInvoiceDesign } from "./invoiceDesign";
import { paymentDomain } from "./permalink";

/**
 * Neutral identity for unsupported/unknown payment hosts. It deliberately
 * contains no logo and no other brand's colors, so an unrecognised domain can
 * never inherit a configured brand's appearance.
 */
export const NEUTRAL_PAYMENT_BRAND = {
  id: "neutral",
  name: "Secure Payment",
  businessName: null as string | null,
  logoUrl: null as string | null,
  paymentDomain: "",
  currency: "USD",
  paymentEnabled: true,
  pdfFooter: null as string | null,
  colors: {
    primary: "#253238",
    secondary: "#4b5b63",
    accent: "#087f78",
    supporting: "#f4f7f8",
    background: "#f4f7f8",
    text: "#253238",
    button: "#087f78",
  },
} as const;

type BrandLike = {
  id: string;
  name: string;
  businessName?: string | null;
  logoUrl?: string | null;
  domain?: string | null;
  paymentSubdomain?: string | null;
  currency?: string | null;
  paymentEnabled?: boolean;
  color?: string | null;
  logoPalette?: unknown;
  invoiceDesign?: unknown;
  pdfFooter?: string | null;
};

function palette(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((color) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(color))
    .slice(0, 6);
}

function hex(value: unknown, fallback: string): string {
  const raw = String(value || "").trim().toLowerCase();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(raw) ? raw : fallback;
}

/**
 * Central, reusable identity payload for every client-facing payment surface.
 * Colors come only from the detected brand's stored design/logo palette.
 */
export function paymentBrandIdentity(brand: BrandLike | null | undefined) {
  if (!brand) return null;

  const design = normalizeInvoiceDesign(brand.invoiceDesign);
  const extracted = palette(brand.logoPalette);
  const neutral = NEUTRAL_PAYMENT_BRAND.colors;

  const primary = hex(design?.colors.primary || extracted[0], neutral.primary);
  const secondary = hex(design?.colors.secondary || extracted[1], primary);
  const accent = hex(design?.colors.accent || brand.color || extracted[2] || extracted[0], neutral.accent);
  const supporting = hex(design?.colors.supporting, neutral.supporting);

  return {
    id: brand.id,
    name: brand.name,
    businessName: brand.businessName || null,
    logoUrl: brand.logoUrl || null,
    paymentDomain: paymentDomain(brand),
    currency: brand.currency || "USD",
    paymentEnabled: brand.paymentEnabled !== false,
    pdfFooter: brand.pdfFooter?.trim() || null,
    colors: {
      primary,
      secondary,
      accent,
      supporting,
      // Semantic aliases used by the success screen. All six values are still
      // derived from this one brand's configuration, never from a default brand.
      background: supporting,
      text: primary,
      button: accent,
    },
  };
}
