import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { env } from "./config/env";
import { notFound, errorHandler } from "./middleware/error";

import authRoutes from "./modules/auth/routes";
import userRoutes from "./modules/users/routes";
import roleRoutes from "./modules/roles/routes";
import clientRoutes from "./modules/clients/routes";
import invoiceRoutes from "./modules/invoices/routes";
import brandRoutes from "./modules/brands/routes";
import merchantRoutes from "./modules/merchants/routes";
import dashboardRoutes from "./modules/dashboard/routes";
import logRoutes from "./modules/logs/routes";
import invoiceLogRoutes from "./modules/invoiceLogs/routes";
import settingsRoutes from "./modules/settings/routes";
import paymentRoutes from "./modules/payments/routes";
import webhookRoutes from "./modules/payments/webhook";
import uploadRoutes from "./modules/uploads/routes";
import rateRoutes from "./modules/rates/routes";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", true);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Square Web Payments loads its SDK script and renders the card form
          // in an iframe served from Square's CDN.
          "script-src": ["'self'", "https://web.squarecdn.com", "https://sandbox.web.squarecdn.com"],
          "frame-src": ["'self'", "https://*.squareup.com", "https://*.squarecdn.com"],
          "connect-src": ["'self'", "https://web.squarecdn.com", "https://sandbox.web.squarecdn.com"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: [env.clientUrl, env.apiUrl].filter(Boolean),
      credentials: true,
    }),
  );

  // Public webhook must receive the raw body for Square HMAC verification.
  app.use(
    "/api/webhooks",
    express.raw({ type: "application/json", limit: "1mb" }),
    (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { rawBody?: string }).rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      req.body = req.body && Buffer.isBuffer(req.body) && req.body.length ? JSON.parse(req.body.toString("utf8")) : req.body;
      next();
    },
  );
  app.use("/api/webhooks", webhookRoutes);

  // Regular JSON API
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/health", (_req, res) => res.json({ success: true, message: `${env.branding.portalName} API is healthy` }));

  // Runtime-safe public branding. Only explicitly allow-listed, non-secret
  // values are exposed to the browser.
  app.get("/app-config.js", (_req, res) => {
    res.type("application/javascript");
    res.set("Cache-Control", "no-store");
    res.send(
      `window.__APP_CONFIG__=${JSON.stringify({
        portalName: env.branding.portalName,
        portalTagline: env.branding.portalTagline,
        companyName: env.branding.companyName,
        paymentHost: env.branding.paymentHost,
        logoUrl: env.branding.publicLogoUrl,
        defaultBrandName: env.branding.defaultBrandName,
      })};`,
    );
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/roles", roleRoutes);
  app.use("/api/clients", clientRoutes);
  app.use("/api/invoices", invoiceRoutes);
  app.use("/api/brands", brandRoutes);
  app.use("/api/merchants", merchantRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/logs", logRoutes);
  app.use("/api/invoice-logs", invoiceLogRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/rates", rateRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/uploads", uploadRoutes);

  app.use("/uploads", express.static(path.resolve(env.upload.dir)));

  // Single-app deploy: serve the built frontend (Vite dist) and fall back to
  // index.html for client-side routes. API + uploads are handled above.
  const frontendDist = process.env.FRONTEND_DIST || path.resolve(process.cwd(), "..", "frontend", "dist");
  app.use(express.static(frontendDist));
  app.get(/^(?!\/(api|uploads)\b).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
