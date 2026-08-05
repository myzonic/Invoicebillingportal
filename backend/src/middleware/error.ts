import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
  }

  // Prisma known errors
  const e = err as { code?: string; meta?: { target?: unknown }; message?: string };
  if (e?.code === "P2002") {
    return res.status(409).json({ success: false, message: "A record with that value already exists" });
  }
  if (e?.code === "P2025") {
    return res.status(404).json({ success: false, message: "Record not found" });
  }

  console.error("[error]", err);
  return res.status(500).json({ success: false, message: "Internal server error" });
}
