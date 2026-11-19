import { Router } from "express";
import { ApiError } from "../../utils/ApiError";
import { invalidateCorsOrigins } from "../../services/corsOrigins";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { normalizeDomain, normalizeSubdomain, paymentDomain, validateDomain, validateSubdomain } from "../../services/permalink";
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
      searchFields: ["name", "domain", "businessName", "email"],
      include: { _count: { select: { clients: true, invoices: true } } },
      orderBy: { createdAt: "desc" },
      transform: (brand) => ({ ...brand, paymentDomain: paymentDomain(brand) }),
      onWrite: invalidateCorsOrigins,
      parseBody: (body) => {
        const data = { ...body };
        if ("domain" in data) {
          const domain = normalizeDomain(String(data.domain || ""));
          const error = domain ? validateDomain(domain) : null;
          if (error) throw new ApiError(400, error);
          data.domain = domain || null;
        }
        if ("paymentSubdomain" in data) {
          const subdomain = normalizeSubdomain(String(data.paymentSubdomain || "pay"));
          const error = validateSubdomain(subdomain);
          if (error) throw new ApiError(400, error);
          data.paymentSubdomain = subdomain;
        }
        if ("color" in data) {
          const color = String(data.color || "").trim();
          if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
            throw new ApiError(400, "Brand color must be a hex value like #111111");
          }
          data.color = color || null;
        }
        for (const key of ["isDefault", "isActive", "paymentEnabled"] as const) {
          if (key in data) data[key] = data[key] === true || data[key] === "true" || data[key] === "yes" || data[key] === 1;
        }
        for (const key of ["businessName", "country", "website", "email", "phone", "address", "pdfHeader", "pdfFooter", "logoUrl"] as const) {
          if (key in data && (data[key] === "" || data[key] == null)) data[key] = null;
        }
        return data;
      },
    },
    { getOne: true },
  ),
);

export default router;
