import { Router } from "express";
import { z } from "zod";
import { LogAction, PaymentMethod, PaymentStatus, Invoice } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { createInvoiceCheckoutUrl, chargeInvoiceWithToken } from "../../services/square";
import { renderInvoicePdf } from "../../services/pdf";
import { convertAmount, convertInvoice } from "../../services/rates";
import { detectCurrency } from "../../services/geo";
import { audit } from "../../utils/audit";
import { env } from "../../config/env";

const router = Router();

/**
 * Public: tells the Web Payments SDK how to initialize on the hosted checkout.
 * The application id is not a secret (it is embedded in the page anyway).
 * The merchant charges in its own currency (USD) regardless of the client's
 * display currency, so this always returns the USD location.
 */
router.get(
  "/config",
  asyncHandler(async (req, res) => {
    const cfg = env.square.locations.USD;
    res.json({
      success: true,
      data: {
        applicationId: cfg?.applicationId || env.square.applicationId,
        locationId: cfg?.locationId || env.square.locationId,
        environment: env.square.environment,
      },
    });
  }),
);

/**
 * Hosted checkout: charges the invoice with a tokenized card from the
 * Square Web Payments SDK. The merchant's account is USD-only, so the card is
 * always charged in USD (converted from the invoice currency), while the
 * invoice itself is displayed to the client in their local currency. The
 * invoice is marked PAID on success.
 */
router.post(
  "/charge/:invoiceId",
  asyncHandler(async (req, res) => {
    const sourceId = z.string().min(1, "Missing card token").parse(req.body.sourceId);
    const billing = z
      .object({
        name: z.string().optional(),
        addressLine1: z.string().optional(),
        addressLine2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        countryCode: z.string().optional(),
      })
      .optional()
      .parse(req.body.billing);
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.invoiceId } });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "DRAFT") throw new ApiError(403, "Invoice is not ready for payment");
    if (invoice.status === "PAID") throw new ApiError(400, "Invoice is already paid");

    const chargeCurrency = "USD";
    const chargeAmount =
      chargeCurrency === invoice.currency ? Number(invoice.total) : await convertAmount(Number(invoice.total), invoice.currency, chargeCurrency);

    const payment = await chargeInvoiceWithToken(invoice, sourceId, { currency: chargeCurrency, amount: chargeAmount, billing });
    if (payment.status !== "COMPLETED") throw new ApiError(400, `Square payment ${payment.status}`);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: chargeAmount,
        currency: chargeCurrency,
        method: PaymentMethod.SQUARE,
        status: PaymentStatus.SUCCEEDED,
        reference: payment.id,
        capturedAt: new Date(),
      },
    });

    await audit({
      module: "payments",
      action: LogAction.CREATE,
      details: { invoiceId: invoice.id, number: invoice.number, squarePaymentId: payment.id, currency: chargeCurrency, amount: chargeAmount },
      ip: req.ip,
    });

    res.json({
      success: true,
      data: { id: payment.id, receiptUrl: payment.receipt_url, status: payment.status, amount: chargeAmount, currency: chargeCurrency },
    });
  }),
);

/**
 * Creates a Square-hosted checkout for an invoice and returns the URL.
 */
router.post(
  "/checkout/:invoiceId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.invoiceId },
      include: { client: { select: { email: true } } },
    });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "PAID") throw new ApiError(400, "Invoice is already paid");

    const url = await createInvoiceCheckoutUrl(invoice);

    // Once a payment link exists the invoice is effectively sent to the client,
    // so the public payment page (which blocks DRAFT) becomes accessible.
    if (invoice.status === "DRAFT") {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    }

    res.json({ success: true, data: { url } });
  }),
);

/**
 * Public: returns a minimal invoice payload so the payment-link page can render.
 * No auth required (the page is public by design).
 */
router.get(
  "/public/:invoiceId",
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.invoiceId },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true, address: true } },
        brand: { select: { id: true, name: true, email: true, phone: true, address: true, logoUrl: true } },
      },
    });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "DRAFT") throw new ApiError(403, "Invoice is not ready for payment");

    const company = (await prisma.setting.findUnique({ where: { key: "company" } }))?.value as
      | { name?: string; email?: string; phone?: string; address?: string; website?: string }
      | undefined;

    // Detect the client's local currency (IP country / explicit param) and, if
    // it differs from the invoice currency, return amounts converted to it.
    // The display is decoupled from the merchant's charging currency.
    const currency = await detectCurrency(req, invoice.currency);
    const baseCurrency = invoice.currency;
    const chargeCurrency = "USD";
    const chargeAmount =
      chargeCurrency === baseCurrency ? Number(invoice.total) : await convertAmount(Number(invoice.total), baseCurrency, chargeCurrency);
    const display =
      currency === baseCurrency
        ? invoice
        : await convertInvoice(
            {
              currency: invoice.currency,
              taxRate: Number(invoice.taxRate),
              subtotal: Number(invoice.subtotal),
              taxAmount: Number(invoice.taxAmount),
              discountAmount: Number(invoice.discountAmount),
              total: Number(invoice.total),
              items: invoice.items as Array<{ description: string; quantity: number; unitPrice: number }>,
            },
            currency,
          );

    res.json({
      success: true,
      data: {
        id: invoice.id,
        number: invoice.number,
        items: display.items,
        subtotal: display.subtotal,
        taxRate: invoice.taxRate,
        taxAmount: display.taxAmount,
        discountAmount: display.discountAmount,
        total: display.total,
        currency,
        baseCurrency,
        chargeCurrency,
        chargeAmount,
        color: invoice.color,
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        client: invoice.client,
        brand: invoice.brand,
        company: {
          name: company?.name || "Myzonic",
          email: company?.email || "",
          phone: company?.phone || "",
          address: company?.address || "",
          website: company?.website || "",
        },
        squarePaymentLink: invoice.squarePaymentLink,
      },
    });
  }),
);

/**
 * Public: renders the invoice PDF (no auth). Blocked while DRAFT, same as the
 * payment page, so an unsent invoice is never publicly downloadable. Amounts
 * are converted to the client's local currency when it differs from the
 * invoice currency (pass `?currency=` to keep it consistent with the page).
 */
router.get(
  "/public/:invoiceId/pdf",
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.invoiceId },
      include: { client: true, brand: true },
    });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "DRAFT") throw new ApiError(403, "Invoice is not ready for payment");

    const company = (await prisma.setting.findUnique({ where: { key: "company" } }))?.value as
      | { name?: string; email?: string; phone?: string; address?: string; website?: string }
      | undefined;

    const currency = await detectCurrency(req, invoice.currency);
    const pdfInvoice =
      currency === invoice.currency
        ? invoice
        : {
            ...invoice,
            ...(await convertInvoice(
              {
                currency: invoice.currency,
                taxRate: Number(invoice.taxRate),
                subtotal: Number(invoice.subtotal),
                taxAmount: Number(invoice.taxAmount),
                discountAmount: Number(invoice.discountAmount),
                total: Number(invoice.total),
                items: invoice.items as Array<{ description: string; quantity: number; unitPrice: number }>,
              },
              currency,
            )),
          };

    const pdf = await renderInvoicePdf({
      invoice: pdfInvoice as unknown as Invoice,
      client: invoice.client,
      brand: invoice.brand,
      company: {
        name: company?.name || "Myzonic",
        email: company?.email || "",
        phone: company?.phone || "",
        address: company?.address || "",
        website: company?.website || "",
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.number}.pdf"`);
    res.send(Buffer.from(pdf));
  }),
);

export default router;
