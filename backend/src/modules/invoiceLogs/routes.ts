import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  can("logs", "read"),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.invoiceLog.findMany({
      orderBy: { sentAt: "desc" },
      take: 100,
      include: { invoice: { select: { id: true, number: true } } },
    });
    res.json({ success: true, data: rows });
  }),
);

router.delete(
  "/:id",
  can("logs", "delete"),
  asyncHandler(async (req, res) => {
    const row = await prisma.invoiceLog.findUnique({ where: { id: req.params.id } });
    if (!row) throw new ApiError(404, "Log entry not found");
    await prisma.invoiceLog.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Deleted" });
  }),
);

export default router;
