import { InvoiceStatus, PaymentStatus } from "@prisma/client";
import {
  deriveInvoiceStatus,
  effectiveInvoiceStatus,
  outstandingAmount,
  paidAmountForInvoice,
} from "../src/services/invoiceStatus";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const invoice = { status: InvoiceStatus.DRAFT, currency: "USD", total: 1000, dueDate: new Date("2026-11-01T00:00:00Z") };
const payment = (amount: number, status: PaymentStatus, extra: Record<string, unknown> = {}) => ({ amount, currency: "USD", status, ...extra });

console.log("Automatic invoice status:");

check("new invoice stays Draft", deriveInvoiceStatus(invoice, []), InvoiceStatus.DRAFT);
check("sent invoice stays Active (SENT)", deriveInvoiceStatus({ ...invoice, status: InvoiceStatus.SENT }, []), InvoiceStatus.SENT);
check(
  "pending payment does not change status",
  deriveInvoiceStatus(invoice, [payment(1000, PaymentStatus.PENDING)]),
  InvoiceStatus.DRAFT,
);
check(
  "failed payment does not change status",
  deriveInvoiceStatus(invoice, [payment(1000, PaymentStatus.FAILED)]),
  InvoiceStatus.DRAFT,
);
check(
  "partial payment becomes Partially paid",
  deriveInvoiceStatus({ ...invoice, status: InvoiceStatus.SENT }, [payment(400, PaymentStatus.SUCCEEDED)]),
  InvoiceStatus.PARTIALLY_PAID,
);
check(
  "full payment becomes Paid",
  deriveInvoiceStatus({ ...invoice, status: InvoiceStatus.SENT }, [payment(1000, PaymentStatus.SUCCEEDED)]),
  InvoiceStatus.PAID,
);
check(
  "refunded payment is excluded",
  deriveInvoiceStatus({ ...invoice, status: InvoiceStatus.PAID }, [payment(1000, PaymentStatus.REFUNDED)]),
  InvoiceStatus.SENT,
);
check(
  "cancelled invoice is never re-opened",
  deriveInvoiceStatus({ ...invoice, status: InvoiceStatus.CANCELLED }, [payment(1000, PaymentStatus.SUCCEEDED)]),
  InvoiceStatus.CANCELLED,
);
check(
  "mixed-currency payment converts using snapshot",
  paidAmountForInvoice({ currency: "AUD" }, [
    payment(750, PaymentStatus.SUCCEEDED, { currency: "USD", exchangeRate: 1.5, invoiceAmount: 1125, invoiceCurrency: "AUD" }),
  ]),
  1125,
);
check(
  "remaining balance uses converted amount",
  outstandingAmount({ currency: "AUD", total: 1500 }, [
    payment(750, PaymentStatus.SUCCEEDED, { currency: "USD", exchangeRate: 1.5, invoiceAmount: 1125, invoiceCurrency: "AUD" }),
  ]),
  375,
);

const now = new Date("2026-11-10T00:00:00Z");
const overdueBase = { ...invoice, status: InvoiceStatus.SENT };
check(
  "overdue calculated from due date + balance",
  effectiveInvoiceStatus(overdueBase, [payment(400, PaymentStatus.SUCCEEDED)], now),
  InvoiceStatus.OVERDUE,
);
check(
  "fully paid invoice is never overdue",
  effectiveInvoiceStatus({ ...overdueBase, status: InvoiceStatus.PAID }, [payment(1000, PaymentStatus.SUCCEEDED)], now),
  InvoiceStatus.PAID,
);
check(
  "draft invoice is never overdue",
  effectiveInvoiceStatus(invoice, [], now),
  InvoiceStatus.DRAFT,
);
check(
  "not yet due invoice stays Active",
  effectiveInvoiceStatus({ ...overdueBase, dueDate: new Date("2026-12-01T00:00:00Z") }, [], now),
  InvoiceStatus.SENT,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
