-- Brand identity, payment-domain configuration and status
ALTER TABLE "Brand"
  ADD COLUMN "domain" TEXT,
  ADD COLUMN "paymentSubdomain" TEXT NOT NULL DEFAULT 'pay',
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "paymentEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "paymentSettings" JSONB;

CREATE UNIQUE INDEX "Brand_domain_key" ON "Brand"("domain");
CREATE INDEX "Brand_isActive_idx" ON "Brand"("isActive");

-- Secure, stable public token for every invoice. Existing invoices are
-- backfilled with a random 64-hex-character token so old data keeps working.
ALTER TABLE "Invoice" ADD COLUMN "publicToken" TEXT;
UPDATE "Invoice"
SET "publicToken" = md5("id" || clock_timestamp()::text || random()::text) ||
                    md5("number" || clock_timestamp()::text || random()::text)
WHERE "publicToken" IS NULL;
ALTER TABLE "Invoice" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");
