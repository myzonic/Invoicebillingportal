import { Router } from "express";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { effectiveInvoiceStatus } from "../../services/invoiceStatus";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";

const router = Router();
router.use(requireAuth);

router.get(
  "/reports",
  can("dashboard", "read"),
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [totalInvoices, totalClients, totalBrands, totalMerchants, revenueAgg, paidCount, unpaidCount, overdueCount, recentInvoices, allInvoices, revenueByCurrency, totalsByCurrency] =
      await Promise.all([
        prisma.invoice.count(),
        prisma.client.count(),
        prisma.brand.count(),
        prisma.merchant.count(),
        prisma.invoice.aggregate({ _sum: { total: true }, where: { status: InvoiceStatus.PAID } }),
        prisma.invoice.count({ where: { status: InvoiceStatus.PAID } }),
        prisma.invoice.count({ where: { status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT] } } }),
        // Overdue is derived from due date + outstanding balance, never persisted.
        (async () => {
          const open = await prisma.invoice.findMany({
            where: { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] }, dueDate: { lt: now } },
            include: { payments: true },
          });
          return open.filter((inv) => effectiveInvoiceStatus(inv, inv.payments, now) === InvoiceStatus.OVERDUE).length;
        })(),
        prisma.invoice.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { client: { select: { name: true } }, payments: true },
        }),
        prisma.invoice.findMany({
          select: {
            status: true,
            total: true,
            currency: true,
            dueDate: true,
            payments: {
              select: { amount: true, currency: true, status: true, invoiceAmount: true, invoiceCurrency: true, exchangeRate: true },
            },
          },
        }),
        prisma.invoice.groupBy({
          by: ["currency"],
          where: { status: InvoiceStatus.PAID },
          _sum: { total: true },
        }),
        prisma.invoice.groupBy({
          by: ["currency"],
          _sum: { total: true },
        }),
      ]);

    const invoicesThisYear = await prisma.invoice.findMany({
      where: { createdAt: { gte: startOfYear } },
      select: { total: true, createdAt: true },
    });

    const byMonth: Record<string, number> = {};
    for (const inv of invoicesThisYear) {
      const key = `${inv.createdAt.getFullYear()}-${String(inv.createdAt.getMonth() + 1).padStart(2, "0")}`;
      byMonth[key] = (byMonth[key] || 0) + Number(inv.total);
    }

    const statusBuckets = new Map<InvoiceStatus, { count: number; total: number }>();
    for (const inv of allInvoices) {
      const status = effectiveInvoiceStatus(inv, inv.payments, now);
      const bucket = statusBuckets.get(status) || { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += Number(inv.total);
      statusBuckets.set(status, bucket);
    }
    const totalsByStatus = Array.from(statusBuckets, ([status, bucket]) => ({ status, count: bucket.count, total: bucket.total }));

    res.json({
      success: true,
      data: {
        totals: {
          invoices: totalInvoices,
          clients: totalClients,
          brands: totalBrands,
          merchants: totalMerchants,
          revenue: revenueAgg._sum.total,
          paid: paidCount,
          unpaid: unpaidCount,
          overdue: overdueCount,
        },
        totalsByStatus,
        monthlyRevenue: Object.entries(byMonth).map(([month, revenue]) => ({ month, revenue })),
        recentInvoices: recentInvoices.map((inv) => ({
          ...inv,
          displayStatus: effectiveInvoiceStatus(inv, inv.payments, now),
        })),
        revenueByCurrency: revenueByCurrency.map((c) => ({ currency: c.currency, total: c._sum.total })),
        totalsByCurrency: totalsByCurrency.map((c) => ({ currency: c.currency, total: c._sum.total })),
      },
    });
  }),
);

export default router;
