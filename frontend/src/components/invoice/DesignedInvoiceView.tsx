import type { InvoiceDesign } from "@/types";
import { mixHex, tint } from "@/lib/invoiceDesign";
import { InvoiceDesignPreview, type PreviewItem } from "@/components/invoiceDesign/InvoiceDesignPreview";
import { formatDate, rgba, statusLabel } from "@/lib/utils";
import { ArrowRight, FileText, Lock } from "lucide-react";
import { branding } from "@/config/branding";

export interface DesignedInvoiceData {
  number: string;
  items: PreviewItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  status: string;
  paymentState?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  client?: { name?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
  brand?: {
    name?: string | null;
    businessName?: string | null;
    logoUrl?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    pdfHeader?: string | null;
    pdfFooter?: string | null;
  } | null;
  company?: { name: string; email: string; phone: string; address: string; website: string };
  builderData?: {
    shipping?: number;
    paymentTerms?: string;
    paymentInstructions?: string;
    terms?: string;
    customerCompany?: string;
    customerTaxId?: string;
    billingAddress?: string;
    shippingAddress?: string;
    businessName?: string;
    clientName?: string;
    customerEmail?: string;
    attachments?: Array<{ name: string; url: string }>;
  } | null;
}

interface Props {
  data: DesignedInvoiceData;
  design: InvoiceDesign;
  pdfUrl: string;
  onPay: () => void;
  paid: boolean;
}

/**
 * Customer-facing page. It renders the same document component as the live
 * editor, so the client sees exactly what the sender approved.
 */
export function DesignedInvoiceView({ data, design, pdfUrl, onPay, paid }: Props) {
  const brand = data.brand;
  const company = data.company;
  const builder = data.builderData;
  const businessName = builder?.businessName || brand?.businessName || brand?.name || company?.name || branding.defaultBrandName;
  const contactLine = [brand?.email || company?.email, brand?.phone || company?.phone, brand?.website || company?.website]
    .filter(Boolean)
    .join("  ·  ");
  const footerText = brand?.pdfFooter?.trim() || `Thank you for your business. ${businessName}`;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ background: `linear-gradient(135deg, ${tint(design.colors.supporting, 0.96)} 0%, ${tint(design.colors.supporting, 0.88)} 55%, ${tint(design.colors.accent, 0.9)} 100%)` }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage: `linear-gradient(to_right,${rgba(design.colors.primary, 0.05)} 1px,transparent 1px),linear-gradient(to_bottom,${rgba(design.colors.primary, 0.05)} 1px,transparent 1px)`,
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative w-full max-w-[820px]">
        <InvoiceDesignPreview
          design={design}
          logoUrl={brand?.logoUrl}
          businessName={businessName}
          clientName={builder?.clientName || data.client?.name || "Customer"}
          customerEmail={builder?.customerEmail || data.client?.email || undefined}
          customerAddress={builder?.billingAddress || data.client?.address || undefined}
          invoiceNumber={data.number}
          items={data.items}
          currency={data.currency}
          issueDate={formatDate(data.issueDate)}
          dueDate={data.dueDate ? formatDate(data.dueDate) : "-"}
          status={statusLabel(data.paymentState || data.status)}
          notes={data.notes}
          subtotal={data.subtotal}
          taxRate={data.taxRate}
          taxAmount={data.taxAmount}
          discountAmount={data.discountAmount}
          totalAmount={data.total}
          shipping={Number(builder?.shipping || 0)}
          contactLine={contactLine}
          brandAddress={brand?.address || company?.address || undefined}
          brandHeader={brand?.pdfHeader || undefined}
          footerText={footerText}
          paymentInstructions={builder?.paymentInstructions || undefined}
          terms={builder?.terms || undefined}
          className="!rounded-2xl !shadow-2xl"
        />

        <div
          className="mt-4 space-y-3 rounded-2xl border bg-card p-5 shadow-sm"
          style={{ borderColor: mixHex(design.colors.primary, "#ffffff", 0.82) }}
        >
          {paid ? (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center text-sm font-semibold text-success">
              This invoice has been paid. Thank you!
            </div>
          ) : (
            <button
              type="button"
              onClick={onPay}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white outline-none transition-all hover:brightness-105 active:scale-[0.99]"
              style={{ background: design.colors.primary }}
            >
              <Lock className="size-4" /> Pay now <ArrowRight className="size-4" />
            </button>
          )}
          <a
            href={pdfUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium transition-colors hover:brightness-[0.99]"
            style={{ borderColor: mixHex(design.colors.primary, "#ffffff", 0.72), color: design.colors.primary }}
          >
            <FileText className="size-4" /> Download invoice PDF
          </a>
        </div>
      </div>
    </div>
  );
}
