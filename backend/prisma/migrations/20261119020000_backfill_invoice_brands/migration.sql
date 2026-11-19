-- Ensure every existing invoice is tied to a brand so client-facing pages and
-- PDFs render brand details. New invoices are always assigned a brand by the API.
UPDATE "Invoice" AS i
SET "brandId" = COALESCE(
  (SELECT c."brandId" FROM "Client" c WHERE c."id" = i."clientId"),
  (SELECT b."id" FROM "Brand" b WHERE b."isDefault" = true AND b."isActive" = true LIMIT 1),
  (SELECT b."id" FROM "Brand" b WHERE b."isActive" = true ORDER BY b."createdAt" ASC LIMIT 1)
)
WHERE i."brandId" IS NULL;
