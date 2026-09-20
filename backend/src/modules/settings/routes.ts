import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/rbac";

const router = Router();
router.use(requireAuth);

const ALLOWED_KEYS = ["company", "currency", "payment_methods"];

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    const data: Record<string, unknown> = {};
    for (const r of rows) data[r.key] = r.value;
    res.json({ success: true, data });
  }),
);

router.put(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    for (const key of Object.keys(req.body)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      await prisma.setting.upsert({
        where: { key },
        update: { value: req.body[key] },
        create: { key, value: req.body[key] },
      });
    }
    const rows = await prisma.setting.findMany();
    const data: Record<string, unknown> = {};
    for (const r of rows) data[r.key] = r.value;
    res.json({ success: true, data });
  }),
);

export default router;
