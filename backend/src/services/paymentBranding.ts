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

function luminance(color: string): number {
  const full = color.replace("#", "");
  const value = Number.parseInt(full.length === 3 ? full.split("").map((c) => c + c).join("") : full, 16);
  if (Number.isNaN(value)) return 0;
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
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

  // Text sits on the supporting/background surface. Prefer the brand's own
  // ink, then its secondary color; only fall back to a neutral when neither
  // configured color is readable. This never pulls another brand's identity.
  const text = [primary, secondary].find((color) => contrast(color, supporting) >= 4.5)
    || (luminance(supporting) > 0.5 ? neutral.text : "#ffffff");

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
      text,
      button: accent,
    },
  };
}
