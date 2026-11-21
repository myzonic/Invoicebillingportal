import { useEffect, useRef, useState } from "react";
import type { InvoiceDesign, InvoiceLayout } from "@/types";
import { mixHex } from "@/lib/invoiceDesign";
import { cn, money, richText, sanitizeHtml, statusLabel } from "@/lib/utils";
import Logo from "@/components/Logo";

export interface PreviewItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

/** Fields that can be edited by clicking directly on the invoice preview. */
export type EditablePreviewField =
  | "businessName"
  | "clientName"
  | "customerEmail"
  | "customerAddress"
  | "invoiceNumber"
  | "issueDate"
  | "dueDate"
  | "notes"
  | "paymentInstructions"
  | "terms"
  | "taxRate"
  | "discountAmount"
  | "shipping";

export interface InvoicePreviewEditor {
  onField: (field: EditablePreviewField, value: string) => void;
  onItem: (index: number, field: "description" | "quantity" | "unitPrice" | "discount", value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
}

/** A single click-to-edit text node inside the invoice document. */
export function EditableText({
  value,
  onCommit,
  multiline,
  type = "text",
  className,
  style,
  placeholder = "Click to edit",
}: {
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  type?: string;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  if (editing) {
    const shared = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
        if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
      },
      className: "w-full rounded border border-primary bg-white px-1.5 py-0.5 text-inherit outline-none ring-2 ring-primary/20",
      style: { ...style, color: "#111827" },
    };
    return multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type={type} />;
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
      className={cn("cursor-text rounded-sm px-0.5 -mx-0.5 transition-colors hover:bg-primary/10 hover:ring-1 hover:ring-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}
      style={style}
    >
      {value || <span className="opacity-60">{placeholder}</span>}
    </span>
  );
}

/** Rich-text item description edited in place, preserving formatting. */
export function EditableRichText({
  html,
  onCommit,
  className,
  style,
}: {
  html: string;
  onCommit: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (ref.current && !editing) ref.current.innerHTML = html; }, [html, editing]);

  return (
    <div
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      role="button"
      tabIndex={0}
      title="Click to edit description"
      onClick={() => { setEditing(true); ref.current?.focus(); }}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && editing) { e.preventDefault(); ref.current?.blur(); } }}
      onBlur={() => {
        setEditing(false);
        const next = sanitizeHtml(ref.current?.innerHTML || "");
        if (next !== html) onCommit(next);
      }}
      className={cn(
        "rounded-sm px-0.5 -mx-0.5 transition-colors focus:outline-none",
        editing ? "bg-white ring-2 ring-primary/40" : "cursor-text hover:bg-primary/10 hover:ring-1 hover:ring-primary/30",
        className,
      )}
      style={style}
    />
  );
}

interface PreviewProps {
  design: InvoiceDesign;
  logoUrl?: string | null;
  businessName?: string;
  clientName?: string;
  invoiceNumber?: string;
  items?: PreviewItem[];
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  notes?: string;
  contactLine?: string;
  brandAddress?: string;
  brandHeader?: string;
  footerText?: string;
  className?: string;
  /** Real values supplied by the builder make the preview match the PDF. */
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  shipping?: number;
  customerEmail?: string;
  customerAddress?: string;
  paymentInstructions?: string;
  terms?: string;
  /** When provided, the document itself becomes click-to-edit. */
  editor?: InvoicePreviewEditor;
}

const DEFAULT_ITEMS: PreviewItem[] = [
  { description: "Brand identity & logo system", quantity: 1, unitPrice: 1250 },
  { description: "Website design — 5 pages", quantity: 5, unitPrice: 340 },
  { description: "Monthly care plan", quantity: 1, unitPrice: 180 },
];

/** Palette-derived tones shared by the HTML preview and the PDF renderer. */
export function tones(design: InvoiceDesign) {
  const { primary, secondary, accent, supporting } = design.colors;
  const headerDark = design.layout === "corporate" || design.layout === "premium";
  const minimal = design.layout === "minimal";
  return {
    primary,
    secondary,
    accent,
    supporting,
    headerDark,
    minimal,
    compact: design.layout === "compact",
    ink: "#171c26",
    muted: "#5b6472",
    line: mixHex(primary, "#ffffff", 0.86),
    softFill: mixHex(supporting, "#ffffff", 0.55),
    onDark: "#ffffff",
    onDarkMuted: mixHex("#ffffff", primary, 0.72),
    darkAccent: mixHex(accent, "#ffffff", 0.35),
  };
}

/* ------------------------------------------------------------------ */
/* Full invoice preview (same structure as the A4 PDF)                 */
/* ------------------------------------------------------------------ */

export function InvoiceDesignPreview({
  design,
  logoUrl,
  businessName = "Acme Studio",
  clientName = "Jordan Bennett",
  invoiceNumber = "INV-1042",
  items = DEFAULT_ITEMS,
  currency = "USD",
  issueDate = "Nov 1, 2026",
  dueDate = "Nov 15, 2026",
  status = "SENT",
  notes = "Payment is due within 14 days. Late payments may incur a 2% monthly fee.",
  contactLine = "hello@acmestudio.com  ·  +1 (555) 010 2233  ·  acmestudio.com",
  brandAddress,
  brandHeader,
  footerText = "Thank you for your business.",
  subtotal,
  taxRate = 0,
  taxAmount,
  discountAmount = 0,
  totalAmount,
  shipping = 0,
  customerEmail,
  customerAddress,
  paymentInstructions,
  terms,
  editor,
  className = "",
}: PreviewProps) {
  const onField = (field: EditablePreviewField, value: string) => editor?.onField(field, value);
  const edit = (value: string, field: EditablePreviewField, style?: React.CSSProperties, multiline?: boolean, type?: string) =>
    editor ? (
      <EditableText value={value} onCommit={(v) => onField(field, v)} style={style} multiline={multiline} type={type} />
    ) : (
      <span style={style}>{value}</span>
    );
  const t = tones(design);
  const layout = design.layout;
  const calcSubtotal = subtotal ?? items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  const calcTax = taxAmount ?? calcSubtotal * 0.1;
  const calcTotal = totalAmount ?? Math.max(0, calcSubtotal + calcTax - Number(discountAmount) + Number(shipping));
  const totalPanelBg = t.headerDark ? t.primary : mixHex(t.accent, "#ffffff", 0.86);
  const totalPanelText = t.headerDark ? "#ffffff" : t.primary;

  const labelStyle: React.CSSProperties = {
    fontSize: 8,
    letterSpacing: "0.12em",
    fontWeight: 700,
    textTransform: "uppercase",
    color: t.secondary,
  };

  if (layout === "legacy") return <LegacyInvoicePreview className={className} logoUrl={logoUrl} businessName={businessName} items={items} currency={currency} />;

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white text-left shadow-sm ${className}`}
      style={{ borderColor: t.line, color: t.ink, fontSize: 11 }}
    >
      {/* ---------------- Header ---------------- */}
      <div className="relative">
        {layout === "corporate" || layout === "premium" ? (
          <div className="px-5 py-4" style={{ background: t.primary, borderTop: `3px solid ${t.accent}`, borderBottom: `3px solid ${mixHex(t.secondary, t.primary, 0.35)}` }}>
            <HeaderContent t={t} businessName={businessName} invoiceNumber={invoiceNumber} logoUrl={logoUrl} contactLine={contactLine} brandAddress={brandAddress} brandHeader={brandHeader} editor={editor} dark />
          </div>
        ) : layout === "creative" ? (
          <div className="relative px-5 py-4" style={{ borderTop: `4px solid ${t.accent}` }}>
            <div className="absolute inset-y-0 left-0" style={{ width: "44%", background: mixHex(t.accent, t.supporting, 0.35) }} />
            <div className="relative">
              <HeaderContent t={t} businessName={businessName} invoiceNumber={invoiceNumber} logoUrl={logoUrl} contactLine={contactLine} brandAddress={brandAddress} brandHeader={brandHeader} editor={editor} block />
            </div>
          </div>
        ) : layout === "minimal" ? (
          <div className="px-5 pt-5 pb-3">
            <HeaderContent t={t} businessName={businessName} invoiceNumber={invoiceNumber} logoUrl={logoUrl} contactLine={contactLine} brandAddress={brandAddress} brandHeader={brandHeader} editor={editor} rule />
          </div>
        ) : (
          <div className="px-5 pt-5 pb-3" style={{ borderTop: `4px solid ${t.primary}`, borderBottom: `1px solid ${t.line}` }}>
            <HeaderContent t={t} businessName={businessName} invoiceNumber={invoiceNumber} logoUrl={logoUrl} contactLine={contactLine} brandAddress={brandAddress} brandHeader={brandHeader} editor={editor} />
          </div>
        )}
      </div>

      {/* ---------------- Bill to / details ---------------- */}
      <div className="grid grid-cols-2 gap-4 px-5 pt-4">
        <div>
          <div style={labelStyle}>Bill to</div>
          <div className="mt-1 font-semibold" style={{ fontSize: 13, color: t.ink }}>
            {edit(clientName, "clientName")}
          </div>
          <div className="mt-0.5" style={{ color: t.muted, fontSize: 10 }}>
            {edit(customerEmail || "customer@example.com", "customerEmail")}
          </div>
          <div className="whitespace-pre-line" style={{ color: t.muted, fontSize: 10 }}>
            {edit(customerAddress || "Address", "customerAddress", undefined, true)}
          </div>
        </div>
        <div>
          <div className="text-right" style={labelStyle}>
            Invoice details
          </div>
          <dl className="mt-1 space-y-1">
            {[
              ["Issue date", issueDate],
              ["Due date", dueDate],
              ["Status", statusLabel(status)],
              ["Currency", currency],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3" style={{ fontSize: 10 }}>
                <dt className="uppercase" style={{ letterSpacing: "0.08em", fontSize: 8, fontWeight: 700, color: t.muted, paddingTop: 1 }}>
                  {k}
                </dt>
                <dd style={{ color: t.ink, fontWeight: 600 }}>
                  {editor && k === "Issue date" ? (
                    <EditableText value={issueDate} onCommit={(v) => onField("issueDate", v)} style={{ color: "inherit" }} />
                  ) : editor && k === "Due date" ? (
                    <EditableText value={dueDate} onCommit={(v) => onField("dueDate", v)} style={{ color: "inherit" }} />
                  ) : (
                    v
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* ---------------- Items ---------------- */}
      <div className="mt-4 px-5">
        <div
          className="grid gap-2 px-3 py-2"
          style={{
            gridTemplateColumns: "1fr 44px 78px 78px",
            background: t.minimal ? "transparent" : mixHex(t.supporting, t.primary, 0.08),
            borderTop: `1px solid ${t.line}`,
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          {["Description", "Qty", "Unit price", "Amount"].map((h, i) => (
            <div
              key={h}
              className="uppercase"
              style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: t.primary,
                textAlign: i === 0 ? "left" : "right",
              }}
            >
              {h}
            </div>
          ))}
        </div>
        {items.map((item, i) => (
          <div
            key={i}
            className="group grid gap-2 px-3 py-2"
            style={{
              gridTemplateColumns: "1fr 44px 78px 78px",
              borderBottom: `1px solid ${t.line}`,
              background: !t.minimal && i % 2 === 1 ? t.softFill : "transparent",
            }}
          >
            <div className="richtext" style={{ fontSize: 10, color: t.ink }}>
              {editor ? (
                <EditableRichText html={item.description} onCommit={(v) => editor.onItem(i, "description", v)} />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: richText(item.description) }} />
              )}
              {editor && (
                <span className="mt-0.5 block text-[8px]" style={{ color: t.muted }}>
                  Disc: <EditableText value={String(item.discount || 0)} onCommit={(v) => editor.onItem(i, "discount", v)} type="number" />
                </span>
              )}
            </div>
            <div className="text-right" style={{ fontSize: 10, color: t.ink }}>
              {editor ? <EditableText value={String(item.quantity)} onCommit={(v) => editor.onItem(i, "quantity", v)} type="number" /> : item.quantity}
            </div>
            <div className="text-right" style={{ fontSize: 10, color: t.ink }}>
              {editor ? (
                <EditableText value={String(item.unitPrice)} onCommit={(v) => editor.onItem(i, "unitPrice", v)} type="number" />
              ) : (
                money(item.unitPrice, currency)
              )}
            </div>
            <div className="text-right" style={{ fontSize: 10, fontWeight: 600, color: t.ink }}>
              <span title="Calculated automatically">{money(item.quantity * item.unitPrice - Number(item.discount || 0), currency)}</span>
              {editor && (
                <button
                  type="button"
                  onClick={() => editor.onRemoveItem(i)}
                  title="Remove item"
                  className="ml-1 rounded px-1 text-[9px] text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
        {editor && (
          <button
            type="button"
            onClick={editor.onAddItem}
            className="flex w-full items-center justify-center gap-1 border-b border-dashed py-1.5 text-[9px] font-semibold transition-colors hover:bg-primary/5"
            style={{ borderColor: t.line, color: t.secondary }}
          >
            + Add item
          </button>
        )}
      </div>

      {/* ---------------- Totals + notes ---------------- */}
      <div className="grid grid-cols-2 gap-4 px-5 pt-4 pb-4">
        <div>
          <div style={labelStyle}>Notes</div>
          <p className="mt-1 max-w-[240px]" style={{ fontSize: 9.5, color: t.muted, lineHeight: 1.5 }}>
            {edit(notes, "notes", undefined, true)}
          </p>
          {paymentInstructions && (
            <p className="mt-1 max-w-[240px] whitespace-pre-line" style={{ fontSize: 9, color: t.muted }}>
              <span style={{ fontWeight: 700, color: t.secondary }}>Payment instructions: </span>
              {edit(paymentInstructions, "paymentInstructions", undefined, true)}
            </p>
          )}
          {terms && (
            <p className="mt-1 max-w-[240px] whitespace-pre-line" style={{ fontSize: 8.5, color: t.muted }}>
              {edit(terms, "terms", undefined, true)}
            </p>
          )}
        </div>
        <div>
          <div className="space-y-1 pb-2" style={{ fontSize: 10 }}>
            <div className="flex justify-between">
              <span style={{ color: t.muted }}>Subtotal</span>
              <span style={{ color: t.ink }}>{money(calcSubtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: t.muted }}>
                {editor ? (
                  <>
                    Tax (<EditableText value={String(taxRate)} type="number" onCommit={(v) => onField("taxRate", v)} />)%
                  </>
                ) : (
                  `Tax${Number(taxRate) ? ` (${taxRate}%)` : ""}`
                )}
              </span>
              <span style={{ color: t.ink }}>{money(calcTax, currency)}</span>
            </div>
            {(editor || Number(discountAmount) > 0) && (
              <div className="flex justify-between">
                <span style={{ color: t.muted }}>Discount</span>
                <span style={{ color: t.ink }}>
                  {editor ? (
                    <EditableText value={String(discountAmount)} type="number" onCommit={(v) => onField("discountAmount", v)} />
                  ) : (
                    `- ${money(discountAmount, currency)}`
                  )}
                </span>
              </div>
            )}
            {(editor || Number(shipping) > 0) && (
              <div className="flex justify-between">
                <span style={{ color: t.muted }}>Shipping</span>
                <span style={{ color: t.ink }}>
                  {editor ? (
                    <EditableText value={String(shipping)} type="number" onCommit={(v) => onField("shipping", v)} />
                  ) : (
                    money(shipping, currency)
                  )}
                </span>
              </div>
            )}
          </div>
          <div
            className="flex items-center justify-between px-3 py-2.5"
            style={{
              background: totalPanelBg,
              color: totalPanelText,
              borderRadius: layout === "minimal" ? 4 : 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{money(calcTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* ---------------- Footer ---------------- */}
      {t.headerDark ? (
        <div className="flex items-end justify-between px-5 py-3" style={{ background: t.primary, borderTop: `3px solid ${mixHex(t.secondary, t.primary, 0.35)}` }}>
          <div>
            <div style={{ fontSize: 9.5, color: t.onDark }}>{footerText}</div>
            <div style={{ fontSize: 8.5, color: t.onDarkMuted }}>{contactLine}</div>
          </div>
          <div className="font-bold uppercase" style={{ fontSize: 8.5, letterSpacing: "0.14em", color: t.darkAccent }}>
            {edit(businessName, "businessName")}
          </div>
        </div>
      ) : (
        <div className="flex items-end justify-between px-5 pb-3 pt-2" style={{ borderTop: `1px solid ${t.line}` }}>
          <div>
            <div style={{ fontSize: 9.5, color: t.ink }}>{footerText}</div>
            <div style={{ fontSize: 8.5, color: t.muted }}>{contactLine}</div>
          </div>
          <div className="font-bold uppercase" style={{ fontSize: 8.5, letterSpacing: "0.14em", color: t.secondary }}>
            {edit(businessName, "businessName")}
          </div>
        </div>
      )}
      <div style={{ height: 3, background: t.accent }} />
    </div>
  );
}

function HeaderContent({
  t,
  businessName,
  invoiceNumber,
  logoUrl,
  contactLine,
  brandAddress,
  brandHeader,
  editor,
  dark,
  block,
  rule,
}: {
  t: ReturnType<typeof tones>;
  businessName: string;
  invoiceNumber: string;
  logoUrl?: string | null;
  contactLine: string;
  brandAddress?: string;
  brandHeader?: string;
  editor?: InvoicePreviewEditor;
  dark?: boolean;
  block?: boolean;
  rule?: boolean;
}) {
  const onDark = dark || block;
  return (
    <div className="relative flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-[42px] w-[84px] shrink-0 items-center justify-center">
          <Logo src={logoUrl} alt={businessName} className="max-h-full max-w-full object-contain" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold" style={{ fontSize: 13, color: onDark ? "#ffffff" : t.primary }}>
            {editor ? (
              <EditableText value={businessName} onCommit={(v) => editor.onField("businessName", v)} style={{ color: "inherit" }} />
            ) : businessName}
          </div>
          <div className="truncate" style={{ fontSize: 9, color: onDark ? t.onDarkMuted : t.muted }}>
            {contactLine}
          </div>
          {brandAddress && (
            <div className="truncate" style={{ fontSize: 8.5, color: onDark ? t.onDarkMuted : t.muted }}>
              {brandAddress.replace(/\n/g, " · ")}
            </div>
          )}
          {(brandHeader || "").split("\n").map((line, i) => line.trim() && (
            <div key={i} className="truncate font-medium" style={{ fontSize: 8.5, color: onDark ? t.onDarkMuted : t.secondary }}>
              {line.trim()}
            </div>
          ))}
          {rule && <div className="mt-1.5" style={{ height: 2, width: 44, background: t.accent }} />}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-extrabold uppercase" style={{ fontSize: 22, lineHeight: 1, letterSpacing: "0.06em", color: onDark ? t.darkAccent : t.secondary }}>
          Invoice
        </div>
        <div className="mt-1 font-semibold" style={{ fontSize: 10, color: onDark ? t.onDarkMuted : t.muted }}>
          # {editor ? (
            <EditableText value={invoiceNumber} onCommit={(v) => editor.onField("invoiceNumber", v)} style={{ color: "inherit" }} />
          ) : invoiceNumber}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Classic (legacy black & gold) preview — the pre-redesign look       */
/* ------------------------------------------------------------------ */

function LegacyInvoicePreview({
  className = "",
  logoUrl,
  businessName,
  items,
  currency,
}: {
  className?: string;
  logoUrl?: string | null;
  businessName: string;
  items: PreviewItem[];
  currency: string;
}) {
  const gold = "#c9a227";
  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  return (
    <div className={`overflow-hidden rounded-lg border border-neutral-800 bg-white text-left shadow-sm ${className}`} style={{ fontSize: 11 }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ background: "#111111" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[84px] items-center justify-center">
            <Logo src={logoUrl} alt={businessName} className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <div className="font-bold" style={{ color: "#ffffff", fontSize: 13 }}>
              {businessName}
            </div>
            <div style={{ color: "#9ca3af", fontSize: 9 }}>hello@example.com</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-extrabold uppercase" style={{ color: gold, fontSize: 20, letterSpacing: "0.08em" }}>
            Invoice
          </div>
          <div style={{ color: "#d1d5db", fontSize: 10 }}># INV-1042</div>
        </div>
      </div>
      <div className="px-5 py-4">
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: gold }}>Bill to</div>
        <div className="font-semibold" style={{ fontSize: 13 }}>
          Jordan Bennett
        </div>
        <div className="mt-3" style={{ borderTop: "1px solid #e5e7eb" }} />
        <div className="grid grid-cols-[1fr_78px_78px] gap-2 px-2 py-2" style={{ background: "#111111", color: "#ffffff", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Amount</span>
        </div>
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-[1fr_78px_78px] gap-2 px-2 py-2" style={{ borderBottom: "1px solid #f3f4f6", fontSize: 10 }}>
            <span>{item.description}</span>
            <span className="text-right">{item.quantity}</span>
            <span className="text-right">{money(item.quantity * item.unitPrice, currency)}</span>
          </div>
        ))}
        <div className="mt-3 flex justify-end">
          <div className="flex items-center justify-between px-3 py-2" style={{ minWidth: 220, background: "#111111", color: "#ffffff" }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: gold }}>{money(subtotal * 1.1, currency)}</span>
          </div>
        </div>
      </div>
      <div className="px-5 py-3" style={{ borderTop: `2px solid ${gold}`, background: "#111111" }}>
        <div style={{ fontSize: 9, color: "#e5e7eb" }}>Thank you for your business.</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small structural thumbnail used by the layout picker                */
/* ------------------------------------------------------------------ */

export function InvoiceLayoutThumb({ layout, colors }: { layout: InvoiceLayout; colors: InvoiceDesign["colors"] }) {
  const design: InvoiceDesign = { layout, colors };
  const t = tones(design);
  const bar = (w: string, h: number, c: string, mt = 0) => (
    <div key={`${w}-${h}-${c}-${mt}`} style={{ width: w, height: h, background: c, marginTop: mt, borderRadius: 2 }} />
  );

  if (layout === "legacy") {
    return (
      <div className="flex h-full flex-col gap-1.5 p-2">
        <div className="flex items-center gap-1.5 rounded-sm px-1.5 py-1.5" style={{ background: "#111111" }}>
          <div style={{ width: 14, height: 10, background: "#ffffff" }} />
          {bar("38%", 4, "#ffffff")}
          {bar("16%", 6, "#c9a227")}
        </div>
        {bar("55%", 4, "#d1d5db")}
        <div style={{ height: 6, background: "#111111", borderRadius: 2 }} />
        {bar("100%", 5, "#f3f4f6")}
        {bar("86%", 5, "#f3f4f6", 1)}
        {bar("94%", 5, "#f3f4f6", 1)}
        <div className="mt-auto flex justify-end">
          <div style={{ width: "62%", height: 12, background: "#111111", borderRadius: 2 }} />
        </div>
        <div style={{ height: 5, background: "#c9a227" }} />
      </div>
    );
  }

  const dark = t.headerDark;
  const headerBg = dark ? t.primary : "transparent";
  const logoBg = dark ? "#ffffff" : t.softFill;
  const totalBg = dark ? t.primary : mixHex(t.accent, "#ffffff", 0.86);

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div
        className="relative flex items-center gap-1.5 rounded-sm px-1.5 py-1.5"
        style={{
          background: headerBg,
          borderTop: layout === "creative" ? `2px solid ${t.accent}` : layout === "modern" || layout === "elegant" ? `2px solid ${t.primary}` : "none",
          borderBottom: !dark && layout !== "minimal" ? `1px solid ${t.line}` : "none",
        }}
      >
        {layout === "creative" && (
          <div className="absolute inset-y-0 left-0" style={{ width: "46%", background: mixHex(t.accent, t.supporting, 0.35) }} />
        )}
        <div className="relative flex items-center gap-1.5">
          <div style={{ width: 15, height: 11, background: logoBg, border: `1px solid ${dark ? t.secondary : t.line}`, borderRadius: 2 }} />
          {bar("34%", 4, dark ? "#ffffff" : t.primary)}
        </div>
        <div className="relative ml-auto">{bar("18%", 7, dark ? t.darkAccent : t.secondary)}</div>
        {layout === "minimal" && <div className="absolute inset-x-1.5 bottom-0" style={{ height: 1, background: t.line }} />}
      </div>

      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          {bar("40%", 4, t.secondary)}
          {bar("58%", 3, "#d7dbe2")}
          {bar("48%", 3, "#d7dbe2")}
        </div>
        <div className="flex flex-col items-end gap-1">
          {bar("34%", 3, "#d7dbe2")}
          {bar("28%", 3, "#d7dbe2")}
          {bar("38%", 3, "#d7dbe2")}
        </div>
      </div>

      <div style={{ height: 7, background: layout === "minimal" ? "transparent" : mixHex(t.supporting, t.primary, 0.08), border: `1px solid ${t.line}` }} />
      {bar("100%", 5, t.minimal ? "transparent" : t.softFill)}
      {bar("92%", 5, "#f4f6f9")}
      {bar("97%", 5, t.minimal ? "transparent" : t.softFill)}
      <div style={{ height: 1, background: t.line }} />

      <div className="mt-auto flex flex-col items-end gap-1">
        {bar("46%", 4, "#d7dbe2")}
        {bar("56%", 4, "#d7dbe2")}
        <div style={{ width: "72%", height: 13, background: totalBg, borderRadius: 3, marginTop: 2 }} />
      </div>
      <div style={{ height: 5, background: dark ? t.primary : "#ffffff", borderTop: `1px solid ${dark ? "transparent" : t.line}` }} />
      <div style={{ height: 3, background: t.accent }} />
    </div>
  );
}
