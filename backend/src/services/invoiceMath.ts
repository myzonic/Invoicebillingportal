/**
 * Pure invoice mathematics shared by create/update/preview and verification.
 * When no per-item discount/tax or shipping is present, results are identical
 * to the original calculator: subtotal + subtotal*taxRate - discountAmount.
 */
export interface MathItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

export interface InvoiceTotalsInput {
  items: MathItem[];
  taxRate: number;
  discountAmount: number;
  shipping?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  itemDiscounts: number;
  taxableAmount: number;
  taxAmount: number;
  shipping: number;
  discountAmount: number;
  total: number;
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const taxRate = Number(input.taxRate) || 0;
  const discountAmount = Math.max(0, Number(input.discountAmount) || 0);
  const shipping = Math.max(0, Number(input.shipping) || 0);

  let subtotal = 0;
  let itemDiscounts = 0;
  let taxableAmount = 0;
  let taxAmount = 0;

  for (const raw of input.items || []) {
    const quantity = Number(raw.quantity) || 0;
    const unitPrice = Number(raw.unitPrice) || 0;
    const lineGross = round2(quantity * unitPrice);
    const lineDiscount = Math.min(lineGross, Math.max(0, Number(raw.discount) || 0));
    const lineNet = round2(lineGross - lineDiscount);
    const lineRate = raw.taxRate == null ? taxRate : Number(raw.taxRate) || 0;

    subtotal = round2(subtotal + lineGross);
    itemDiscounts = round2(itemDiscounts + lineDiscount);
    taxableAmount = round2(taxableAmount + lineNet);
    taxAmount = round2(taxAmount + (lineNet * lineRate) / 100);
  }

  const total = Math.max(0, round2(taxableAmount + taxAmount - discountAmount + shipping));
  return { subtotal, itemDiscounts, taxableAmount, taxAmount, shipping, discountAmount, total };
}

/** Legacy-compatible calculator: used when callers only know the three original fields. */
export function computeTotalsLegacy(items: MathItem[], taxRate: number, discountAmount: number) {
  const { subtotal, taxAmount, total } = computeInvoiceTotals({ items, taxRate, discountAmount });
  return { subtotal, taxAmount, total };
}
