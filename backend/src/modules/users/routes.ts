import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma, LogAction } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { can } from "../../middleware/rbac";
import { audit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  roleId: z.string().min(1),
  isActive: z.boolean().optional(),
});

router.get(
  "/",
  can("users", "read"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const q = String(req.query.search || "").trim();
    const where: Prisma.UserWhereInput = q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : {};
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({
      success: true,
      data: rows.map((u) => ({ ...u, password: undefined })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);

router.get(
  "/:id",
  can("users", "read"),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
    if (!user) throw new ApiError(404, "User not found");
    res.json({ success: true, data: { ...user, password: undefined } });
  }),
);

router.post(
  "/",
  can("users", "create"),
  asyncHandler(async (req, res) => {
    const body = userSchema.parse(req.body);
    const email = body.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "A user with this email already exists");
    const password = body.password || (await createTemporaryPassword());
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        password: await bcrypt.hash(password, 10),
        roleId: body.roleId,
        isActive: body.isActive ?? true,
      },
      include: { role: true },
    });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "users",
      action: LogAction.CREATE,
      details: { id: user.id },
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: { ...user, password: undefined } });
  }),
);

router.put(
  "/:id",
  can("users", "update"),
  asyncHandler(async (req, res) => {
    const body = userSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new ApiError(404, "User not found");

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        name: body.name,
        email: body.email.toLowerCase().trim(),
        roleId: body.roleId,
        isActive: body.isActive ?? existing.isActive,
        ...(body.password ? { password: await bcrypt.hash(body.password, 10) } : {}),
      },
      include: { role: true },
    });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "users",
      action: LogAction.UPDATE,
      details: { id: user.id },
      ip: req.ip,
    });
    res.json({ success: true, data: { ...user, password: undefined } });
  }),
);

router.delete(
  "/:id",
  can("users", "delete"),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user?.id) throw new ApiError(400, "You cannot delete your own account");
    await prisma.user.delete({ where: { id: req.params.id } });
    await audit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      module: "users",
      action: LogAction.DELETE,
      details: { id: req.params.id },
      ip: req.ip,
    });
    res.json({ success: true, message: "Deleted" });
  }),
);

async function createTemporaryPassword() {
  return `Temp${Math.random().toString(36).slice(2, 10)}!`;
}

export default router;
