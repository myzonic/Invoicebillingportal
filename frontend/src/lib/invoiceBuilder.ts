import type { BuilderData, InvoiceItem } from "@/types";

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

export function normalizeBuilderData(value: unknown): BuilderData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_BUILDER_DATA;
  const raw = value as Record<string, unknown>;
  const str = (key: keyof BuilderData) => String((raw as Record<string, unknown>)[key] || "");
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
        .map((a) => ({ name: String(a.name || "Attachment"), url: String(a.url || "") }))
        .filter((a) => a.url.startsWith("/uploads/"))
        .slice(0, 10)
    : [];
  return {
    ...DEFAULT_BUILDER_DATA,
    shipping: Math.max(0, Number(raw.shipping) || 0),
    paymentTerms: str("paymentTerms"),
    paymentInstructions: str("paymentInstructions"),
    internalNotes: str("internalNotes"),
    terms: str("terms"),
    depositRequired: raw.depositRequired === true,
    paperSize: raw.paperSize === "LETTER" ? "LETTER" : "A4",
    typography: raw.typography === "serif" || raw.typography === "mono" ? raw.typography : "sans",
    attachments,
    customerCompany: str("customerCompany"),
    customerTaxId: str("customerTaxId"),
    billingAddress: str("billingAddress"),
    shippingAddress: str("shippingAddress"),
  };
}

export interface BuilderTotals {
  subtotal: number;
  itemDiscounts: number;
  taxableAmount: number;
  taxAmount: number;
  shipping: number;
  discountAmount: number;
  total: number;
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Mirrors backend computeInvoiceTotals exactly. */
export function computeBuilderTotals(
  items: InvoiceItem[],
  taxRate: number,
  discountAmount: number,
  shipping: number,
): BuilderTotals {
  let subtotal = 0;
  let itemDiscounts = 0;
  let taxableAmount = 0;
  let taxAmount = 0;

  for (const raw of items || []) {
    const quantity = Number(raw.quantity) || 0;
    const unitPrice = Number(raw.unitPrice) || 0;
    const lineGross = round2(quantity * unitPrice);
    const lineDiscount = Math.min(lineGross, Math.max(0, Number(raw.discount) || 0));
    const lineNet = round2(lineGross - lineDiscount);
    const lineRate = raw.taxRate == null ? Number(taxRate) || 0 : Number(raw.taxRate) || 0;

    subtotal = round2(subtotal + lineGross);
    itemDiscounts = round2(itemDiscounts + lineDiscount);
    taxableAmount = round2(taxableAmount + lineNet);
    taxAmount = round2(taxAmount + (lineNet * lineRate) / 100);
  }

  const overallDiscount = Math.max(0, Number(discountAmount) || 0);
  const ship = Math.max(0, Number(shipping) || 0);
  return {
    subtotal,
    itemDiscounts,
    taxableAmount,
    taxAmount,
    shipping: ship,
    discountAmount: overallDiscount,
    total: Math.max(0, round2(taxableAmount + taxAmount - overallDiscount + ship)),
  };
}

export function lineTotal(item: InvoiceItem): number {
  return Math.max(0, round2(Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0)));
}

export function newItem(): InvoiceItem {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `item-${Date.now()}-${Math.random()}`,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    taxRate: undefined,
    notes: "",
  };
}

export function withIds(items: InvoiceItem[]): InvoiceItem[] {
  return items.map((i) => ({ ...i, id: i.id || newItem().id }));
}
