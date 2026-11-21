import { InvoiceStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type MonetaryPayment = {
  amount: Prisma.Decimal | number;
  currency: string;
  status?: string;
  invoiceAmount?: Prisma.Decimal | number | null;
  invoiceCurrency?: string | null;
  exchangeRate?: Prisma.Decimal | number | null;
};

export function numeric(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value) {
    const fn = (value as { toNumber?: unknown }).toNumber;
    if (typeof fn === "function") return Number((fn as () => unknown).call(value)) || 0;
  }
  return 0;
}

/** Only completed payments count. Pending/failed/abandoned/refunded never do. */
export function succeededPayments(payments: MonetaryPayment[]): MonetaryPayment[] {
  return payments.filter((p) => p.status === undefined || p.status === PaymentStatus.SUCCEEDED);
}

/**
 * Converts a payment back into the invoice's own currency using the snapshot
 * stored at quote time, so different currencies are never added together.
 */
export function paidAmountForInvoice(invoice: { currency: string }, payments: MonetaryPayment[]): number {
  let paid = 0;
  for (const payment of succeededPayments(payments)) {
    if (payment.invoiceCurrency && payment.invoiceAmount != null) {
      if (payment.invoiceCurrency === invoice.currency) paid += numeric(payment.invoiceAmount);
      else if (payment.exchangeRate != null) paid += numeric(payment.amount) * numeric(payment.exchangeRate);
      continue;
    }
    if (payment.currency === invoice.currency) paid += numeric(payment.amount);
    else if (payment.exchangeRate != null) paid += numeric(payment.amount) * numeric(payment.exchangeRate);
  }
  return Math.round(paid * 100) / 100;
}

export function outstandingAmount(invoice: { currency: string; total: Prisma.Decimal | number }, payments: MonetaryPayment[]): number {
  return Math.max(0, Math.round((numeric(invoice.total) - paidAmountForInvoice(invoice, payments)) * 100) / 100);
}

/**
 * Stored status after a payment event. `DRAFT`/`SENT` are preserved while unpaid
 * so "created but not sent" and "sent = Active" remain distinct.
 */
export function deriveInvoiceStatus(
  invoice: { status: InvoiceStatus; currency: string; total: Prisma.Decimal | number },
  payments: MonetaryPayment[],
): InvoiceStatus {
  if (invoice.status === InvoiceStatus.CANCELLED) return InvoiceStatus.CANCELLED;
  const balance = outstandingAmount(invoice, payments);
  if (balance <= 0 && numeric(invoice.total) > 0) return InvoiceStatus.PAID;
  if (paidAmountForInvoice(invoice, payments) > 0) return InvoiceStatus.PARTIALLY_PAID;
  return invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.SENT
    ? invoice.status
    : InvoiceStatus.SENT;
}

/**
 * Status shown to users. OVERDUE is calculated from the due date and the real
 * outstanding balance at read time — it is never persisted, so it can't go
 * stale when a due date changes or a late payment arrives.
 */
export function effectiveInvoiceStatus(
  invoice: { status: InvoiceStatus; currency: string; total: Prisma.Decimal | number; dueDate: Date | null },
  payments: MonetaryPayment[],
  now = new Date(),
): InvoiceStatus {
  if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.DRAFT) {
    return invoice.status;
  }
  if (invoice.dueDate && invoice.dueDate.getTime() < now.getTime() && outstandingAmount(invoice, payments) > 0) {
    return InvoiceStatus.OVERDUE;
  }
  return invoice.status;
}

/** Display label used on PDFs and emails. SENT is called "Active". */
export function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case InvoiceStatus.SENT:
      return "ACTIVE";
    case InvoiceStatus.PARTIALLY_PAID:
      return "PARTIALLY PAID";
    case InvoiceStatus.DRAFT:
      return "DRAFT";
    case InvoiceStatus.PAID:
      return "PAID";
    case InvoiceStatus.OVERDUE:
      return "OVERDUE";
    case InvoiceStatus.CANCELLED:
      return "CANCELLED";
    default:
      return String(status);
  }
}

/** Recompute and persist stored status after a verified payment event. */
export async function syncInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const status = deriveInvoiceStatus(invoice, invoice.payments);
  const paidAt = status === InvoiceStatus.PAID ? (invoice.paidAt ?? new Date()) : null;

  if (invoice.status !== status || (invoice.paidAt?.getTime() ?? null) !== (paidAt?.getTime() ?? null)) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status, paidAt } });
  }
  return status;
}
