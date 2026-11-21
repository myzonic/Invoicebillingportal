import type { InvoiceDesign } from "@/types";
import { mixHex, tint } from "@/lib/invoiceDesign";
import { tones, type PreviewItem } from "@/components/invoiceDesign/InvoiceDesignPreview";
import { formatDate, money, rgba, richText, shade, statusLabel } from "@/lib/utils";
import { ArrowRight, FileText, Lock } from "lucide-react";
import Logo from "@/components/Logo";
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
 * Client-facing invoice sheet for brands with a saved design. Mirrors the A4
 * PDF renderer (same layout rules, colours and structure) so the web page and
 * the download always agree.
 */
export function DesignedInvoiceView({ data, design, pdfUrl, onPay, paid }: Props) {
  const t = tones(design);
  const brand = data.brand;
  const company = data.company;
  const businessName = brand?.businessName || brand?.name || company?.name || branding.defaultBrandName;
  const contactLine = [brand?.email || company?.email, brand?.phone || company?.phone, brand?.website || company?.website]
    .filter(Boolean)
    .join("  ·  ");
  const addressLines = (brand?.address || company?.address || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const headerLines = (brand?.pdfHeader || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const footerText = brand?.pdfFooter?.trim() || `Thank you for your business. ${businessName}`;
  const totalPanelBg = t.headerDark ? t.primary : mixHex(t.accent, "#ffffff", 0.86);
  const totalPanelText = t.headerDark ? "#ffffff" : t.primary;
  const status = statusLabel(data.paymentState || data.status);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ background: `linear-gradient(135deg, ${tint(t.supporting, 0.96)} 0%, ${tint(t.supporting, 0.88)} 55%, ${tint(t.accent, 0.9)} 100%)` }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse_at_top_right,${rgba(t.accent, 0.16)},transparent 55%),radial-gradient(ellipse_at_bottom_left,${rgba(t.primary, 0.1)},transparent 55%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage: `linear-gradient(to_right,${rgba(t.primary, 0.05)} 1px,transparent 1px),linear-gradient(to_bottom,${rgba(t.primary, 0.05)} 1px,transparent 1px)`,
          backgroundSize: "44px 44px",
        }}
      />

      <div
        className="relative w-full max-w-[820px] overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{ borderColor: mixHex(t.primary, "#ffffff", 0.8), boxShadow: `0 30px 70px -28px ${rgba(t.primary, 0.45)}` }}
      >
        {/* ---------------- Header ---------------- */}
        {t.headerDark ? (
          <div className="px-7 py-6" style={{ background: t.primary, borderTop: `3px solid ${t.accent}`, borderBottom: `3px solid ${mixHex(t.secondary, t.primary, 0.35)}` }}>
            <SheetHeader t={t} businessName={businessName} number={data.number} logoUrl={brand?.logoUrl} contactLine={contactLine} addressLines={addressLines} headerLines={headerLines} dark />
          </div>
        ) : design.layout === "creative" ? (
          <div className="relative px-7 py-6" style={{ borderTop: `4px solid ${t.accent}` }}>
            <div className="absolute inset-y-0 left-0" style={{ width: "44%", background: mixHex(t.accent, t.supporting, 0.35) }} />
            <div className="relative">
              <SheetHeader t={t} businessName={businessName} number={data.number} logoUrl={brand?.logoUrl} contactLine={contactLine} addressLines={addressLines} headerLines={headerLines} block />
            </div>
          </div>
        ) : design.layout === "minimal" ? (
          <div className="px-7 pb-4 pt-6">
            <SheetHeader t={t} businessName={businessName} number={data.number} logoUrl={brand?.logoUrl} contactLine={contactLine} addressLines={addressLines} headerLines={headerLines} rule />
          </div>
        ) : (
          <div className="px-7 pb-4 pt-6" style={{ borderTop: `4px solid ${t.primary}`, borderBottom: `1px solid ${t.line}` }}>
            <SheetHeader t={t} businessName={businessName} number={data.number} logoUrl={brand?.logoUrl} contactLine={contactLine} addressLines={addressLines} headerLines={headerLines} />
          </div>
        )}

        {/* ---------------- Bill to / details ---------------- */}
        <div className="grid gap-6 px-7 pt-5 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: t.secondary }}>
              Bill to
            </div>
            <div className="mt-1 text-base font-semibold" style={{ color: t.ink }}>
              {data.client?.name || "—"}
            </div>
            {data.client?.email && <div className="mt-0.5 text-xs" style={{ color: t.muted }}>{data.client.email}</div>}
            {data.client?.address && (
              <div className="mt-0.5 whitespace-pre-line text-xs" style={{ color: t.muted }}>
                {data.client.address}
              </div>
            )}
          </div>
          <div className="sm:text-right">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: t.secondary }}>
              Invoice details
            </div>
            <dl className="mt-1 space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="uppercase tracking-wide" style={{ color: t.muted, fontSize: 10, fontWeight: 700 }}>
                  Issue date
                </dt>
                <dd className="font-medium" style={{ color: t.ink }}>
                  {formatDate(data.issueDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="uppercase tracking-wide" style={{ color: t.muted, fontSize: 10, fontWeight: 700 }}>
                  Due date
                </dt>
                <dd className="font-medium" style={{ color: t.ink }}>
                  {formatDate(data.dueDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="uppercase tracking-wide" style={{ color: t.muted, fontSize: 10, fontWeight: 700 }}>
                  Status
                </dt>
                <dd className="font-medium" style={{ color: t.ink }}>
                  {status}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="uppercase tracking-wide" style={{ color: t.muted, fontSize: 10, fontWeight: 700 }}>
                  Currency
                </dt>
                <dd className="font-medium" style={{ color: t.ink }}>
                  {data.currency}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* ---------------- Items ---------------- */}
        <div className="mt-6 px-7">
          <div
            className="grid gap-3 rounded-t-lg px-4 py-3"
            style={{
              gridTemplateColumns: "1fr 56px 96px",
              background: t.minimal ? "transparent" : mixHex(t.supporting, t.primary, 0.08),
              borderTop: `1px solid ${t.line}`,
              borderBottom: `1px solid ${t.line}`,
            }}
          >
            {["Description", "Qty", "Amount"].map((h, i) => (
              <div
                key={h}
                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: t.primary, textAlign: i === 0 ? "left" : "right" }}
              >
                {h}
              </div>
            ))}
          </div>
          {data.items.length === 0 && (
            <div className="px-4 py-4 text-sm" style={{ color: t.muted, borderBottom: `1px solid ${t.line}` }}>
              No line items.
            </div>
          )}
          {data.items.map((item, i) => (
            <div
              key={i}
              className="grid items-start gap-3 px-4 py-3"
              style={{
                gridTemplateColumns: "1fr 56px 96px",
                borderBottom: `1px solid ${t.line}`,
                background: !t.minimal && i % 2 === 1 ? t.softFill : "transparent",
              }}
            >
              <div className="richtext text-sm" style={{ color: t.ink }} dangerouslySetInnerHTML={{ __html: richText(item.description) }} />
              <div className="text-right text-sm" style={{ color: t.ink }}>
                {item.quantity}
              </div>
              <div className="text-right text-sm font-semibold" style={{ color: t.ink }}>
                {money(item.quantity * item.unitPrice - Number(item.discount || 0), data.currency)}
              </div>
            </div>
          ))}
        </div>

        {/* ---------------- Totals + notes ---------------- */}
        <div className="grid items-start gap-6 px-7 py-5 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: t.secondary }}>
              Notes
            </div>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed" style={{ color: t.muted }}>
              {data.notes?.trim() || "Payment is due by the due date shown above."}
            </p>
            {data.builderData?.paymentInstructions && (
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed" style={{ color: t.muted }}>
                <span className="font-semibold" style={{ color: t.secondary }}>Payment instructions: </span>
                {data.builderData.paymentInstructions}
              </p>
            )}
            {data.builderData?.paymentTerms && (
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed" style={{ color: t.muted }}>
                <span className="font-semibold" style={{ color: t.secondary }}>Payment terms: </span>
                {data.builderData.paymentTerms}
              </p>
            )}
            {data.builderData?.terms && (
              <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed" style={{ color: t.muted }}>
                {data.builderData.terms}
              </p>
            )}
          </div>
          <div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span style={{ color: t.muted }}>Subtotal</span>
                <span style={{ color: t.ink }}>{money(data.subtotal, data.currency)}</span>
              </div>
              {Number(data.taxAmount) > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: t.muted }}>Tax{data.taxRate ? ` (${data.taxRate}%)` : ""}</span>
                  <span style={{ color: t.ink }}>{money(data.taxAmount, data.currency)}</span>
                </div>
              )}
              {Number(data.discountAmount) > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: t.muted }}>Discount</span>
                  <span style={{ color: t.ink }}>- {money(data.discountAmount, data.currency)}</span>
                </div>
              )}
              {Number(data.builderData?.shipping || 0) > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: t.muted }}>Shipping</span>
                  <span style={{ color: t.ink }}>{money(data.builderData?.shipping || 0, data.currency)}</span>
                </div>
              )}
            </div>
            <div
              className="mt-2 flex items-center justify-between rounded-lg px-4 py-3"
              style={{ background: totalPanelBg, color: totalPanelText }}
            >
              <span className="text-xs font-bold uppercase tracking-[0.1em]">Total due</span>
              <span className="text-xl font-extrabold tracking-tight">{money(data.total, data.currency)}</span>
            </div>
          </div>
        </div>

        {/* ---------------- Footer ---------------- */}
        {t.headerDark ? (
          <div className="flex items-end justify-between px-7 py-4" style={{ background: t.primary, borderTop: `3px solid ${mixHex(t.secondary, t.primary, 0.35)}` }}>
            <div>
              <div className="text-xs" style={{ color: t.onDark }}>
                {footerText}
              </div>
              {contactLine && <div className="mt-0.5 text-[11px]" style={{ color: t.onDarkMuted }}>{contactLine}</div>}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.darkAccent }}>
              {businessName}
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-between px-7 pb-4 pt-3" style={{ borderTop: `1px solid ${t.line}` }}>
            <div>
              <div className="text-xs" style={{ color: t.ink }}>
                {footerText}
              </div>
              {contactLine && <div className="mt-0.5 text-[11px]" style={{ color: t.muted }}>{contactLine}</div>}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.secondary }}>
              {businessName}
            </div>
          </div>
        )}
        <div style={{ height: 4, background: t.accent }} />

        {/* ---------------- Actions ---------------- */}
        <div className="space-y-3 px-7 py-5">
          {paid ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-700">
              This invoice has been paid. Thank you!
            </div>
          ) : (
            <button
              type="button"
              onClick={onPay}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white outline-none transition-all hover:brightness-105 active:scale-[0.99]"
              style={{
                background: `linear-gradient(180deg, ${shade(t.primary, 0.18)}, ${shade(t.primary, -0.12)})`,
                boxShadow: `0 10px 24px -8px ${rgba(t.primary, 0.55)}, inset 0 1px 0 ${rgba("#ffffff", 0.3)}`,
              }}
            >
              <Lock className="size-4" /> Pay now <ArrowRight className="size-4" />
            </button>
          )}
          <a
            href={pdfUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium transition-colors hover:brightness-[0.99]"
            style={{ borderColor: mixHex(t.primary, "#ffffff", 0.7), color: t.ink, background: mixHex(t.supporting, "#ffffff", 0.4) }}
          >
            <FileText className="size-4" style={{ color: t.secondary }} /> Download invoice PDF
          </a>
        </div>
      </div>
    </div>
  );
}

function SheetHeader({
  t,
  businessName,
  number,
  logoUrl,
  contactLine,
  addressLines,
  headerLines,
  dark,
  block,
  rule,
}: {
  t: ReturnType<typeof tones>;
  businessName: string;
  number: string;
  logoUrl?: string | null;
  contactLine: string;
  addressLines: string[];
  headerLines: string[];
  dark?: boolean;
  block?: boolean;
  rule?: boolean;
}) {
  const onDark = dark || block;
  return (
    <div className="relative flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden"
          style={{
            width: 64,
            height: 48,
            borderRadius: 7,
            background: onDark ? "#ffffff" : t.softFill,
            border: `1px solid ${onDark ? (block ? t.accent : t.secondary) : t.line}`,
            padding: 6,
          }}
        >
          <Logo src={logoUrl} alt={businessName} className="max-h-full max-w-full" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-bold" style={{ color: onDark ? "#ffffff" : t.primary }}>
            {businessName}
          </div>
          {contactLine && (
            <div className="truncate text-xs" style={{ color: onDark ? t.onDarkMuted : t.muted }}>
              {contactLine}
            </div>
          )}
          {addressLines.slice(0, 2).map((line, i) => (
            <div key={i} className="truncate text-xs" style={{ color: onDark ? t.onDarkMuted : t.muted }}>
              {line}
            </div>
          ))}
          {headerLines.slice(0, 2).map((line, i) => (
            <div key={i} className="truncate text-xs font-medium" style={{ color: onDark ? t.onDarkMuted : shade(t.secondary, -0.1) }}>
              {line}
            </div>
          ))}
          {rule && <div className="mt-2" style={{ height: 2, width: 52, background: t.accent }} />}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-2xl font-extrabold uppercase leading-none tracking-[0.06em]" style={{ color: onDark ? t.darkAccent : t.secondary }}>
          Invoice
        </div>
        <div className="mt-1 text-xs font-semibold" style={{ color: onDark ? t.onDarkMuted : t.muted }}>
          # {number}
        </div>
      </div>
    </div>
  );
}
