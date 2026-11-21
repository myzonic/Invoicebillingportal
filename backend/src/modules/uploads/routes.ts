import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { ApiError } from "../../utils/ApiError";
import { env } from "../../config/env";
import { saveUpload } from "../../services/uploads";

const router = Router();
router.use(requireAuth);

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.upload.maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, "Only image files are allowed (png, jpg, webp, gif, svg)"));
  },
});

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? `File too large. Max size is ${env.upload.maxMb}MB.` : err.message;
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    try {
      const ext = EXT[req.file.mimetype] || path.extname(req.file.originalname).toLowerCase() || ".png";
      const name = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
      await saveUpload(name, req.file.buffer, req.file.mimetype);
      return res.status(201).json({ success: true, data: { url: `/uploads/${name}` } });
    } catch (error) {
      return next(error);
    }
  });
});

export default router;
