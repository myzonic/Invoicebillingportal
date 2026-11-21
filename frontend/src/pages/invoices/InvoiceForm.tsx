/**
 * Invoice creation/edit route. The full Invoice Builder lives in a reusable
 * component so the create and edit views share one implementation.
 */
import InvoiceBuilder from "@/components/invoiceBuilder/InvoiceBuilder";

export default function InvoiceForm() {
  return <InvoiceBuilder />;
}
