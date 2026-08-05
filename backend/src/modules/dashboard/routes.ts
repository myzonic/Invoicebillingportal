import { Router } from "express";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
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

    const [totalInvoices, totalClients, totalBrands, totalMerchants, revenueAgg, paidCount, unpaidCount, overdueCount, recentInvoices, monthly, revenueByCurrency, totalsByCurrency] =
      await Promise.all([
        prisma.invoice.count(),
        prisma.client.count(),
        prisma.brand.count(),
        prisma.merchant.count(),
        prisma.invoice.aggregate({ _sum: { total: true }, where: { status: InvoiceStatus.PAID } }),
        prisma.invoice.count({ where: { status: InvoiceStatus.PAID } }),
        prisma.invoice.count({ where: { status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT] } } }),
        prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE, dueDate: { lt: now } } }),
        prisma.invoice.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { client: { select: { name: true } } },
        }),
        prisma.invoice.groupBy({
          by: ["status"],
          _count: { _all: true },
          _sum: { total: true },
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

    const totalsByStatus = monthly.map((m) => ({ status: m.status, count: m._count._all, total: m._sum.total }));

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
        recentInvoices,
        revenueByCurrency: revenueByCurrency.map((c) => ({ currency: c.currency, total: c._sum.total })),
        totalsByCurrency: totalsByCurrency.map((c) => ({ currency: c.currency, total: c._sum.total })),
      },
    });
  }),
);

export default router;
