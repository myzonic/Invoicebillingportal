import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/** Portal identity is fixed in code so stale runtime env cannot replace it. */
const PORTAL_IDENTITY = "Crystal Reserve LLC";

const squareAppId = process.env.SQUARE_APP_ID || "";
const squareEnvironment = (process.env.SQUARE_ENVIRONMENT || "sandbox") as "sandbox" | "production";

/** Per-currency Square credentials (SQUARE_TOKEN_<CUR> + SQUARE_LOCATION_<CUR> + optional SQUARE_APP_ID_<CUR>). */
function squareLocations(): Record<string, { accessToken: string; locationId: string; applicationId: string }> {
  const map: Record<string, { accessToken: string; locationId: string; applicationId: string }> = {};
  for (const cur of ["USD", "GBP", "AUD", "CAD", "EUR"]) {
    const accessToken = process.env[`SQUARE_TOKEN_${cur}`];
    const locationId = process.env[`SQUARE_LOCATION_${cur}`];
    if (accessToken && locationId) {
      map[cur] = {
        accessToken,
        locationId,
        applicationId: process.env[`SQUARE_APP_ID_${cur}`] || squareAppId,
      };
    }
  }
  return map;
}

export const env = {
  port: Number(process.env.PORT || 3001),
  apiUrl: process.env.API_URL || "http://localhost:3001",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  /**
   * Extra CORS origins, comma-separated. Supports `*` wildcards, e.g.
   * `https://pay.*` to allow every brand payment subdomain when the frontend
   * is hosted separately (Vercel fallback). Brand payment domains stored in
   * the database are also allowed automatically.
   */
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || "30d",
  // The invite token grants signup access (the seed binds it to the admin role),
  // so a predictable fallback must never be used in production.
  inviteToken: required("INVITE_TOKEN", process.env.NODE_ENV === "production" ? undefined : "dev-invite-token"),

  branding: {
    portalName: PORTAL_IDENTITY,
    portalTagline: process.env.PORTAL_TAGLINE || "Finance & Billing",
    companyName: PORTAL_IDENTITY,
    companyEmail: process.env.COMPANY_EMAIL || "billing@example.com",
    companyWebsite: process.env.COMPANY_WEBSITE || "https://example.com",
    paymentHost: process.env.PAYMENT_HOST || "",
    paymentUrl: (process.env.PAYMENT_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, ""),
    publicLogoUrl: process.env.PUBLIC_LOGO_URL || "",
    defaultBrandName: PORTAL_IDENTITY,
  },

  square: {
    accessToken: required("SQUARE_ACCESS_TOKEN"),
    locationId: required("SQUARE_LOCATION_ID"),
    applicationId: squareAppId,
    environment: squareEnvironment,
    /**
     * Currency the default SQUARE_ACCESS_TOKEN/SQUARE_LOCATION_ID account
     * settles in. Charges are always computed in this currency.
     */
    defaultCurrency: (process.env.SQUARE_DEFAULT_CURRENCY || "USD").toUpperCase(),
    webhookSignatureKey: required("SQUARE_WEBHOOK_SIGNATURE_KEY"),
    // Must match the notification URL registered in the Square developer
    // console exactly, because it is part of the signed payload. Leave empty
    // to derive it from API_URL + /api/webhooks/square.
    webhookUrl: process.env.SQUARE_WEBHOOK_URL || "",
    locations: squareLocations(),
  },

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Billing Portal <billing@example.com>",
  },

  upload: {
    dir: process.env.UPLOAD_DIR || "uploads",
    maxMb: Number(process.env.MAX_UPLOAD_MB || 10),
  },
};
