import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { brandColor, money, rgba, shade } from "@/lib/utils";
import Logo from "@/components/Logo";

export default function PaymentResult({ variant }: { variant: "success" | "cancel" }) {
  const [params] = useSearchParams();
  const success = variant === "success";
  const paid = params.get("amount") ? money(params.get("amount"), params.get("currency") ?? undefined) : null;
  const invoiceId = params.get("invoice");
  const currency = params.get("currency");
  const accent = brandColor(params.get("color"));
  const pdfHref = invoiceId
    ? `/api/payments/public/${invoiceId}/pdf${currency ? `?currency=${encodeURIComponent(currency)}` : ""}`
    : null;
  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ background: `linear-gradient(135deg, ${shade(accent, 0.97)} 0%, ${shade(accent, 0.9)} 50%, ${shade(accent, 0.82)} 100%)` }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse_at_top_right,${rgba(accent, 0.4)},transparent 55%),radial-gradient(ellipse_at_bottom_left,${rgba(accent, 0.18)},transparent 55%)`,
        }}
      />
      <Card
        className="relative w-full max-w-md border bg-white/95 text-center text-neutral-900 backdrop-blur-xl"
        style={{ borderColor: rgba(accent, 0.55), boxShadow: `0 24px 60px -24px ${rgba(accent, 0.5)}` }}
      >
        <CardContent>
          <div className="mb-4 flex justify-center">
            <div
              className="flex size-20 items-center justify-center overflow-hidden rounded-2xl"
              style={{
                background: `linear-gradient(180deg, ${shade(accent, 0.5)}, ${accent})`,
                boxShadow: `inset 0 1px 0 ${rgba("#ffffff", 0.8)}`,
                border: `1px solid ${shade(accent, -0.15)}`,
              }}
            >
              <Logo className="size-16" />
            </div>
          </div>
          <div
            className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-full ${success ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"}`}
          >
            {success ? <CheckCircle2 className="size-8" /> : <XCircle className="size-8" />}
          </div>
          <h1 className="text-xl font-bold text-neutral-900">{success ? "Payment successful" : "Payment cancelled"}</h1>
          {paid && success && (
            <p className="mt-2 text-2xl font-extrabold text-emerald-600">{paid}</p>
          )}
          <p className="mt-2 text-sm text-neutral-600">
            {success
              ? "Thank you! Your payment has been received and the invoice will be marked as paid shortly."
              : "You cancelled the payment. No charge was made. You can try again at any time."}
          </p>
          {success && pdfHref && (
            <a
              href={pdfHref}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm font-bold text-neutral-800 transition-colors hover:brightness-[0.99]"
              style={{ borderColor: rgba(accent, 0.5), background: shade(accent, 0.85) }}
            >
              <Download className="size-4" style={{ color: shade(accent, -0.4) }} /> Download Invoice PDF
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
