import { Router } from "express";
import { z } from "zod";
import { LogAction, PaymentMethod, PaymentStatus, Invoice } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { createInvoiceCheckoutUrl, chargeInvoiceWithToken } from "../../services/square";
import { renderInvoicePdf } from "../../services/pdf";
import { claimPaymentQuote, createPaymentQuote, loadPaymentQuote } from "../../services/paymentQuote";
import { brandFromHost, invoicePermalink, paymentDomain } from "../../services/permalink";
import { audit } from "../../utils/audit";
import { env } from "../../config/env";

const router = Router();

/** Public lookup by secure token (legacy invoice ids still work). */
async function findPublicInvoice(key: string) {
  return prisma.invoice.findFirst({
    where: { OR: [{ publicToken: key }, { id: key }] },
    include: { client: true, brand: true, payments: { orderBy: { createdAt: "desc" } } },
  });
}

/** Human-readable payment state for the client-facing page. */
function paymentState(invoice: { status: string; payments: Array<{ status: PaymentStatus }> }) {
  if (invoice.status === "PAID") return "COMPLETED";
  if (invoice.status === "CANCELLED") return "CANCELLED";
  if (invoice.status === "PARTIALLY_PAID") return "PARTIALLY_PAID";
  if (invoice.status === "OVERDUE") return "EXPIRED";
  if (invoice.payments.some((p) => p.status === PaymentStatus.PENDING)) return "PROCESSING";
  return "UNPAID";
}

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

/** Public: resolves an incoming payment host (pay.<domain>) to a brand. */
router.get(
  "/domain/:host",
  asyncHandler(async (req, res) => {
    const brands = await prisma.brand.findMany({ where: { isActive: true } });
    const brand = brandFromHost(req.params.host, brands);
    if (!brand) throw new ApiError(404, "No brand is configured for this payment domain");
    res.json({
      success: true,
      data: {
        id: brand.id,
        name: brand.name,
        businessName: brand.businessName,
        logoUrl: brand.logoUrl,
        paymentDomain: paymentDomain(brand),
        currency: brand.currency,
        paymentEnabled: brand.paymentEnabled,
      },
    });
  }),
);

/**
 * Public: called when a client starts a payment attempt. Fetches the latest
 * available rate and locks the USD equivalent for a short window. Only an
 * opaque token is returned — the converted USD amount stays server-side.
 */
router.post(
  "/quote/:invoiceId",
  asyncHandler(async (req, res) => {
    const invoice = await findPublicInvoice(String(req.params.invoiceId));
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "DRAFT") throw new ApiError(403, "Invoice is not ready for payment");
    if (invoice.status === "PAID") throw new ApiError(400, "Invoice is already paid");

    const quote = await createPaymentQuote(invoice);
    res.json({ success: true, data: quote });
  }),
);

/**
 * Hosted checkout: charges the invoice with a tokenized card from the
 * Square Web Payments SDK. The merchant's account is USD-only, so the card is
 * always charged in USD, converted from and reconciled against the invoice's
 * own currency via a locked quote. The invoice is marked PAID on success and
 * the client-facing amounts always remain in the original invoice currency.
 */
router.post(
  "/charge/:invoiceId",
  asyncHandler(async (req, res) => {
    const sourceId = z.string().min(1, "Missing card token").parse(req.body.sourceId);
    const quoteToken = z.string().min(1, "Missing payment quote").parse(req.body.quoteToken);
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
    const invoice = await findPublicInvoice(String(req.params.invoiceId));
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "DRAFT") throw new ApiError(403, "Invoice is not ready for payment");
    if (invoice.status === "PAID") throw new ApiError(400, "Invoice is already paid");

    // The client authorises against a rate locked at attempt start, so the
    // amount sent to Square is exactly the amount recorded on the payment.
    const quote = await loadPaymentQuote(quoteToken, invoice.id);
    // The invoice must not have changed since the rate was locked, otherwise
    // the stored charge would no longer reconcile with the invoice.
    if (Number(quote.invoiceAmount) !== Number(invoice.total) || quote.invoiceCurrency !== invoice.currency) {
      throw new ApiError(409, "The invoice changed since this payment started. Please start a new payment attempt.");
    }
    if (!(await claimPaymentQuote(quote.id))) {
      throw new ApiError(409, "This payment attempt has already been used. Please start a new one.");
    }

    const chargeCurrency = "USD";
    const chargeAmount = Number(quote.usdAmount);
    const locationId = env.square.locations[chargeCurrency]?.locationId || env.square.locationId;

    const payment = await chargeInvoiceWithToken(invoice, sourceId, { currency: chargeCurrency, amount: chargeAmount, billing });
    if (payment.status !== "COMPLETED") throw new ApiError(400, `Square payment ${payment.status}`);

    const paidAt = new Date();
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", paidAt },
      }),
      prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: chargeAmount,
          currency: chargeCurrency,
          method: PaymentMethod.SQUARE,
          status: PaymentStatus.SUCCEEDED,
          reference: payment.id,
          locationId,
          quoteId: quote.id,
          invoiceAmount: Number(quote.invoiceAmount),
          invoiceCurrency: quote.invoiceCurrency,
          exchangeRate: quote.exchangeRate,
          exchangeRateProvider: quote.provider,
          exchangeRateAt: quote.rateAt,
          usdAmount: quote.usdAmount,
          capturedAt: paidAt,
        },
      }),
    ]);

    await audit({
      module: "payments",
      action: LogAction.CREATE,
      details: {
        invoiceId: invoice.id,
        number: invoice.number,
        squarePaymentId: payment.id,
        invoiceAmount: Number(quote.invoiceAmount),
        invoiceCurrency: quote.invoiceCurrency,
        chargeCurrency,
        chargeAmount,
        exchangeRate: Number(quote.exchangeRate),
        exchangeRateProvider: quote.provider,
      },
      ip: req.ip,
    });

    res.json({
      success: true,
      // Client-facing amount/currency stay in the original invoice currency.
      data: {
        id: payment.id,
        receiptUrl: payment.receipt_url,
        status: payment.status,
        amount: Number(invoice.total),
        currency: invoice.currency,
      },
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
    const invoice = await findPublicInvoice(String(req.params.invoiceId));
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
    const invoice = await findPublicInvoice(String(req.params.invoiceId));
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "DRAFT") throw new ApiError(403, "Invoice is not ready for payment");

    const company = (await prisma.setting.findUnique({ where: { key: "company" } }))?.value as
      | { name?: string; email?: string; phone?: string; address?: string; website?: string }
      | undefined;

    // The client always sees the invoice's selected currency. The USD
    // conversion and Square processing amount stay strictly backend-only.
    const display = invoice;
    const currency = invoice.currency;
    const baseCurrency = invoice.currency;

    res.json({
      success: true,
      data: {
        id: invoice.id,
        publicToken: invoice.publicToken,
        permalink: invoicePermalink(invoice, invoice.brand),
        paymentDomain: paymentDomain(invoice.brand),
        paymentState: paymentState(invoice),
        pendingPayment: invoice.payments.some((p) => p.status === PaymentStatus.PENDING),
        number: invoice.number,
        items: display.items,
        subtotal: display.subtotal,
        taxRate: invoice.taxRate,
        taxAmount: display.taxAmount,
        discountAmount: display.discountAmount,
        total: display.total,
        currency,
        baseCurrency,
        color: invoice.color,
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        client: invoice.client,
        brand: invoice.brand,
        company: {
          name: company?.name || env.branding.companyName,
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
 * payment page, so an unsent invoice is never publicly downloadable. The PDF
 * always shows the original invoice currency.
 */
router.get(
  "/public/:invoiceId/pdf",
  asyncHandler(async (req, res) => {
    const invoice = await findPublicInvoice(String(req.params.invoiceId));
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === "DRAFT") throw new ApiError(403, "Invoice is not ready for payment");

    const company = (await prisma.setting.findUnique({ where: { key: "company" } }))?.value as
      | { name?: string; email?: string; phone?: string; address?: string; website?: string }
      | undefined;

    const pdf = await renderInvoicePdf({
      invoice: invoice as unknown as Invoice,
      client: invoice.client,
      brand: invoice.brand,
      company: {
        name: company?.name || env.branding.companyName,
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
