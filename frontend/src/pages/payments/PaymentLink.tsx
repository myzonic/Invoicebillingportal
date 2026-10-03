import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, FileText, Lock } from "lucide-react";
import { usePublicInvoiceQuery } from "@/app/apiSlice";
import { brandColor, formatDate, money, rgba, richText, shade } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner, EmptyState } from "@/components/ui/table";
import Logo from "@/components/Logo";
import { branding } from "@/config/branding";

export default function PaymentLink() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePublicInvoiceQuery(id);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <EmptyState title="Invoice not available" hint="Check the link and try again." />;

  const inv = data.data;
  const items = (inv.items || []) as { description: string; quantity: number; unitPrice: number }[];
  const accent = brandColor(inv.color);
  const accentDark = shade(accent, -0.4);
  const accentSoft = shade(accent, 0.85);

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
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `linear-gradient(to_right,${rgba(accent, 0.08)} 1px,transparent 1px),linear-gradient(to_bottom,${rgba(accent, 0.08)} 1px,transparent 1px)`,
          backgroundSize: "44px 44px",
        }}
      />

      <Card
        className="relative w-full max-w-lg border bg-white/95 text-neutral-900 backdrop-blur-xl"
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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: accentDark }}>
                Invoice
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{inv.number}</h1>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-neutral-900"
              style={{
                background: `linear-gradient(180deg, ${shade(accent, 0.5)}, ${accent})`,
                boxShadow: `inset 0 1px 0 ${rgba("#ffffff", 0.7)}`,
                border: `1px solid ${shade(accent, -0.15)}`,
              }}
            >
              {inv.status?.replace("_", " ")}
            </span>
          </div>

          <p className="mb-6 text-sm text-neutral-600">
            {inv.brand?.name || branding.defaultBrandName} â€¢ billed to <span className="font-medium text-neutral-900">{inv.client?.name}</span> â€¢ due{" "}
            {formatDate(inv.dueDate)}
          </p>

          <div className="mb-6 overflow-hidden rounded-xl border" style={{ borderColor: rgba(accent, 0.5) }}>
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wide"
                  style={{ background: `linear-gradient(180deg, ${rgba(accent, 0.16)}, ${rgba(accent, 0.3)})`, color: accentDark }}
                >
                  <th className="px-4 py-3 font-bold">Description</th>
                  <th className="px-4 py-3 text-right font-bold">Qty</th>
                  <th className="px-4 py-3 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: rgba(accent, 0.35) }}>
                {items.map((item, i) => (
                  <tr key={i} className="text-neutral-800">
                    <td className="px-4 py-3">
                      <span className="richtext" dangerouslySetInnerHTML={{ __html: richText(item.description) }} />
                    </td>
                    <td className="px-4 py-3 text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-right">{money(item.quantity * item.unitPrice, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="flex items-center justify-between px-4 py-4"
              style={{ background: `linear-gradient(135deg, ${rgba(accent, 0.12)}, ${rgba(accent, 0.26)})` }}
            >
              <span className="text-sm font-medium text-neutral-600">Total due</span>
              <span
                className="text-2xl font-bold tracking-tight"
                style={{
                  backgroundImage: `linear-gradient(180deg, ${accent}, ${shade(accent, -0.45)})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {money(inv.total, inv.currency)}
              </span>
            </div>
          </div>

          {inv.status === "PAID" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700">
              This invoice has been paid. Thank you!
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate(`/invoice/checkout/${inv.id}`)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white outline-none transition-all hover:brightness-105 active:scale-[0.98]"
              style={{
                background: `linear-gradient(180deg, ${shade(accent, 0.2)}, ${shade(accent, -0.05)} 45%, ${shade(accent, -0.25)})`,
                boxShadow: `0 8px 20px -6px ${rgba(accent, 0.6)}, inset 0 1px 0 ${rgba("#ffffff", 0.35)}`,
              }}
            >
              <Lock className="size-4" /> Pay now <ArrowRight className="size-4" />
            </button>
          )}

          <a
            href={`/api/payments/public/${id}/pdf${inv.currency ? `?currency=${encodeURIComponent(inv.currency)}` : ""}`}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:brightness-[0.99]"
            style={{ borderColor: rgba(accent, 0.5), background: accentSoft }}
          >
            <FileText className="size-4" style={{ color: accentDark }} /> Download invoice PDF
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
