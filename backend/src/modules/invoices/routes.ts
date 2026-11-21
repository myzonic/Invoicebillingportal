import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { InvoiceStatus, LogAction, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { audit } from "../../utils/audit";
import { renderInvoicePdf } from "../../services/pdf";
import { computeInvoiceTotals } from "../../services/invoiceMath";
import { normalizeBuilderData } from "../../services/invoiceBuilder";
import {
  effectiveInvoiceStatus,
  numeric,
  paidAmountForInvoice,
  statusLabel,
  type MonetaryPayment,
} from "../../services/invoiceStatus";
import { sendInvoiceEmail } from "../../services/email";
import { invoicePermalink, withPermalink } from "../../services/permalink";
import { env } from "../../config/env";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  // Builder extras. Absent on historical invoices; no behaviour change.
  discount: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  id: z.string().optional(),
});

const invoiceSchema = z.object({
  clientId: z.string().min(1),
  brandId: z.string().optional(),
  items: z.array(itemSchema).min(1),
  taxRate: z.number().min(0).max(100).default(0),
  discountAmount: z.number().nonnegative().default(0),
  currency: z.string().min(3).max(3).optional(),
  color: z.string().optional(),
  designOverride: z.unknown().optional(),
  builderData: z.unknown().optional(),
  notes: z.string().optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
});

function computeTotals(body: z.infer<typeof invoiceSchema>) {
  const builder = normalizeBuilderData(body.builderData);
  return computeInvoiceTotals({
    items: body.items,
    taxRate: body.taxRate,
    discountAmount: body.discountAmount,
    shipping: builder.shipping,
  });
}

async function companyDetails() {
  const company = (await prisma.setting.findUnique({ where: { key: "company" } }))?.value as
    | { name?: string; email?: string; phone?: string; address?: string; website?: string }
    | undefined;
  return {
    name: company?.name || env.branding.companyName,
    email: company?.email || "",
    phone: company?.phone || "",
    address: company?.address || "",
    website: company?.website || "",
  };
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

/** Every invoice belongs to a brand: explicit choice, client brand, or default brand. */
async function resolveBrand(
  requested: string | undefined,
  clientBrandId: string | null,
  fallbackBrandId?: string | null,
) {
  const brandId =
    requested ||
    fallbackBrandId ||
    clientBrandId ||
    (await prisma.brand.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } }))?.id ||
    (await prisma.brand.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
  if (!brandId) throw new ApiError(400, "Create an active brand before creating invoices");
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new ApiError(400, "Selected brand no longer exists");
  return brand;
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

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: { client: true; brand: true } }>;
type EmailInvoice = InvoiceWithRelations & { payments?: MonetaryPayment[] };
type CurrencyTotal = { currency: string; amount: number };
type InvoiceSummary = {
  totalInvoices: number;
  totalInvoiced: CurrencyTotal[];
  totalPaid: CurrencyTotal[];
  totalOutstanding: CurrencyTotal[];
  totalOverdue: CurrencyTotal[];
  draftInvoices: number;
  draftAmount: CurrencyTotal[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `undefined` leaves the stored JSON untouched; `null` clears an invoice override. */
function jsonUpdateValue(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value;
}

function parseDateFilter(value: unknown, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseNumberFilter(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseStatusFilter(value: unknown): InvoiceStatus[] | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const allowed = Object.values(InvoiceStatus) as string[];
  const statuses = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => allowed.includes(s)) as InvoiceStatus[];
  return statuses.length ? statuses : undefined;
}

function currencyTotals(bucket: Map<string, number>): CurrencyTotal[] {
  return Array.from(bucket.entries())
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function addTotal(bucket: Map<string, number>, currency: string, amount: number) {
  if (!Number.isFinite(amount)) return;
  bucket.set(currency, (bucket.get(currency) || 0) + amount);
}

/** Attach the read-time status (including calculated Overdue) to API rows. */
function withComputedStatus<
  T extends { status: InvoiceStatus; currency: string; total: Prisma.Decimal | number; dueDate: Date | null; payments: MonetaryPayment[] },
>(invoice: T) {
  return { ...invoice, displayStatus: effectiveInvoiceStatus(invoice, invoice.payments) };
}

/**
 * Summary totals are grouped by currency. Payment snapshots are converted back
 * into the invoice currency before subtraction, so different currencies are
 * never silently added together.
 */
async function buildInvoiceSummary(where: Prisma.InvoiceWhereInput): Promise<InvoiceSummary> {
  const invoices = await prisma.invoice.findMany({
    where,
    select: {
      total: true,
      currency: true,
      status: true,
      dueDate: true,
      payments: {
        where: { status: PaymentStatus.SUCCEEDED },
        select: { amount: true, currency: true, invoiceAmount: true, invoiceCurrency: true, exchangeRate: true },
      },
    },
  });

  const invoiced = new Map<string, number>();
  const paid = new Map<string, number>();
  const outstanding = new Map<string, number>();
  const overdue = new Map<string, number>();
  const draft = new Map<string, number>();
  const now = new Date();
  let draftInvoices = 0;

  for (const invoice of invoices) {
    const total = numeric(invoice.total);
    const totalPaid = paidAmountForInvoice(invoice, invoice.payments);
    const balance = Math.max(0, Math.round((total - totalPaid) * 100) / 100);

    addTotal(invoiced, invoice.currency, total);
    addTotal(paid, invoice.currency, totalPaid);

    if (invoice.status === InvoiceStatus.DRAFT) {
      draftInvoices += 1;
      addTotal(draft, invoice.currency, total);
    }

    const isOpen = invoice.status !== InvoiceStatus.PAID && invoice.status !== InvoiceStatus.CANCELLED;
    if (isOpen) addTotal(outstanding, invoice.currency, balance);
    if (isOpen && invoice.status !== InvoiceStatus.DRAFT && invoice.dueDate && invoice.dueDate < now) {
      addTotal(overdue, invoice.currency, balance);
    }
  }

  return {
    totalInvoices: invoices.length,
    totalInvoiced: currencyTotals(invoiced),
    totalPaid: currencyTotals(paid),
    totalOutstanding: currencyTotals(outstanding),
    totalOverdue: currencyTotals(overdue),
    draftInvoices,
    draftAmount: currencyTotals(draft),
  };
}

function invoiceOrderBy(sortBy: string, dir: "asc" | "desc"): Prisma.InvoiceOrderByWithRelationInput[] {
  const tie: Prisma.InvoiceOrderByWithRelationInput = { createdAt: "desc" };
  switch (sortBy) {
    case "number":
      return [{ number: dir }, tie];
    case "client":
      return [{ client: { name: dir } }, tie];
    case "issueDate":
      return [{ issueDate: dir }, tie];
    case "dueDate":
      return [{ dueDate: dir }, tie];
    case "total":
      return [{ total: dir }, tie];
    case "status":
      return [{ status: dir }, tie];
    case "createdAt":
    default:
      return [{ createdAt: dir }];
  }
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Neutralise spreadsheet formula injection from free-text client/invoice data.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

type EmailContext = { user?: { id?: string; email?: string }; ip?: string };

/** Shared by single and bulk send so delivery rules stay identical. */
async function emailInvoiceDocument(invoice: EmailInvoice, ctx: EmailContext) {
  const company = await companyDetails();
  const pdf = await renderInvoicePdf({ invoice, client: invoice.client, brand: invoice.brand, company });
  const paid = paidAmountForInvoice(invoice, invoice.payments || []);
  const balance = Math.max(0, numeric(invoice.total) - paid);
  const permalink = invoicePermalink(invoice, invoice.brand);
  const builderInfo = normalizeBuilderData((invoice as unknown as { builderData?: unknown }).builderData);
  const line = (label: string, value: string) =>
    value.trim() ? `<p><strong>${label}:</strong><br/>${escapeHtml(value).replace(/\n/g, "<br/>")}</p>` : "";

  const subject = `Invoice ${invoice.number} from ${invoice.brand?.name || company.name || env.branding.companyName}`;
  const result = await sendInvoiceEmail({
    invoiceId: invoice.id,
    toEmail: invoice.client.email!,
    subject,
    html: `
      <p>Hi ${escapeHtml(invoice.client.name)},</p>
      <p>Your invoice <strong>${escapeHtml(invoice.number)}</strong> is attached.</p>
      <p>Amount due: <strong>${escapeHtml(money(balance, invoice.currency))}</strong></p>
      <p><a href="${escapeHtml(permalink)}">View and pay online</a></p>
      ${invoice.squarePaymentLink ? `<p><a href="${escapeHtml(invoice.squarePaymentLink)}">Pay securely via Square</a></p>` : ""}
      ${line("Payment instructions", builderInfo.paymentInstructions)}
      ${line("Payment terms", builderInfo.paymentTerms)}
      <p>Thank you for your business.</p>
    `,
    attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }],
  });

  let status = invoice.status;
  if (result.ok && invoice.status === InvoiceStatus.DRAFT) {
    status = InvoiceStatus.SENT;
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status, sentAt: new Date() } });
  }

  await audit({
    userId: ctx.user?.id,
    userEmail: ctx.user?.email,
    module: "invoices",
    action: LogAction.SEND,
    details: { id: invoice.id, number: invoice.number, to: invoice.client.email, success: result.ok, error: result.error },
    ip: ctx.ip,
  });

  return { ok: result.ok, error: result.error, status };
}

router.get(
  "/",
  can("invoices", "read"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const q = String(req.query.search || "").trim();

    const conditions: Prisma.InvoiceWhereInput[] = [];
    const statuses = parseStatusFilter(req.query.status);
    const clientId = String(req.query.clientId || "").trim();
    const brandId = String(req.query.brandId || "").trim();
    const currency = String(req.query.currency || "").trim().toUpperCase();
    const amountMin = parseNumberFilter(req.query.amountMin ?? req.query.minAmount);
    const amountMax = parseNumberFilter(req.query.amountMax ?? req.query.maxAmount);
    const issueDateFrom = parseDateFilter(req.query.issueDateFrom);
    const issueDateTo = parseDateFilter(req.query.issueDateTo, true);
    const dueDateFrom = parseDateFilter(req.query.dueDateFrom);
    const dueDateTo = parseDateFilter(req.query.dueDateTo, true);

    if (statuses) conditions.push({ status: { in: statuses } });
    if (clientId) conditions.push({ clientId });
    if (brandId) conditions.push({ brandId });
    if (currency) conditions.push({ currency });
    if (amountMin !== undefined) conditions.push({ total: { gte: amountMin } });
    if (amountMax !== undefined) conditions.push({ total: { lte: amountMax } });
    if (issueDateFrom || issueDateTo) {
      conditions.push({ issueDate: { ...(issueDateFrom ? { gte: issueDateFrom } : {}), ...(issueDateTo ? { lte: issueDateTo } : {}) } });
    }
    if (dueDateFrom || dueDateTo) {
      conditions.push({ dueDate: { ...(dueDateFrom ? { gte: dueDateFrom } : {}), ...(dueDateTo ? { lte: dueDateTo } : {}) } });
    }

    if (q) {
      // `items` is a JSON array of objects. Prisma's JSON string_contains does
      // not reliably search inside array values, so use a parameterised text
      // match for line-item descriptions.
      const descriptionMatches = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Invoice" WHERE "items"::text ILIKE ${`%${q}%`}
      `;
      const searchTerms: Prisma.InvoiceWhereInput[] = [
        { number: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
        { client: { email: { contains: q, mode: "insensitive" } } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
        { notes: { contains: q, mode: "insensitive" } },
        { id: { in: descriptionMatches.map((row) => row.id) } },
      ];
      const numericSearch = parseNumberFilter(q.replace(/[^0-9.]/g, ""));
      if (numericSearch !== undefined && numericSearch >= 0) searchTerms.push({ total: { equals: numericSearch } });
      conditions.push({ OR: searchTerms });
    }

    const where: Prisma.InvoiceWhereInput = conditions.length ? { AND: conditions } : {};
    const sortBy = String(req.query.sortBy || "createdAt");
    const sortDir = String(req.query.sortDir || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    const [rows, total, summary] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { client: { select: { id: true, name: true, email: true } }, brand: true, payments: true },
        orderBy: invoiceOrderBy(sortBy, sortDir),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
      buildInvoiceSummary(where),
    ]);

    res.json({
      success: true,
      data: rows.map((row) => withComputedStatus(withPermalink(row, row.brand))),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      summary,
    });
  }),
);

/** Send several existing invoices without duplicating or renumbering them. */
router.post(
  "/bulk/send",
  can("invoices", "update"),
  asyncHandler(async (req, res) => {
    const body = z.object({ ids: z.array(z.string().min(1)).min(1).max(50) }).parse(req.body);
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: body.ids } },
      include: {
        client: true,
        brand: true,
        payments: {
          where: { status: PaymentStatus.SUCCEEDED },
          select: { amount: true, currency: true, invoiceAmount: true, invoiceCurrency: true, exchangeRate: true },
        },
      },
    });
    const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const results: Array<{ id: string; number?: string; ok: boolean; error?: string; status?: string }> = [];

    for (const id of body.ids) {
      const invoice = byId.get(id);
      if (!invoice) {
        results.push({ id, ok: false, error: "Invoice not found" });
        continue;
      }
      if (!invoice.client.email) {
        results.push({ id, number: invoice.number, ok: false, error: "Client has no email address" });
        continue;
      }
      try {
        const result = await emailInvoiceDocument(invoice, { user: req.user, ip: req.ip });
        results.push({ id, number: invoice.number, ok: result.ok, error: result.error, status: result.status });
      } catch (err) {
        results.push({ id, number: invoice.number, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    res.json({ success: true, data: { sent, failed: results.length - sent, results } });
  }),
);

/** Export selected invoices as CSV. Currency is exported as its own column. */
router.post(
  "/bulk/export",
  can("invoices", "read"),
  asyncHandler(async (req, res) => {
    const body = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }).parse(req.body);
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: body.ids } },
      include: {
        client: true,
        brand: true,
        payments: {
          where: { status: PaymentStatus.SUCCEEDED },
          select: { amount: true, currency: true, invoiceAmount: true, invoiceCurrency: true, exchangeRate: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const header = [
      "Invoice Number", "Client", "Client Email", "Brand", "Issue Date", "Due Date", "Currency", "Status",
      "Subtotal", "Tax", "Discount", "Total", "Amount Paid", "Balance", "Notes", "Public URL", "Created",
    ];
    const lines = invoices.map((invoice) => {
      const paid = paidAmountForInvoice(invoice, invoice.payments);
      const balance = Math.max(0, numeric(invoice.total) - paid);
      return [
        invoice.number,
        invoice.client.name,
        invoice.client.email || "",
        invoice.brand?.name || "",
        invoice.issueDate.toISOString().slice(0, 10),
        invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
        invoice.currency,
        invoice.status,
        numeric(invoice.subtotal),
        numeric(invoice.taxAmount),
        numeric(invoice.discountAmount),
        numeric(invoice.total),
        paid,
        Math.round(balance * 100) / 100,
        invoice.notes || "",
        invoicePermalink(invoice, invoice.brand),
        invoice.createdAt.toISOString(),
      ].map(csvCell).join(",");
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}`);
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
    res.json({ success: true, data: withComputedStatus(withPermalink(invoice, invoice.brand)) });
  }),
);

router.post(
  "/",
  can("invoices", "create"),
  asyncHandler(async (req, res) => {
    const body = invoiceSchema.parse(req.body);
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) throw new ApiError(404, "Client not found");

    const { subtotal, taxAmount, total } = computeTotals(body);
    const brand = await resolveBrand(body.brandId, client.brandId);
    const currency = body.currency || brand.currency || "USD";
    const initialsForNumber = initials(brand.name);

    // Two concurrent creations can read the same sequence value. Retry with a
    // fresh number if the unique constraint on `number` rejects our insert.
    let invoice: Prisma.InvoiceGetPayload<{ include: { client: true; brand: true } }> | null = null;
    for (let attempt = 0; attempt < 3 && !invoice; attempt++) {
      const number = await nextInvoiceNumber(initialsForNumber);
      try {
        invoice = await prisma.invoice.create({
          data: {
            number,
            // 192 bits of entropy: stable and non-guessable for public links.
            publicToken: randomBytes(24).toString("hex"),
            clientId: body.clientId,
            brandId: brand.id,
            items: body.items,
            subtotal,
            taxRate: body.taxRate,
            taxAmount,
            discountAmount: body.discountAmount,
            total,
            currency,
            // Brand colour is read live from the brand, so invoices inherit it
            // without copying a stale value at creation time.
            color: body.color || undefined,
            designOverride: body.designOverride ?? undefined,
            builderData: body.builderData == null ? Prisma.DbNull : body.builderData,
            notes: body.notes,
            issueDate: body.issueDate,
            dueDate: body.dueDate,
            status: InvoiceStatus.DRAFT,
          },
          include: { client: true, brand: true },
        });
      } catch (err) {
        const conflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!conflict || attempt === 2) throw err;
      }
    }
    if (!invoice) throw new ApiError(409, "Could not allocate an invoice number, please retry");

    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "invoices",
      action: LogAction.CREATE,
      details: { id: invoice.id, number: invoice.number },
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: withPermalink(invoice, invoice.brand) });
  }),
);

/** Render a PDF from unsaved form data so it can be previewed while editing. */
router.post(
  "/preview-pdf",
  can("invoices", "read"),
  asyncHandler(async (req, res) => {
    const body = invoiceSchema.parse(req.body);
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) throw new ApiError(404, "Client not found");
    const brand = await resolveBrand(body.brandId, client.brandId);
    const currency = body.currency || brand.currency || "USD";
    const { subtotal, taxAmount, total } = computeTotals(body);

    const preview = {
      id: "preview",
      number: "PREVIEW",
      clientId: client.id,
      brandId: brand?.id || null,
      items: body.items,
      subtotal,
      taxRate: body.taxRate,
      taxAmount,
      discountAmount: body.discountAmount,
      total,
      currency,
      color: body.color || brand.color || null,
      designOverride: body.designOverride ?? null,
      builderData: body.builderData ?? null,
      status: InvoiceStatus.DRAFT,
      notes: body.notes || null,
      issueDate: body.issueDate,
      dueDate: body.dueDate || null,
      sentAt: null,
      paidAt: null,
      squarePaymentLink: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as import("@prisma/client").Invoice;

    const pdf = await renderInvoicePdf({ invoice: preview, client, brand, company: await companyDetails() });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="preview.pdf"');
    res.send(Buffer.from(pdf));
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
    const brand = await resolveBrand(body.brandId, client.brandId, existing.brandId);
    const currency = body.currency || existing.currency || brand.currency || "USD";

    // A live Square checkout charges the amount fixed when the link was
    // created. Editing amounts would make the PDF and the charge disagree.
    const pendingSquare = await prisma.payment.findFirst({
      where: { invoiceId: existing.id, method: PaymentMethod.SQUARE, status: PaymentStatus.PENDING },
    });
    if (existing.squarePaymentLink || pendingSquare) {
      const amountSignature = (items: unknown) =>
        JSON.stringify(
          (Array.isArray(items) ? items : []).map((i: Record<string, unknown>) => [
            i.description,
            Number(i.quantity),
            Number(i.unitPrice),
            Number(i.discount || 0),
            i.taxRate == null ? null : Number(i.taxRate),
          ]),
        );
      const amountsChanged =
        amountSignature(body.items) !== amountSignature(existing.items) ||
        Number(body.taxRate) !== Number(existing.taxRate) ||
        Number(body.discountAmount) !== Number(existing.discountAmount) ||
        Number(normalizeBuilderData(body.builderData).shipping) !== Number(normalizeBuilderData(existing.builderData).shipping) ||
        currency !== existing.currency;
      if (amountsChanged) {
        throw new ApiError(400, "Amounts cannot be changed while a Square payment link is active. Cancel the payment link first.");
      }
    }

    const { subtotal, taxAmount, total } = computeTotals(body);

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        clientId: body.clientId,
        brandId: brand.id,
        items: body.items,
        subtotal,
        taxRate: body.taxRate,
        taxAmount,
        discountAmount: body.discountAmount,
        total,
        currency,
        color: body.color || undefined,
        designOverride: jsonUpdateValue(body.designOverride),
        builderData: jsonUpdateValue(body.builderData),
        notes: body.notes,
        issueDate: body.issueDate,
        dueDate: body.dueDate,
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
    res.json({ success: true, data: withPermalink(invoice, invoice.brand) });
  }),
);

router.post(
  "/:id/send",
  can("invoices", "update"),
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        brand: true,
        payments: {
          where: { status: PaymentStatus.SUCCEEDED },
          select: { amount: true, currency: true, invoiceAmount: true, invoiceCurrency: true, exchangeRate: true },
        },
      },
    });
    if (!invoice) throw new ApiError(404, "Invoice not found");
    if (!invoice.client.email) throw new ApiError(400, "Client has no email address");

    const result = await emailInvoiceDocument(invoice, { user: req.user, ip: req.ip });
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

    const company = await companyDetails();

    const pdf = await renderInvoicePdf({
      invoice,
      client: invoice.client,
      brand: invoice.brand,
      company,
    });

    const inline = req.query.inline === "1";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${invoice.number}.pdf"`);
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
