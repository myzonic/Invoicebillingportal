import crypto from "crypto";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { convertToUsd } from "./rates";
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

/**
 * Square Dashboard unit (location) where portal invoices are mirrored.
 * This is the `currentUnitToken` from the Square Dashboard URL.
 */
const SQUARE_INVOICE_LOCATION_ID = "L3BV11T2WA32R";
export const squareInvoiceLocationId = SQUARE_INVOICE_LOCATION_ID;

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
  const conversion = await convertToUsd(Number(invoice.total), invoice.currency);
  const chargeAmount = conversion.amount;
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
      locationId: cfg.locationId,
      invoiceAmount: Number(invoice.total),
      invoiceCurrency: invoice.currency,
      exchangeRate: conversion.rate,
      exchangeRateProvider: conversion.provider,
      exchangeRateAt: conversion.rateAt,
      usdAmount: chargeAmount,
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
  // The amount and the currency must always describe the same money. This once
  // fell back to `invoice.currency` when no per-currency Square location was
  // configured, while keeping the already-converted amount, so a USD-converted
  // figure was sent labelled with the invoice's own currency and the client was
  // charged the wrong amount. Use the requested currency verbatim, or refuse to
  // charge at all.
  const currency = opts.currency ?? invoice.currency;
  if (!env.square.locations[currency] && currency !== env.square.defaultCurrency) {
    throw new Error(`No Square location is configured for ${currency}; refusing to charge invoice ${invoice.number}.`);
  }
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

interface SquareCustomerResult { id?: string }
interface SquareOrderResult { id?: string }
interface SquareInvoiceResult { id?: string }

type SyncClient = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  squareCustomerId?: string | null;
};

type SyncInvoice = Pick<Invoice, "id" | "number" | "total" | "currency" | "dueDate"> & {
  client?: SyncClient | null;
};

function dueDateString(value: Date | null): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

/** Reuses a stored Square customer, otherwise finds/creates one by email. */
async function ensureSquareCustomer(client: SyncClient, accessToken: string): Promise<string> {
  if (client.squareCustomerId) return client.squareCustomerId;

  const email = client.email?.trim();
  if (!email) throw new Error(`Client ${client.name} needs an email to create a Square invoice`);

  const search = await squareFetch("/v2/customers/search", {
    method: "POST",
    body: JSON.stringify({
      limit: 1,
      query: { filter: { email_address: { exact: email } } },
    }),
  }, accessToken);
  const existingId = (search.customers as SquareCustomerResult[] | undefined)?.[0]?.id;
  if (existingId) {
    await prisma.client.update({ where: { id: client.id }, data: { squareCustomerId: existingId } });
    return existingId;
  }

  const names = client.name.trim().split(/\s+/).filter(Boolean);
  const created = await squareFetch("/v2/customers", {
    method: "POST",
    body: JSON.stringify({
      given_name: names.shift() || client.name || "Customer",
      family_name: names.join(" ") || undefined,
      email_address: email,
      phone_number: client.phone?.trim() || undefined,
      reference_id: client.id,
    }),
  }, accessToken);
  const customerId = (created.customer as SquareCustomerResult | undefined)?.id;
  if (!customerId) throw new Error("Square did not return a customer id");
  await prisma.client.update({ where: { id: client.id }, data: { squareCustomerId: customerId } });
  return customerId;
}

/**
 * Creates a DRAFT invoice in the configured Square Dashboard as soon as a
 * portal invoice is created. It is never published here: nothing is emailed or
 * charged from Square until it is reviewed and published in the Dashboard.
 */
export async function syncInvoiceToSquare(invoice: SyncInvoice): Promise<string | null> {
  const client = invoice.client;
  if (!client) return null;

  const cfg = configFor(env.square.defaultCurrency);
  const chargeCurrency = env.square.defaultCurrency.toUpperCase();
  const invoiceCurrency = invoice.currency.toUpperCase();
  const conversion = invoiceCurrency === chargeCurrency
    ? null
    : await convertToUsd(Number(invoice.total), invoiceCurrency);
  const chargeAmount = conversion ? conversion.amount : Number(invoice.total);

  const customerId = await ensureSquareCustomer(client, cfg.accessToken);

  const orderResult = await squareFetch("/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `portal-order-${invoice.id}`,
      order: {
        location_id: SQUARE_INVOICE_LOCATION_ID,
        reference_id: `portal-invoice-${invoice.id}`,
        line_items: [
          {
            name: `Invoice ${invoice.number}`,
            quantity: "1",
            base_price_money: { amount: cents(chargeAmount), currency: chargeCurrency },
          },
        ],
      },
    }),
  }, cfg.accessToken);
  const orderId = (orderResult.order as SquareOrderResult | undefined)?.id;
  if (!orderId) throw new Error("Square did not return an order id");

  const invoiceResult = await squareFetch("/v2/invoices", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `portal-invoice-${invoice.id}`,
      invoice: {
        location_id: SQUARE_INVOICE_LOCATION_ID,
        order_id: orderId,
        primary_recipient: { customer_id: customerId },
        invoice_number: invoice.number,
        title: `Invoice ${invoice.number}`,
        description: conversion
          ? `Portal invoice ${invoice.number} — ${Number(invoice.total).toFixed(2)} ${invoice.currency}, converted to ${chargeCurrency} at ${conversion.rate}.`
          : "Created automatically from the billing portal.",
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: dueDateString(invoice.dueDate),
            tipping_enabled: false,
            automatic_payment_source: "NONE",
          },
        ],
      },
    }),
  }, cfg.accessToken);
  const squareInvoiceId = (invoiceResult.invoice as SquareInvoiceResult | undefined)?.id;
  if (!squareInvoiceId) throw new Error("Square did not return an invoice id");

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { squareInvoiceId },
  });
  return squareInvoiceId;
}

/** The public URL Square POSTs event notifications to (part of the signature). */
function notificationUrl(): string {
  if (env.square.webhookUrl) return env.square.webhookUrl;
  return `${env.apiUrl.replace(/\/+$/, "")}/api/webhooks/square`;
}

/**
 * Verifies the Square webhook signature (HMAC-SHA256).
 *
 * Square signs the notification URL concatenated with the raw request body and
 * sends the base64 digest in the `x-square-hmacsha256-signature` header. Note
 * that the digest is *not* wrapped in a `{prefix}_` envelope.
 *
 * This fails closed. Previously an unset signature key meant every caller was
 * trusted, and the digest was computed over the body alone, so a configured key
 * would have rejected every genuine webhook instead.
 */
export function verifyWebhookSignature(signature: string, rawBody: string, url: string = notificationUrl()): boolean {
  const key = env.square.webhookSignatureKey;
  if (!key || !signature) return false;

  const computed = Buffer.from(crypto.createHmac("sha256", key).update(url + rawBody, "utf8").digest("base64"), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (provided.length !== computed.length) return false;
  return crypto.timingSafeEqual(provided, computed);
}
