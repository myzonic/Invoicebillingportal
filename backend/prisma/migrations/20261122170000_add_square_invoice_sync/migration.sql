-- Mirror portal invoices into the configured Square Dashboard location.
ALTER TABLE "Client" ADD COLUMN "squareCustomerId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "squareInvoiceId" TEXT;
