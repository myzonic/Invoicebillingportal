import { LogAction } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function audit(input: {
  userId?: string | null;
  userEmail?: string | null;
  module: string;
  action: LogAction;
  details?: unknown;
  ip?: string;
}) {
  try {
    await prisma.auditLog.create({ data: { ...input, details: (input.details ?? null) as never } });
  } catch (e) {
    console.error("audit log write failed", e);
  }
}
