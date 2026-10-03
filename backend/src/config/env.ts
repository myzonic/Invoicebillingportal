import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

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
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || "30d",
  inviteToken: process.env.INVITE_TOKEN || "dev-invite-token",

  branding: {
    portalName: process.env.PORTAL_NAME || "Billing Portal",
    portalTagline: process.env.PORTAL_TAGLINE || "Finance & Billing",
    companyName: process.env.COMPANY_NAME || "Your Company",
    companyEmail: process.env.COMPANY_EMAIL || "billing@example.com",
    companyWebsite: process.env.COMPANY_WEBSITE || "https://example.com",
    paymentHost: process.env.PAYMENT_HOST || "",
    paymentUrl: (process.env.PAYMENT_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, ""),
    publicLogoUrl: process.env.PUBLIC_LOGO_URL || "",
    defaultBrandName: process.env.DEFAULT_BRAND_NAME || process.env.COMPANY_NAME || "Your Company",
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
