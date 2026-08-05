import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { audit } from "../../utils/audit";
import { signTokens, requireAuth } from "../../middleware/auth";
import { LogAction } from "@prisma/client";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { role: true } });
    if (!user) throw new ApiError(401, "Invalid email or password");
    if (!user.isActive) throw new ApiError(403, "Account is disabled");

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new ApiError(401, "Invalid email or password");

    const tokens = signTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
    });

    await audit({
      userId: user.id,
      userEmail: user.email,
      module: "auth",
      action: LogAction.LOGIN,
      ip: req.ip,
    });

    res.json({ success: true, data: { ...tokens, user: serializeUser(user) } });
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = String(req.body.refreshToken || "");
    const decoded = jwt.verify(token, env.jwtRefreshSecret) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, include: { role: true } });
    if (!user || !user.isActive) throw new ApiError(401, "Invalid refresh token");

    const tokens = signTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
    });
    res.json({ success: true, data: { ...tokens, user: serializeUser(user) } });
  }),
);

router.post(
  "/signup/:token",
  asyncHandler(async (req, res) => {
    const { token, name, email, password } = signupSchema.parse({ ...req.body, token: req.params.token });
    const invite = await prisma.inviteToken.findUnique({ where: { token } });
    if (!invite || invite.used || invite.expiresAt < new Date()) {
      throw new ApiError(400, "This invite link is invalid or has expired");
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) throw new ApiError(409, "A user with this email already exists");

    const roleId = invite.roleId || (await prisma.role.findUnique({ where: { name: "staff" } }))!.id;
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashed,
        name,
        roleId,
      },
      include: { role: true },
    });
    await prisma.inviteToken.update({ where: { id: invite.id }, data: { used: true } });

    const tokens = signTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
    });
    res.status(201).json({ success: true, data: { ...tokens, user: serializeUser(user) } });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { role: { include: { permissions: true } } },
    });
    if (!user) throw new ApiError(401, "User not found");
    res.json({ success: true, data: serializeUser(user, true) });
  }),
);

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await audit({
    userId: req.user?.id,
    userEmail: req.user?.email,
    module: "auth",
    action: LogAction.LOGOUT,
    ip: req.ip,
  });
  res.json({ success: true });
}));

function serializeUser(user: { id: string; email: string; name: string; avatarUrl: string | null; role: { id: string; name: string; permissions?: unknown[] } }, withPerms = false) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: {
      id: user.role.id,
      name: user.role.name,
      ...(withPerms ? { permissions: user.role.permissions } : {}),
    },
  };
}

export default router;
