import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { usePaymentBrandIdentityQuery, usePublicInvoiceQuery } from "@/app/apiSlice";
import PaymentSuccessScreen from "@/components/payments/PaymentSuccessScreen";
import type { PaymentBrandIdentity } from "@/types";

/** Neutral, brand-free identity for unknown hosts or mismatched invoices. */
const NEUTRAL_IDENTITY: PaymentBrandIdentity = {
  id: "neutral",
  name: "Secure Payment",
  businessName: null,
  logoUrl: null,
  paymentDomain: "",
  currency: "USD",
  paymentEnabled: true,
  pdfFooter: null,
  colors: {
    primary: "#253238",
    secondary: "#4b5b63",
    accent: "#087f78",
    supporting: "#f4f7f8",
    background: "#f4f7f8",
    text: "#253238",
    button: "#087f78",
  },
};

function NeutralState({ verifying, unsupported }: { verifying: boolean; unsupported: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7f8] p-6 text-[#253238]">
      <div className="w-full max-w-md rounded-3xl border border-[#dbe4e8] bg-white px-6 py-10 text-center shadow-sm">
        {verifying ? (
          <Loader2 className="mx-auto mb-4 size-8 animate-spin text-[#087f78]" aria-hidden="true" />
        ) : (
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[#e6f4f2] text-[#087f78]">
            !
          </div>
        )}
        <h1 className="text-xl font-bold">
          {verifying ? "Loading secure payment details" : "Payment branding unavailable"}
        </h1>
        <p className="mt-2 text-sm text-[#4b5b63]">
          {verifying
            ? "Please wait while we verify this payment link."
            : unsupported
              ? "This payment domain is not configured. No brand identity has been applied."
              : "We could not verify the details for this payment. Please contact support."}
        </p>
      </div>
    </div>
  );
}

export default function PaymentResult({ variant }: { variant: "success" | "cancel" }) {
  const [params] = useSearchParams();
  const invoiceId = params.get("invoice");
  const [polls, setPolls] = useState(0);

  // Identity comes from the real payment hostname, never the portal default or
  // a manually selected brand value stored in localStorage/query params.
  const brandQuery = usePaymentBrandIdentityQuery();

  // Keep polling briefly after a redirect: Square webhooks may confirm the
  // payment a moment after the browser returns from checkout.
  const invoiceQuery = usePublicInvoiceQuery(invoiceId || "", {
    skip: !invoiceId,
    pollingInterval: variant === "success" && polls < 10 ? 3000 : 0,
  });

  const paymentState = invoiceQuery.data?.data?.paymentState;
  useEffect(() => {
    if (variant !== "success") return;
    if (!paymentState || paymentState === "COMPLETED" || paymentState === "CANCELLED" || paymentState === "OVERDUE") return;
    setPolls((count) => Math.min(count + 1, 10));
  }, [paymentState, variant]);

  const brand = brandQuery.data?.data;
  const invoice = invoiceQuery.data?.data;

  // Refuse to mix identities: the invoice's originating brand must match the
  // brand detected from the domain it was opened on.
  const brandMismatch = Boolean(brand && invoice?.brand?.id && invoice.brand.id !== brand.id);

  const brandLoading = brandQuery.isLoading;
  const invoiceLoading = Boolean(invoiceId) && invoiceQuery.isLoading;
  const verifying = variant === "success" && Boolean(invoiceId) && paymentState !== "COMPLETED" && polls < 10;

  if (brandLoading || invoiceLoading) return <NeutralState verifying unsupported={false} />;
  if (!brand || brandMismatch || (invoiceId && invoiceQuery.isError)) {
    return <NeutralState verifying={false} unsupported={!brand || brandMismatch} />;
  }

  return (
    <PaymentSuccessScreen
      variant={variant}
      brand={brand}
      invoice={invoice || null}
      verifying={verifying}
      pdfHref={invoiceId ? `/api/payments/public/${invoiceId}/pdf` : null}
    />
  );
}
