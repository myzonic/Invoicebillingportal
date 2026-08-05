import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  can("logs", "read"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const module = req.query.module ? String(req.query.module) : undefined;
    const where = module ? { module } : {};

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ success: true, data: rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  }),
);

export default router;
