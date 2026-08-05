import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { usePublicInvoiceQuery } from "@/app/apiSlice";
import { brandColor, formatDate, money, rgba, richText, shade } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner, EmptyState } from "@/components/ui/table";
import Logo from "@/components/Logo";
import type { SquareCard } from "@/types/square";

interface CheckoutConfig {
  applicationId: string;
  locationId: string;
  environment: string;
}

export default function SquareCheckout() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePublicInvoiceQuery(id);
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

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        const currency = data.data.chargeCurrency || data.data.currency || "USD";
        const res = await fetch(`/api/payments/config?currency=${encodeURIComponent(currency)}`);
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
  const items = (inv.items || []) as { description: string; quantity: number; unitPrice: number }[];
  const brand = inv.brand;
  const company = inv.company || { name: brand?.name || "Myzonic", email: "", phone: "", address: "", website: "" };
  const accent = brandColor(inv.color);
  const accentDark = shade(accent, -0.4);
  const accentSoft = shade(accent, 0.85);
  const inputBorder = { borderColor: rgba(accent, 0.5) };
  const chargeCurrency = inv.chargeCurrency || "USD";
  const chargeAmount = Number(inv.chargeAmount ?? inv.total);
  const chargedInDifferentCurrency = chargeCurrency !== inv.currency;

  const handlePay = async () => {
    if (!cardRef.current) return;
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
      const res = await fetch(`/api/payments/charge/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: result.token, currency: chargeCurrency, billing }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || "Payment failed. Please try again.");
        return;
      }
      toast.success("Payment successful!");
      const paid = json.data;
      navigate(
        `/payment_success?invoice=${id}&amount=${encodeURIComponent(String(paid?.amount ?? ""))}&currency=${encodeURIComponent(paid?.currency || chargeCurrency)}&color=${encodeURIComponent(inv.color || "")}`,
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

      <div className="relative mx-auto grid w-full max-w-5xl items-start gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: PDF-style invoice */}
        <Card
          className="overflow-hidden border bg-white text-neutral-900"
          style={{ borderColor: rgba(accent, 0.55), boxShadow: `0 24px 60px -24px ${rgba(accent, 0.4)}` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 bg-[#171719] px-6 py-5 sm:px-10">
            <div>
              <div
                className="text-2xl font-bold tracking-tight"
                style={{
                  backgroundImage: `linear-gradient(180deg, ${shade(accent, 0.55)}, ${shade(accent, 0.05)})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {brand?.name || company.name}
              </div>
              <div className="mt-1 text-xs text-[#ffe9b8]">{brand?.address || company.address}</div>
              <div className="text-xs text-[#ffe9b8]">
                {[brand?.email || company.email, brand?.phone || company.phone].filter(Boolean).join("  |  ")}
              </div>
            </div>
            <div className="text-right">
              <div
                className="text-3xl font-bold uppercase tracking-tight"
                style={{
                  backgroundImage: `linear-gradient(180deg, ${shade(accent, 0.55)}, ${shade(accent, 0.05)})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Invoice
              </div>
              <div className="mt-1 text-sm font-medium text-[#ffe9b8]"># {inv.number}</div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">Bill to</div>
                <div className="font-semibold text-neutral-900">{inv.client?.name}</div>
                {inv.client?.email && <div className="mt-0.5 text-neutral-500">{inv.client.email}</div>}
                {inv.client?.phone && <div className="text-neutral-500">{inv.client.phone}</div>}
                {inv.client?.address && <div className="mt-0.5 whitespace-pre-line text-neutral-500">{inv.client.address}</div>}
              </div>
              <div className="space-y-1.5 text-right">
                <div className="flex justify-end gap-2">
                  <span className="text-neutral-400">Issue date:</span>
                  <span className="font-medium text-neutral-900">{formatDate(inv.issueDate)}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <span className="text-neutral-400">Due date:</span>
                  <span className="font-medium text-neutral-900">{formatDate(inv.dueDate)}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <span className="text-neutral-400">Status:</span>
                  <span className="font-medium text-neutral-900">{inv.status?.replace("_", " ")}</span>
                </div>
              </div>
            </div>

            <table className="mt-8 w-full text-sm">
              <thead>
                <tr className="border-y border-neutral-200 bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="py-2.5 text-left font-bold">Description</th>
                  <th className="py-2.5 text-right font-bold">Qty</th>
                  <th className="py-2.5 text-right font-bold">Unit Price</th>
                  <th className="py-2.5 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-neutral-200">
                    <td className="py-2.5 text-neutral-700">
                      <span className="richtext" dangerouslySetInnerHTML={{ __html: richText(item.description) }} />
                    </td>
                    <td className="py-2.5 text-right text-neutral-700">{item.quantity}</td>
                    <td className="py-2.5 text-right text-neutral-700">{money(item.unitPrice, inv.currency)}</td>
                    <td className="py-2.5 text-right font-medium text-neutral-900">{money(item.quantity * item.unitPrice, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 flex flex-col items-end gap-1.5 text-sm">
              <div className="flex w-64 justify-between">
                <span className="text-neutral-500">Subtotal</span>
                <span className="text-neutral-700">{money(inv.subtotal, inv.currency)}</span>
              </div>
              <div className="flex w-64 justify-between">
                <span className="text-neutral-500">Tax ({inv.taxRate}%)</span>
                <span className="text-neutral-700">{money(inv.taxAmount, inv.currency)}</span>
              </div>
              {Number(inv.discountAmount) > 0 && (
                <div className="flex w-64 justify-between">
                  <span className="text-neutral-500">Discount</span>
                  <span className="text-neutral-700">-{money(inv.discountAmount, inv.currency)}</span>
                </div>
              )}
              <div className="flex w-64 justify-between border-t border-neutral-300 pt-2 text-base font-bold text-neutral-900">
                <span>TOTAL</span>
                <span>{money(inv.total, inv.currency)}</span>
              </div>
            </div>

            {inv.notes && <p className="mt-6 text-sm text-neutral-500">Notes: {inv.notes}</p>}
          </div>

          <div className="bg-[#171719] px-6 py-4 sm:px-10">
            <p className="text-sm text-[#ffe9b8]">Thank you for your business. {company.name}</p>
            {company.website || company.email ? (
              <p className="mt-1 text-xs" style={{ color: shade(accent, 0.35) }}>
                {company.website}
                {company.website && company.email ? "  |  " : ""}
                {company.email}
              </p>
            ) : null}
          </div>
        </Card>

        {/* Right: card entry */}
        <Card
          className="sticky top-8 border bg-white/95 backdrop-blur-xl"
          style={{ borderColor: rgba(accent, 0.55), boxShadow: `0 24px 60px -24px ${rgba(accent, 0.5)}` }}
        >
          <CardContent>
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex size-16 items-center justify-center overflow-hidden rounded-xl"
                  style={{
                    background: `linear-gradient(180deg, ${shade(accent, 0.5)}, ${accent})`,
                    boxShadow: `inset 0 1px 0 ${rgba("#ffffff", 0.8)}`,
                    border: `1px solid ${shade(accent, -0.15)}`,
                  }}
                >
                  <Logo className="size-12" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight text-neutral-900">pay.myzonic.com</p>
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
                {chargedInDifferentCurrency && (
                  <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                    You will be charged {money(chargeAmount, chargeCurrency)} in {chargeCurrency}
                  </p>
                )}
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
                          className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-[#d9a520] placeholder:text-neutral-400"
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
                            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-[#d9a520] placeholder:text-neutral-400"
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
                              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-[#d9a520] placeholder:text-neutral-400"
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
                              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-[#d9a520] placeholder:text-neutral-400"
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
                            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-[#d9a520] placeholder:text-neutral-400"
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
                      disabled={!ready || busy}
                      onClick={handlePay}
                      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white outline-none transition-all hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      style={{
                        background: `linear-gradient(180deg, ${shade(accent, 0.2)}, ${shade(accent, -0.05)} 45%, ${shade(accent, -0.25)})`,
                        boxShadow: `0 8px 20px -6px ${rgba(accent, 0.6)}, inset 0 1px 0 ${rgba("#ffffff", 0.35)}`,
                      }}
                    >
                      <CreditCard className="size-5" /> Pay {money(chargeAmount, chargeCurrency)} <ArrowRight className="size-4" />
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
