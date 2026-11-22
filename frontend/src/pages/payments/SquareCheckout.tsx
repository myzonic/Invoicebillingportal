import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCreatePaymentQuoteMutation, usePublicInvoiceQuery } from "@/app/apiSlice";
import type { PaymentQuote } from "@/types";
import { brandColor, formatDate, money, rgba, richText, shade, statusLabel } from "@/lib/utils";
import { resolveInvoiceDesign, mixHex, tint } from "@/lib/invoiceDesign";
import { tones } from "@/components/invoiceDesign/InvoiceDesignPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner, EmptyState } from "@/components/ui/table";
import Logo from "@/components/Logo";
import type { SquareCard } from "@/types/square";
import { branding } from "@/config/branding";

// The PDF engine is ~9 MB (worker + wasm). Load it only when the invoice panel
// mounts so the checkout form itself stays fast, especially on mobile.
const PdfFrame = lazy(() => import("@/components/PdfFrame").then((m) => ({ default: m.PdfFrame })));

interface CheckoutConfig {
  applicationId: string;
  locationId: string;
  environment: string;
}

export default function SquareCheckout() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePublicInvoiceQuery(id);
  const [createQuote] = useCreatePaymentQuoteMutation();
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [billing, setBilling] = useState({
    name: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const setB = (key: keyof typeof billing, value: string) => setBilling((prev) => ({ ...prev, [key]: value }));
  const cardRef = useRef<SquareCard | null>(null);
  const invoiceStatus = data?.data?.status;

  // Starting a checkout locks a fresh exchange rate + USD amount on the server.
  // The browser only holds an opaque token; the USD figure never leaves the API.
  useEffect(() => {
    if (!id || !invoiceStatus || invoiceStatus === "PAID") return;
    let cancelled = false;
    (async () => {
      try {
        const result = await createQuote(id).unwrap();
        if (!cancelled) {
          setQuote(result.data);
          setError("");
        }
      } catch {
        // Rate locking is a background concern — don't surface it to the client.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, invoiceStatus, createQuote]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/payments/config`);
        const json = await res.json();
        if (json.success && !cancelled) setConfig(json.data);
      } catch {
        /* handled below */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    if (!config?.applicationId) return;
    let disposed = false;

    const script = document.createElement("script");
    script.src =
      config.environment === "production"
        ? "https://web.squarecdn.com/v1/square.js"
        : "https://sandbox.web.squarecdn.com/v1/square.js";
    script.async = true;
    script.onload = async () => {
      if (disposed || !window.Square) return;
      try {
        const payments = window.Square.payments(config.applicationId, config.locationId);
        const card = await payments.card();
        await card.attach("#square-card");
        cardRef.current = card;
        if (!disposed) setReady(true);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "Could not initialize card form");
      }
    };
    document.body.appendChild(script);

    return () => {
      disposed = true;
      cardRef.current?.destroy().catch(() => {});
      document.body.removeChild(script);
    };
  }, [config]);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <EmptyState title="Invoice not available" hint="Check the link and try again." />;

  const inv = data.data;
  const items = (inv.items || []) as { description: string; quantity: number; unitPrice: number; discount?: number }[];
  // Legacy invoices store the discount per line instead of in discountAmount.
  const itemDiscount = items.reduce((sum, item) => sum + (Number(item.discount) || 0), 0);
  const discountTotal = (Number(inv.discountAmount) || 0) + itemDiscount;
  const itemNet = (item: (typeof items)[number]) =>
    Math.max(0, Number(item.quantity) * Number(item.unitPrice) - (Number(item.discount) || 0));
  const brand = inv.brand;
  const company = inv.company || { name: brand?.name || branding.companyName, email: "", phone: "", address: "", website: "" };
  const brandName = brand?.businessName || brand?.name || company.name;
  // Use the invoice's saved design (or the brand default) so this page matches
  // the PDF and the public invoice page. Fall back to the legacy single colour.
  const design = resolveInvoiceDesign(inv, brand);
  const t = design && design.layout !== "legacy" ? tones(design) : null;
  const accent = t ? t.accent : brandColor(brand?.color || inv.color);
  const primary = t ? t.primary : "#171719";
  const secondary = t ? t.secondary : accent;
  const ink = t ? t.ink : "#171c26";
  const muted = t ? t.muted : "#6b7280";
  const line = t ? t.line : "#e5e7eb";
  const headerDark = t ? t.headerDark : true;
  const headerText = headerDark ? "#ffffff" : ink;
  const headerMuted = headerDark ? t?.onDarkMuted || "rgba(255,255,255,.75)" : muted;
  const headerTitle = headerDark ? t?.darkAccent || shade(accent, 0.4) : secondary;
  const tableHeaderFill = t ? (t.minimal ? "transparent" : mixHex(t.supporting, t.primary, 0.08)) : "#f9fafb";
  const accentDark = shade(accent, -0.4);
  const accentSoft = shade(accent, 0.85);
  const inputBorder = { borderColor: rgba(accent, 0.5) };
  const headerLines = (brand?.pdfHeader || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const footerText = brand?.pdfFooter?.trim() || `Thank you for your business. ${brandName}`;
  const footerContact = [brand?.website || company.website, brand?.email || company.email]
    .filter(Boolean)
    .join("  |  ");

  const refreshQuote = async () => {
    try {
      const result = await createQuote(id).unwrap();
      setQuote(result.data);
      return result.data;
    } catch {
      return null;
    }
  };

  const handlePay = async () => {
    if (!cardRef.current) return;
    if (!quote) {
      void refreshQuote();
      return;
    }
    if (!billing.name.trim() || !billing.addressLine1.trim() || !billing.city.trim() || !billing.postalCode.trim()) {
      setError("Please complete the cardholder name and billing address fields.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== "OK") {
        setError(result.errors?.[0]?.detail || "Card could not be verified. Check the details and try again.");
        return;
      }
      const charge = async (quoteToken: string) =>
        fetch(`/api/payments/charge/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: result.token, quoteToken, billing }),
        });

      const res = await charge(quote.token);
      const json = await res.json();
      if (res.status === 409) {
        // Rate expired / already used / invoice changed: lock a fresh quote for
        // the next attempt and surface the server's specific reason.
        void refreshQuote();
        setError(json.message || "Payment details changed. Please try again.");
        return;
      }
      if (!res.ok || !json.success) {
        // The attempt (and its quote) may already be consumed even on a decline,
        // so lock a fresh rate for the next try.
        void refreshQuote();
        setError(json.message || "Payment failed. Please try again.");
        return;
      }
      toast.success("Payment successful!");
      // Receipt stays in the original invoice currency; USD processing details
      // are intentionally not exposed to the client.
      navigate(
        `/payment_success?invoice=${id}&amount=${encodeURIComponent(String(inv.total))}&currency=${encodeURIComponent(inv.currency || "USD")}&color=${encodeURIComponent(inv.color || "")}`,
        { replace: true },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden p-4 lg:p-8"
      style={{
        background: `linear-gradient(135deg, ${tint(t?.supporting || accent, 0.96)} 0%, ${tint(t?.supporting || accent, 0.88)} 55%, ${tint(t?.accent || accent, 0.9)} 100%)`,
      }}
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

      <div className="relative mx-auto grid w-full max-w-[1250px] items-start gap-6 lg:grid-cols-[minmax(0,794px)_minmax(320px,380px)] lg:justify-center">
        {/* Left: the actual invoice PDF, rendered with EmbedPDF */}
        <Card
          className="overflow-hidden border bg-white"
          style={{ borderColor: line, boxShadow: `0 24px 60px -24px ${rgba(primary, 0.35)}` }}
        >
          <Suspense fallback={<div className="flex h-[75vh] items-center justify-center"><Spinner /></div>}>
            <PdfFrame
              src={`/api/payments/public/${id}/pdf`}
              className="h-[75vh] min-h-[520px] rounded-none border-0 bg-white"
            />
          </Suspense>
        </Card>

        {/* Right: card entry */}
        <Card
          className="sticky top-8 border bg-white/95 backdrop-blur-xl"
          style={{ borderColor: rgba(accent, 0.55), boxShadow: `0 24px 60px -24px ${rgba(accent, 0.5)}` }}
        >
          <CardContent>
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Logo
                  src={brand?.logoUrl}
                  alt={brand?.name}
                  className="h-auto max-h-14 w-auto max-w-[170px] shrink-0 object-contain"
                />
                <div>
                  <p className="text-sm font-bold leading-tight text-neutral-900">
                    {brand?.businessName || brand?.name || branding.paymentHost}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-neutral-500">
                    <Lock className="size-3" style={{ color: accentDark }} /> Secure checkout
                  </p>
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-neutral-900"
                style={{
                  background: `linear-gradient(180deg, ${shade(accent, 0.5)}, ${accent})`,
                  boxShadow: `inset 0 1px 0 ${rgba("#ffffff", 0.7)}`,
                  border: `1px solid ${shade(accent, -0.15)}`,
                }}
              >
                <ShieldCheck className="size-3.5" /> Encrypted
              </span>
            </div>

            <div
              className="mb-6 flex items-baseline justify-between rounded-xl border px-4 py-3"
              style={{
                borderColor: rgba(accent, 0.5),
                background: `linear-gradient(135deg, ${rgba(accent, 0.12)}, ${rgba(accent, 0.26)})`,
              }}
            >
              <span className="text-sm font-medium text-neutral-600">Total due</span>
              <div className="text-right">
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
              <div className="space-y-4">
                {!config?.applicationId ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-700">
                    Online payment is not configured yet.
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-neutral-800">Card details</span>
                        <span className="text-[11px] text-neutral-400">
                          Powered by <span className="font-semibold text-neutral-600">Square</span>
                        </span>
                      </div>

                      <div className="mb-3">
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                          Cardholder Name
                        </label>
                        <input
                          type="text"
                          autoComplete="cc-name"
                          placeholder="Name on card"
                          value={billing.name}
                          onChange={(e) => setB("name", e.target.value)}
                          className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 placeholder:text-neutral-400"
                          style={inputBorder}
                        />
                      </div>

                      <div
                        id="square-card"
                        className="rounded-xl border bg-white p-3 shadow-inner transition-colors [&_iframe]:min-h-[44px]"
                        style={inputBorder}
                      />

                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                            Billing Address
                          </label>
                          <input
                            type="text"
                            autoComplete="billing address-line1"
                            placeholder="Street address"
                            value={billing.addressLine1}
                            onChange={(e) => setB("addressLine1", e.target.value)}
                            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 placeholder:text-neutral-400"
                            style={inputBorder}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                              City
                            </label>
                            <input
                              type="text"
                              autoComplete="billing address-level2"
                              placeholder="City"
                              value={billing.city}
                              onChange={(e) => setB("city", e.target.value)}
                              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 placeholder:text-neutral-400"
                              style={inputBorder}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                              State
                            </label>
                            <input
                              type="text"
                              autoComplete="billing address-level1"
                              placeholder="State / Province"
                              value={billing.state}
                              onChange={(e) => setB("state", e.target.value)}
                              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 placeholder:text-neutral-400"
                              style={inputBorder}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                            Zip / Postal Code
                          </label>
                          <input
                            type="text"
                            autoComplete="billing postal-code"
                            placeholder="e.g. 10001"
                            value={billing.postalCode}
                            onChange={(e) => setB("postalCode", e.target.value)}
                            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 placeholder:text-neutral-400"
                            style={inputBorder}
                          />
                        </div>
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
                    )}

                    <button
                      type="button"
                      disabled={!ready || !quote || busy}
                      onClick={handlePay}
                      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white outline-none transition-all hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      style={{
                        background: `linear-gradient(180deg, ${shade(accent, 0.2)}, ${shade(accent, -0.05)} 45%, ${shade(accent, -0.25)})`,
                        boxShadow: `0 8px 20px -6px ${rgba(accent, 0.6)}, inset 0 1px 0 ${rgba("#ffffff", 0.35)}`,
                      }}
                    >
                      <CreditCard className="size-5" /> Pay {money(inv.total, inv.currency || "USD")} <ArrowRight className="size-4" />
                    </button>
                    <p className="text-center text-[11px] leading-relaxed text-neutral-500">
                      Your payment is encrypted and processed securely. Paying confirms this invoice.
                    </p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
