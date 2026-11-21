export interface BuilderData {
  shipping: number;
  paymentTerms: string;
  paymentInstructions: string;
  internalNotes: string;
  terms: string;
  depositRequired: boolean;
  paperSize: "A4" | "LETTER";
  typography: "sans" | "serif" | "mono";
  attachments: Array<{ name: string; url: string }>;
  customerCompany: string;
  customerTaxId: string;
  billingAddress: string;
  shippingAddress: string;
}

export const DEFAULT_BUILDER_DATA: BuilderData = {
  shipping: 0,
  paymentTerms: "",
  paymentInstructions: "",
  internalNotes: "",
  terms: "",
  depositRequired: false,
  paperSize: "A4",
  typography: "sans",
  attachments: [],
  customerCompany: "",
  customerTaxId: "",
  billingAddress: "",
  shippingAddress: "",
};

/** Unknown keys are ignored; malformed values fall back to safe defaults. */
export function normalizeBuilderData(value: unknown): BuilderData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_BUILDER_DATA;
  const raw = value as Record<string, unknown>;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
        .map((a) => ({ name: String(a.name || "Attachment"), url: String(a.url || "") }))
        .filter((a) => a.url.startsWith("/uploads/"))
        .slice(0, 10)
    : [];
  return {
    shipping: Math.max(0, Number(raw.shipping) || 0),
    paymentTerms: String(raw.paymentTerms || "").slice(0, 4000),
    paymentInstructions: String(raw.paymentInstructions || "").slice(0, 4000),
    internalNotes: String(raw.internalNotes || "").slice(0, 4000),
    terms: String(raw.terms || "").slice(0, 8000),
    depositRequired: raw.depositRequired === true,
    paperSize: raw.paperSize === "LETTER" ? "LETTER" : "A4",
    typography: raw.typography === "serif" || raw.typography === "mono" ? raw.typography : "sans",
    attachments,
    customerCompany: String(raw.customerCompany || "").slice(0, 300),
    customerTaxId: String(raw.customerTaxId || "").slice(0, 100),
    billingAddress: String(raw.billingAddress || "").slice(0, 2000),
    shippingAddress: String(raw.shippingAddress || "").slice(0, 2000),
  };
}
