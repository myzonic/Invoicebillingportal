import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { crudRouter } from "../crud";

const router = Router();
router.use(requireAuth);

router.use(
  "/",
  can("brands", "read"),
  crudRouter(
    {
      model: "Brand",
      moduleName: "brands",
      searchFields: ["name"],
      include: { _count: { select: { clients: true, invoices: true } } },
      orderBy: { createdAt: "desc" },
    },
    { getOne: true },
  ),
);

export default router;
