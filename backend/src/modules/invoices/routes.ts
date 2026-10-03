import { Router } from "express";
import { z } from "zod";
import { InvoiceStatus, LogAction, PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { audit } from "../../utils/audit";
import { renderInvoicePdf } from "../../services/pdf";
import { sendInvoiceEmail } from "../../services/email";
import { env } from "../../config/env";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

const invoiceSchema = z.object({
  clientId: z.string().min(1),
  brandId: z.string().optional(),
  items: z.array(itemSchema).min(1),
  taxRate: z.number().min(0).max(100).default(0),
  discountAmount: z.number().nonnegative().default(0),
  currency: z.string().min(3).max(3).default("USD"),
  color: z.string().optional(),
  notes: z.string().optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
});

function computeTotals(items: z.infer<typeof itemSchema>[], taxRate: number, discountAmount: number) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount - discountAmount;
  return { subtotal, taxAmount, total: Math.max(0, total) };
}

async function nextInvoiceNumber(brandInitials: string) {
  const year = new Date().getFullYear();
  const setting = await prisma.setting.findUnique({ where: { key: "invoice_seq" } });
  const seq = setting ? ((setting.value as { n?: number })?.n ?? 0) + 1 : 1;
  await prisma.setting.upsert({
    where: { key: "invoice_seq" },
    update: { value: { n: seq } },
    create: { key: "invoice_seq", value: { n: seq } },
  });
  return `INV-${brandInitials.toUpperCase()}-${year}-${String(seq).padStart(3, "0")}`;
}

async function brandInitialsFor(brandId: string | undefined, client: { brandId: string | null }) {
  if (brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    return initials(brand?.name || "MZ");
  }
  if (client.brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: client.brandId } });
    return initials(brand?.name || "MZ");
  }
  return "MZ";
}

function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** Currency code -> display symbol shown before the amount. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  CAD: "CA$",
};

function money(value: number | string | { toNumber: () => number }, currency: string) {
  const n = Number(typeof value === "object" ? value.toNumber() : value);
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
  const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${symbol}${number}`;
}

router.get(
  "/",
  can("invoices", "read"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const q = String(req.query.search || "").trim();
    const status = req.query.status ? String(req.query.status) : undefined;
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { client: { select: { id: true, name: true, email: true } }, brand: true, payments: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);

router.get(
  "/:id",
  can("invoices", "read"),
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { client: true, brand: true, payments: true },
    });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    res.json({ success: true, data: invoice });
  }),
);

router.post(
  "/",
  can("invoices", "create"),
  asyncHandler(async (req, res) => {
    const body = invoiceSchema.parse(req.body);
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) throw new ApiError(404, "Client not found");

    const { subtotal, taxAmount, total } = computeTotals(body.items, body.taxRate, body.discountAmount);
    const number = await nextInvoiceNumber(await brandInitialsFor(body.brandId, client));

    const invoice = await prisma.invoice.create({
      data: {
        number,
        clientId: body.clientId,
        brandId: body.brandId || client.brandId || undefined,
        items: body.items,
        subtotal,
        taxRate: body.taxRate,
        taxAmount,
        discountAmount: body.discountAmount,
        total,
        currency: body.currency,
        color: body.color || undefined,
        notes: body.notes,
        issueDate: body.issueDate,
        dueDate: body.dueDate,
        status: body.status ?? InvoiceStatus.DRAFT,
      },
      include: { client: true, brand: true },
    });

    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "invoices",
      action: LogAction.CREATE,
      details: { id: invoice.id, number: invoice.number },
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: invoice });
  }),
);

router.put(
  "/:id",
  can("invoices", "update"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new ApiError(404, "Invoice not found");
    if (existing.status === InvoiceStatus.PAID) throw new ApiError(400, "Paid invoices cannot be edited");

    const body = invoiceSchema.parse(req.body);
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) throw new ApiError(404, "Client not found");

    const { subtotal, taxAmount, total } = computeTotals(body.items, body.taxRate, body.discountAmount);

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        clientId: body.clientId,
        brandId: body.brandId || client.brandId || undefined,
        items: body.items,
        subtotal,
        taxRate: body.taxRate,
        taxAmount,
        discountAmount: body.discountAmount,
        total,
        currency: body.currency,
        color: body.color || undefined,
        notes: body.notes,
        issueDate: body.issueDate,
        dueDate: body.dueDate,
        status: body.status ?? existing.status,
      },
      include: { client: true, brand: true },
    });

    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "invoices",
      action: LogAction.UPDATE,
      details: { id: invoice.id, number: invoice.number },
      ip: req.ip,
    });
    res.json({ success: true, data: invoice });
  }),
);

router.patch(
  "/:id/status",
  can("invoices", "update"),
  asyncHandler(async (req, res) => {
    const status = z.nativeEnum(InvoiceStatus).parse(req.body.status);
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) throw new ApiError(404, "Invoice not found");

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(status === InvoiceStatus.PAID ? { paidAt: new Date() } : {}),
        ...(status === InvoiceStatus.SENT ? { sentAt: new Date() } : {}),
      },
    });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "invoices",
      action: LogAction.UPDATE,
      details: { id: invoice.id, status },
      ip: req.ip,
    });
    res.json({ success: true, data: updated });
  }),
);

router.post(
  "/:id/send",
  can("invoices", "update"),
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { client: true, brand: true },
    });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (!invoice.client.email) throw new ApiError(400, "Client has no email address");

    const company = (await prisma.setting.findUnique({ where: { key: "company" } }))?.value as
      | { name?: string; email?: string; phone?: string; address?: string; website?: string }
      | undefined;

    const pdf = await renderInvoicePdf({
      invoice,
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

    const subject = `Invoice ${invoice.number} from ${invoice.brand?.name || company?.name || env.branding.companyName}`;
    const result = await sendInvoiceEmail({
      invoiceId: invoice.id,
      toEmail: invoice.client.email,
      subject,
      html: `
        <p>Hi ${invoice.client.name},</p>
        <p>Your invoice <strong>${invoice.number}</strong> is attached.</p>
        <p>Amount due: <strong>${money(invoice.total, invoice.currency)}</strong></p>
        ${invoice.squarePaymentLink ? `<p><a href="${invoice.squarePaymentLink}">Pay online now</a></p>` : ""}
        <p>Thank you for your business.</p>
      `,
      attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });

    if (result.ok && invoice.status === "DRAFT") {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "SENT", sentAt: new Date() } });
    }

    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "invoices",
      action: LogAction.SEND,
      details: { id: invoice.id, to: invoice.client.email },
      ip: req.ip,
    });

    if (!result.ok) throw new ApiError(502, `Email failed: ${result.error}`);
    res.json({ success: true, message: "Invoice emailed" });
  }),
);

router.get(
  "/:id/pdf",
  can("invoices", "read"),
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { client: true, brand: true },
    });
    if (!invoice) throw new ApiError(404, "Invoice not found");

    const company = (await prisma.setting.findUnique({ where: { key: "company" } }))?.value as
      | { name?: string; email?: string; phone?: string; address?: string; website?: string }
      | undefined;

    const pdf = await renderInvoicePdf({
      invoice,
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

router.delete(
  "/:id",
  can("invoices", "delete"),
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (invoice.status === InvoiceStatus.PAID) throw new ApiError(400, "Paid invoices cannot be deleted");

    await prisma.invoice.delete({ where: { id: req.params.id } });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "invoices",
      action: LogAction.DELETE,
      details: { id: req.params.id, number: invoice.number },
      ip: req.ip,
    });
    res.json({ success: true, message: "Deleted" });
  }),
);

export default router;
