import { Request, Response, Router } from "express";
import { LogAction } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { audit } from "../utils/audit";

export interface CrudConfig {
  model: string;
  moduleName: string;
  searchFields?: string[];
  include?: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
  parseBody?: (body: Record<string, unknown>) => Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export function crudRouter(
  config: CrudConfig,
  opts: { getAll?: boolean; getOne?: boolean; create?: boolean; update?: boolean; remove?: boolean } = {},
) {
  const router = Router();
  const delegate = db[config.model];
  const all = opts.getAll ?? true;
  const one = opts.getOne ?? true;
  const create = opts.create ?? true;
  const update = opts.update ?? true;
  const remove = opts.remove ?? true;

  const listParams = (req: Request) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const q = String(req.query.search || "").trim();

    const where: Record<string, unknown> = {};
    if (q && config.searchFields?.length) {
      where.OR = config.searchFields.map((f) => ({ [f]: { contains: q, mode: "insensitive" } }));
    }
    return { page, limit, q, where };
  };

  if (all) {
    router.get(
      "/",
      asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, where } = listParams(req);
        const [rows, total] = await Promise.all([
          delegate.findMany({
            where,
            include: config.include,
            orderBy: config.orderBy || { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
          }),
          delegate.count({ where }),
        ]);
        res.json({ success: true, data: rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
      }),
    );
  }

  if (one) {
    router.get(
      "/:id",
      asyncHandler(async (req, res) => {
        const row = await delegate.findUnique({ where: { id: req.params.id }, include: config.include });
        if (!row) throw new ApiError(404, `${config.model} not found`);
        res.json({ success: true, data: row });
      }),
    );
  }

  if (create) {
    router.post(
      "/",
      asyncHandler(async (req, res) => {
        const data = config.parseBody ? config.parseBody(req.body) : req.body;
        const row = await delegate.create({ data });
        await audit({
          userId: req.user?.id,
          userEmail: req.user?.email,
          module: config.moduleName,
          action: LogAction.CREATE,
          details: { id: row.id },
          ip: req.ip,
        });
        res.status(201).json({ success: true, data: row });
      }),
    );
  }

  if (update) {
    router.put(
      "/:id",
      asyncHandler(async (req, res) => {
        const data = config.parseBody ? config.parseBody(req.body) : req.body;
        const row = await delegate.update({ where: { id: req.params.id }, data });
        await audit({
          userId: req.user?.id,
          userEmail: req.user?.email,
          module: config.moduleName,
          action: LogAction.UPDATE,
          details: { id: req.params.id },
          ip: req.ip,
        });
        res.json({ success: true, data: row });
      }),
    );
  }

  if (remove) {
    router.delete(
      "/:id",
      asyncHandler(async (req, res) => {
        await delegate.delete({ where: { id: req.params.id } });
        await audit({
          userId: req.user?.id,
          userEmail: req.user?.email,
          module: config.moduleName,
          action: LogAction.DELETE,
          details: { id: req.params.id },
          ip: req.ip,
        });
        res.json({ success: true, message: "Deleted" });
      }),
    );
  }

  return router;
}
