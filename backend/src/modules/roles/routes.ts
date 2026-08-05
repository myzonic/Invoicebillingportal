import { Router } from "express";
import { z } from "zod";
import { ModuleName, LogAction } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { audit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

export const MODULE_NAMES = Object.values(ModuleName);

const roleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  permissions: z.array(
    z.object({
      module: z.enum(ModuleName as unknown as [string, ...string[]]),
      canCreate: z.boolean().optional(),
      canRead: z.boolean().optional(),
      canUpdate: z.boolean().optional(),
      canDelete: z.boolean().optional(),
    }),
  ),
});

router.get(
  "/",
  can("roles", "read"),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ include: { permissions: true }, orderBy: { createdAt: "asc" } });
    res.json({ success: true, data: roles });
  }),
);

router.get(
  "/modules",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: MODULE_NAMES });
  }),
);

router.get(
  "/:id",
  can("roles", "read"),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: { permissions: true } });
    if (!role) throw new ApiError(404, "Role not found");
    res.json({ success: true, data: role });
  }),
);

router.post(
  "/",
  can("roles", "create"),
  asyncHandler(async (req, res) => {
    const body = roleSchema.parse(req.body);
    const existing = await prisma.role.findUnique({ where: { name: body.name } });
    if (existing) throw new ApiError(409, "A role with this name already exists");

    const role = await prisma.role.create({
      data: {
        name: body.name,
        description: body.description,
        permissions: { create: normalizePermissions(body.permissions) },
      },
      include: { permissions: true },
    });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "roles",
      action: LogAction.CREATE,
      details: { id: role.id },
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: role });
  }),
);

router.put(
  "/:id",
  can("roles", "update"),
  asyncHandler(async (req, res) => {
    const body = roleSchema.parse(req.body);
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new ApiError(404, "Role not found");
    if (existing.isSystem) throw new ApiError(400, "System roles cannot be edited");

    const role = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: req.params.id } });
      return tx.role.update({
        where: { id: req.params.id },
        data: {
          name: body.name,
          description: body.description,
          permissions: { create: normalizePermissions(body.permissions) },
        },
        include: { permissions: true },
      });
    });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "roles",
      action: LogAction.UPDATE,
      details: { id: role.id },
      ip: req.ip,
    });
    res.json({ success: true, data: role });
  }),
);

router.delete(
  "/:id",
  can("roles", "delete"),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) throw new ApiError(404, "Role not found");
    if (role.isSystem) throw new ApiError(400, "System roles cannot be deleted");
    const userCount = await prisma.user.count({ where: { roleId: req.params.id } });
    if (userCount > 0) throw new ApiError(400, `Role is assigned to ${userCount} user(s)`);

    await prisma.role.delete({ where: { id: req.params.id } });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "roles",
      action: LogAction.DELETE,
      details: { id: req.params.id },
      ip: req.ip,
    });
    res.json({ success: true, message: "Deleted" });
  }),
);

function normalizePermissions(permissions: z.infer<typeof roleSchema>["permissions"]) {
  return permissions.map((p) => ({
    module: p.module as ModuleName,
    canCreate: p.canCreate ?? false,
    canRead: p.canRead ?? false,
    canUpdate: p.canUpdate ?? false,
    canDelete: p.canDelete ?? false,
  }));
}

export default router;
