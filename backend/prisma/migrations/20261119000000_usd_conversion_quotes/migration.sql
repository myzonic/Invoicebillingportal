-- Reconciliation fields: every Square charge records the exact FX snapshot and
-- the corresponding original invoice amount/currency it was derived from.
ALTER TABLE "Payment"
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "quoteId" TEXT,
  ADD COLUMN "invoiceAmount" DECIMAL(12,2),
  ADD COLUMN "invoiceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(20,10),
  ADD COLUMN "exchangeRateProvider" TEXT,
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3),
  ADD COLUMN "usdAmount" DECIMAL(12,2);

CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- Locked, short-lived FX quotes. One row per payment attempt.
CREATE TABLE "PaymentQuote" (
  "id"              TEXT NOT NULL,
  "token"           TEXT NOT NULL,
  "invoiceId"       TEXT NOT NULL,
  "invoiceAmount"   DECIMAL(12,2) NOT NULL,
  "invoiceCurrency" TEXT NOT NULL,
  "usdAmount"       DECIMAL(12,2) NOT NULL,
  "exchangeRate"    DECIMAL(20,10) NOT NULL,
  "provider"        TEXT NOT NULL,
  "rateAt"          TIMESTAMP(3) NOT NULL,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "usedAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentQuote_token_key" ON "PaymentQuote"("token");
CREATE INDEX "PaymentQuote_invoiceId_idx" ON "PaymentQuote"("invoiceId");
CREATE INDEX "PaymentQuote_expiresAt_idx" ON "PaymentQuote"("expiresAt");

ALTER TABLE "PaymentQuote" ADD CONSTRAINT "PaymentQuote_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
