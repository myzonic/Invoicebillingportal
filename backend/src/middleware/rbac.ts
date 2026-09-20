import { NextFunction, Request, Response } from "express";
import { ModuleName } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

type Action = "create" | "read" | "update" | "delete";

/**
 * Role-based access control. Super-admin and admin bypass.
 * Others must hold the requested permission on the module.
 */
export function can(module: ModuleName, action: Action) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const roleName = req.user?.roleName?.toLowerCase();
      if (roleName === "super-admin" || roleName === "admin") return next();

      const perm = await prisma.rolePermission.findUnique({
        where: { roleId_module: { roleId: req.user!.roleId, module } },
      });
      const key = `can${action.charAt(0).toUpperCase()}${action.slice(1)}`;
      const allowed = perm ? Boolean((perm as unknown as Record<string, boolean>)[key]) : false;
      if (!allowed) throw new ApiError(403, `You do not have ${action} permission on ${module}`);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Administrator-only gate for surfaces that have no RBAC module of their own
 * (settings, currency rates). Anything that can influence how much a client is
 * charged must not be reachable by a module-scoped or read-only role.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const roleName = req.user?.roleName?.toLowerCase();
  if (roleName === "admin" || roleName === "super-admin") return next();
  return next(new ApiError(403, "This action requires an administrator account"));
}
