import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { convertToUsd } from "./rates";

/** How long a locked rate/USD amount remains valid for a payment attempt. */
export const QUOTE_TTL_MS = 15 * 60 * 1000;

interface QuoteInvoice {
  id: string;
  total: Prisma.Decimal | number;
  currency: string;
}

export interface PublicQuote {
  /** Opaque handle to the server-side locked FX amount. */
  token: string;
  expiresAt: string;
}

function toPublic(quote: {
  token: string;
  invoiceId: string;
  invoiceAmount: Prisma.Decimal;
  invoiceCurrency: string;
  usdAmount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal;
  provider: string;
  rateAt: Date;
  expiresAt: Date;
}): PublicQuote {
  // Deliberately opaque: the converted USD amount and rate stay server-side.
  // The browser only needs the token to authorise the card against the locked quote.
  return {
    token: quote.token,
    expiresAt: quote.expiresAt.toISOString(),
  };
}

/**
 * Called when a client starts a payment attempt. Fetches the latest available
 * rate, locks the USD amount for a short window and persists the snapshot so
 * the authorised amount and the stored transaction can never drift apart.
 */
export async function createPaymentQuote(invoice: QuoteInvoice): Promise<PublicQuote> {
  const invoiceAmount = Number(invoice.total);
  const conversion = await convertToUsd(invoiceAmount, invoice.currency);
  const quote = await prisma.paymentQuote.create({
    data: {
      token: randomBytes(24).toString("hex"),
      invoiceId: invoice.id,
      invoiceAmount,
      invoiceCurrency: invoice.currency,
      usdAmount: conversion.amount,
      exchangeRate: conversion.rate,
      provider: conversion.provider,
      rateAt: conversion.rateAt,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    },
  });
  return toPublic(quote);
}

/** Loads a quote that is valid, unused and belongs to the given invoice. */
export async function loadPaymentQuote(token: string, invoiceId: string) {
  const quote = await prisma.paymentQuote.findUnique({ where: { token } });
  if (!quote || quote.invoiceId !== invoiceId) throw new ApiError(400, "Invalid payment quote");
  if (quote.usedAt) throw new ApiError(409, "This payment attempt has already been used. Please start a new one.");
  if (quote.expiresAt.getTime() <= Date.now()) throw new ApiError(409, "The exchange rate has expired. Please start a new payment attempt.");
  return quote;
}

/**
 * Atomically claims a quote so two simultaneous requests can never charge the
 * same attempt twice. Returns false if another request claimed it first.
 */
export async function claimPaymentQuote(id: string): Promise<boolean> {
  const result = await prisma.paymentQuote.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count === 1;
}

let cleanupStarted = false;

/** Periodically removes expired quotes so the table doesn't grow unbounded. */
export function startQuoteCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;

  const tick = async () => {
    try {
      await prisma.paymentQuote.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - QUOTE_TTL_MS) } },
      });
    } catch (e) {
      console.error("[quotes] cleanup error", e);
    }
  };

  void tick();
  const timer = setInterval(tick, QUOTE_TTL_MS);
  timer.unref();
}
