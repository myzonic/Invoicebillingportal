import { computeInvoiceTotals } from "../src/services/invoiceMath";
import { normalizeBuilderData } from "../src/services/invoiceBuilder";

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

console.log("Invoice builder maths:");

const legacy = computeInvoiceTotals({
  items: [
    { description: "a", quantity: 2, unitPrice: 100 },
    { description: "b", quantity: 1, unitPrice: 50 },
  ],
  taxRate: 10,
  discountAmount: 25,
});
check("legacy subtotal unchanged", legacy.subtotal, 250);
check("legacy tax unchanged", legacy.taxAmount, 25);
check("legacy total unchanged", legacy.total, 250);

const withExtras = computeInvoiceTotals({
  items: [
    { description: "a", quantity: 2, unitPrice: 100, discount: 20, taxRate: 10 },
    { description: "b", quantity: 1, unitPrice: 50, taxRate: 0 },
  ],
  taxRate: 10,
  discountAmount: 25,
  shipping: 30,
});
check("item discounts", withExtras.itemDiscounts, 20);
check("taxable base", withExtras.taxableAmount, 230);
check("per-item + global tax", withExtras.taxAmount, 18);
check("shipping included", withExtras.shipping, 30);
check("final total", withExtras.total, 253);

const builder = normalizeBuilderData({
  paperSize: "LETTER",
  typography: "serif",
  shipping: 12.5,
  customerCompany: "Acme Pty Ltd",
  internalNotes: "secret",
  attachments: [{ name: "doc.pdf", url: "/uploads/a.pdf" }, { name: "bad", url: "javascript:alert(1)" }],
});
check("paper size", builder.paperSize, "LETTER");
check("typography", builder.typography, "serif");
check("customer company", builder.customerCompany, "Acme Pty Ltd");
check("unsafe attachment dropped", builder.attachments.length, 1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
