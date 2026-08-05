import crypto from "crypto";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { convertAmount } from "./rates";
import { Invoice, PaymentMethod, PaymentStatus } from "@prisma/client";

const SQUARE_API = env.square.environment === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

interface SquareConfig {
  accessToken: string;
  locationId: string;
  applicationId: string;
}

/** Picks the Square credentials/location for an invoice currency (falls back to defaults). */
function configFor(currency: string): SquareConfig {
  return env.square.locations[currency] || {
    accessToken: env.square.accessToken,
    locationId: env.square.locationId,
    applicationId: env.square.applicationId,
  };
}

async function squareFetch(path: string, init?: RequestInit, accessToken?: string) {
  const res = await fetch(`${SQUARE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken || env.square.accessToken}`,
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

interface SquareOrderLineItem {
  name?: string;
  quantity?: string;
  base_price_money?: { amount: bigint | number | string; currency: string };
}

interface SquarePaymentLink {
  id?: string;
  url?: string;
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

/**
 * Creates a Square-hosted checkout (payment link) for an invoice.
 * The merchant account is USD-only, so the link charges the USD-converted
 * amount via the USD location. Returns the checkout URL to redirect to.
 */
export async function createInvoiceCheckoutUrl(invoice: Invoice & { client?: { email?: string | null } | null }) {
  const chargeCurrency = "USD";
  const chargeAmount =
    chargeCurrency === invoice.currency ? Number(invoice.total) : await convertAmount(Number(invoice.total), invoice.currency, chargeCurrency);
  const cfg = configFor(chargeCurrency);
  const body: Record<string, unknown> = {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: cfg.locationId,
      reference_id: invoice.id,
      line_items: [
        {
          name: `Invoice ${invoice.number}`,
          quantity: "1",
          base_price_money: { amount: cents(chargeAmount), currency: chargeCurrency },
        },
      ],
    },
    checkout_options: {
      redirect_url: `${env.clientUrl}/payment_success?invoice=${invoice.id}`,
      merchant_support_email: invoice.client?.email || undefined,
    },
  };

  const result = await squareFetch("/v2/online-checkout/payment-links", {
    method: "POST",
    body: JSON.stringify(body),
  }, cfg.accessToken);
  const link = (result.payment_link as SquarePaymentLink) || {};
  const url = link.url;
  if (!url) throw new Error("Square did not return a payment link");

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { squarePaymentLink: url },
  });

  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      amount: chargeAmount,
      currency: chargeCurrency,
      method: PaymentMethod.SQUARE,
      status: PaymentStatus.PENDING,
      reference: link.id,
    },
  });

  return url;
}

/** Looks up the reference_id (our invoice id) stored on the Square order. */
export async function getOrderReferenceId(orderId: string): Promise<string | null> {
  const result = await squareFetch(`/v2/orders/${encodeURIComponent(orderId)}`);
  return ((result.order as { reference_id?: string } | undefined)?.reference_id) || null;
}

export interface SquarePayment {
  id?: string;
  status?: string;
  receipt_url?: string;
}

/** Billing address collected on the checkout page, forwarded to Square for AVS. */
export interface BillingAddress {
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
}

/**
 * Charges an invoice directly using a tokenized card from the Square Web
 * Payments SDK (sourceId is the `token` from `card.tokenize()`). Returns the
 * created Square payment object. `currency`/`amount` override the invoice's
 * own values (used for country-localised payments).
 */
export async function chargeInvoiceWithToken(
  invoice: Invoice,
  sourceId: string,
  opts: { currency?: string; amount?: number; billing?: BillingAddress } = {},
): Promise<SquarePayment> {
  const currency = opts.currency && env.square.locations[opts.currency] ? opts.currency : invoice.currency;
  const amount = opts.amount != null ? opts.amount : Number(invoice.total);
  const cfg = configFor(currency);

  const b = opts.billing;
  const billing_address = b && (b.addressLine1 || b.postalCode || b.countryCode)
    ? {
        first_name: b.name?.split(/\s+/)[0] || undefined,
        last_name: b.name?.split(/\s+/).slice(1).join(" ") || undefined,
        address_line_1: b.addressLine1 || undefined,
        address_line_2: b.addressLine2 || undefined,
        locality: b.city || undefined,
        administrative_district_line_1: b.state || undefined,
        postal_code: b.postalCode || undefined,
        country: b.countryCode || undefined,
      }
    : undefined;

  const result = await squareFetch("/v2/payments", {
    method: "POST",
    body: JSON.stringify({
      source_id: sourceId,
      idempotency_key: crypto.randomUUID(),
      amount_money: { amount: cents(amount), currency },
      location_id: cfg.locationId,
      reference_id: invoice.id,
      note: `Invoice ${invoice.number}`,
      ...(billing_address ? { billing_address } : {}),
    }),
  }, cfg.accessToken);
  const payment = (result.payment as SquarePayment) || {};
  if (!payment.id) throw new Error("Square did not return a payment");
  return payment;
}

/**
 * Verifies the Square webhook signature (HMAC-SHA256).
 * Format of header value: `{prefix}_{base64(hmac)}` where prefix is the
 * part of the signature key before the first underscore.
 */
export function verifyWebhookSignature(signature: string, rawBody: string): boolean {
  if (!env.square.webhookSignatureKey) return true;
  const split = signature.split("_");
  const prefix = split[0];
  const provided = split.slice(1).join("_");
  const hmac = crypto.createHmac("sha256", env.square.webhookSignatureKey);
  const expected = hmac.update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) && prefix.length > 0;
  } catch {
    return false;
  }
}
