import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { crudRouter } from "../crud";

const router = Router();
router.use(requireAuth);

router.use(
  "/",
  can("merchants", "read"),
  crudRouter(
    {
      model: "Merchant",
      moduleName: "merchants",
      searchFields: ["name", "email", "phone"],
      include: { brand: true },
      orderBy: { createdAt: "desc" },
    },
    { getOne: true },
  ),
);

export default router;
