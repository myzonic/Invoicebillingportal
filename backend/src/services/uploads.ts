import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function mimeType(name: string, fallback = "application/octet-stream") {
  return MIME_BY_EXT[path.extname(name).toLowerCase()] || fallback;
}

/**
 * Persist an upload in the database. The disk copy is kept as a best-effort
 * cache for legacy static serving; the database is the durable source.
 */
export async function saveUpload(name: string, bytes: Buffer, declaredMime?: string): Promise<void> {
  const key = path.basename(name);
  await prisma.uploadedAsset.upsert({
    where: { key },
    update: { data: bytes, mimeType: declaredMime || mimeType(key) },
    create: { key, data: bytes, mimeType: declaredMime || mimeType(key) },
  });
  try {
    const dir = path.resolve(env.upload.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, key), bytes);
  } catch {
    // Read-only/filesystem-less deploys are fine: the database copy is enough.
  }
}

/** Read from the durable DB copy first, then fall back to legacy disk files. */
export async function readUpload(name: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const key = path.basename(name);
  const asset = await prisma.uploadedAsset.findUnique({ where: { key } });
  if (asset) return { bytes: Buffer.from(asset.data), mimeType: asset.mimeType };
  try {
    const file = path.resolve(env.upload.dir, key);
    if (!fs.existsSync(file)) return null;
    return { bytes: fs.readFileSync(file), mimeType: mimeType(key) };
  } catch {
    return null;
  }
}

/**
 * On boot, import any files left on disk from older deploys into the database.
 * This preserves logos that were uploaded before durable storage existed.
 */
export async function backfillUploads(): Promise<number> {
  const dir = path.resolve(env.upload.dir);
  let imported = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (!fs.statSync(file).isFile()) continue;
      const key = path.basename(name);
      const exists = await prisma.uploadedAsset.findUnique({ where: { key }, select: { key: true } });
      if (exists) continue;
      await saveUpload(key, fs.readFileSync(file), mimeType(key));
      imported += 1;
    }
  } catch (err) {
    console.warn("[uploads] backfill skipped:", err instanceof Error ? err.message : err);
  }
  return imported;
}
