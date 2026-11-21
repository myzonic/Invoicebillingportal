-- Additive only: new invoices and existing rows are untouched.
-- Holds builder-only document fields (shipping, terms, payment instructions,
-- internal notes, attachment metadata, paper size, typography).
ALTER TABLE "Invoice" ADD COLUMN "builderData" JSONB;
