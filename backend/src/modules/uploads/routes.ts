import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { ApiError } from "../../utils/ApiError";
import { env } from "../../config/env";

const router = Router();
router.use(requireAuth);

const uploadDir = path.resolve(env.upload.dir);
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = EXT[file.mimetype] || path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.upload.maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, "Only image files are allowed (png, jpg, webp, gif, svg)"));
  },
});

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? `File too large. Max size is ${env.upload.maxMb}MB.` : err.message;
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    res.status(201).json({ success: true, data: { url: `/uploads/${req.file.filename}` } });
  });
});

export default router;
