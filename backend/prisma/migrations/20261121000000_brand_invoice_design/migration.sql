-- Additive design fields. Existing invoices, brands, numbers and URLs are untouched.
ALTER TABLE "Brand" ADD COLUMN "logoPalette" JSONB;
ALTER TABLE "Brand" ADD COLUMN "invoiceDesign" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "designOverride" JSONB;
