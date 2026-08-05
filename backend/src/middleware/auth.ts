import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signTokens(user: { id: string; email: string; name: string; roleId: string; roleName: string }) {
  const payload = { id: user.id, email: user.email, roleId: user.roleId };
  const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
  const refreshToken = jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.refreshExpiresIn } as jwt.SignOptions);
  return { accessToken, refreshToken };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication required");
    }
    const token = header.slice(7);
    const decoded = jwt.verify(token, env.jwtSecret) as { id: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { role: true },
    });
    if (!user) throw new ApiError(401, "User no longer exists");
    if (!user.isActive) throw new ApiError(403, "Account is disabled");

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
    };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, "Invalid or expired token"));
  }
}
