import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { crudRouter } from "../crud";

const router = Router();
router.use(requireAuth);

const clientInclude = {
  brand: true,
  _count: { select: { invoices: true } },
};

router.use(
  "/",
  can("clients", "read"),
  crudRouter(
    {
      model: "Client",
      moduleName: "clients",
      searchFields: ["name", "email", "phone"],
      include: clientInclude,
      orderBy: { createdAt: "desc" },
    },
    { getOne: true },
  ),
);

export default router;
