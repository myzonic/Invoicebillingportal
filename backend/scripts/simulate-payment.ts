import crypto from "crypto";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { PaymentMethod, PaymentStatus } from "@prisma/client";

const SQUARE_API = env.square.environment === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

const FIXED_TEST_SOURCE = "cnon:card-nonce-ok";

async function squareFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SQUARE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.square.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": "2025-01-23",
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = (body as { errors?: Array<{ detail?: string; code?: string }> }).errors;
    throw new Error(errors?.map((e) => e.detail || e.code).join(", ") || `Square API ${res.status}`);
  }
  return body as Record<string, unknown>;
}

async function main() {
  const invoiceId = process.argv[2];
  const invoice = invoiceId
    ? await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { client: true } })
    : null;
  if (!invoice) throw new Error(`Invoice not found: ${invoiceId || "(none)"}`);

  console.log(`\nCharging ${invoice.currency} ${Number(invoice.total).toFixed(2)} on invoice ${invoice.number} (${invoice.id})`);
  console.log(`Location: ${env.square.locationId} | Environment: ${env.square.environment}\n`);

  const orderResult = await squareFetch("/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: env.square.locationId,
        reference_id: invoice.id,
        line_items: [
          {
            name: `Invoice ${invoice.number}`,
            quantity: "1",
            base_price_money: { amount: Math.round(Number(invoice.total) * 100), currency: invoice.currency },
          },
        ],
      },
    }),
  });
  const orderId = (orderResult.order as { id?: string })?.id;
  if (!orderId) throw new Error("Square did not return an order id");
  console.log(`Order created: ${orderId}`);

  const paymentResult = await squareFetch("/v2/payments", {
    method: "POST",
    body: JSON.stringify({
      source_id: FIXED_TEST_SOURCE,
      idempotency_key: crypto.randomUUID(),
      amount_money: { amount: Math.round(Number(invoice.total) * 100), currency: invoice.currency },
      order_id: orderId,
      location_id: env.square.locationId,
      reference_id: invoice.id,
    }),
  });
  const payment = paymentResult.payment as { id?: string; status?: string; receipt_url?: string };
  if (!payment?.id) throw new Error("Square did not return a payment");

  if (payment.status !== "COMPLETED") {
    throw new Error(`Payment not completed: status=${payment.status}`);
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  await prisma.payment.upsert({
    where: { id: (await prisma.payment.findFirst({ where: { invoiceId: invoice.id } }))?.id || "none" },
    update: { status: PaymentStatus.SUCCEEDED, reference: payment.id, capturedAt: new Date() },
    create: {
      invoiceId: invoice.id,
      amount: invoice.total,
      currency: invoice.currency,
      method: PaymentMethod.SQUARE,
      status: PaymentStatus.SUCCEEDED,
      reference: payment.id,
      capturedAt: new Date(),
    },
  });

  console.log(`PAYMENT COMPLETED: ${payment.id}`);
  console.log(`Receipt: ${payment.receipt_url || "n/a"}`);
  console.log(`Invoice ${invoice.number} marked PAID.\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FAILED:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
