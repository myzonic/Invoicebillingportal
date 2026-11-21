import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Copy, CheckCircle2, ExternalLink, Palette, Undo2 } from "lucide-react";
import {
  useBrandsQuery,
  useClientsQuery,
  useCreateInvoiceMutation,
  useInvoiceQuery,
  useRatesQuery,
  useUpdateInvoiceMutation,
} from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { api } from "@/lib/api";
import { errorMessage, money, stripTags } from "@/lib/utils";
import {
  DEFAULT_INVOICE_DESIGN,
  LAYOUT_LABEL,
  normalizeInvoiceDesign,
} from "@/lib/invoiceDesign";
import type { Invoice, InvoiceDesign, InvoiceItem, InvoiceStatus } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/richText";
import { Textarea, Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/table";
import { PdfFrame } from "@/components/PdfFrame";
import { InvoiceDesignEditor } from "@/components/invoiceDesign/InvoiceDesignEditor";
import { InvoiceDesignPreview } from "@/components/invoiceDesign/InvoiceDesignPreview";

const CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"];
const STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];
const BRAND_COLORS = ["#111111", "#374151", "#2563eb", "#0d9488", "#16a34a", "#7c3aed", "#dc2626", "#db2777", "#f97316"];

export default function InvoiceForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const can = useCan("invoices");

  const { data: invoiceData, isLoading: loadingInvoice } = useInvoiceQuery(id!, { skip: !id });
  const { data: clients } = useClientsQuery({ limit: 100 });
  const { data: brands } = useBrandsQuery({ limit: 100 });
  const { data: ratesData } = useRatesQuery();
  const currencyOptions = ratesData?.data?.currencies?.length ? ratesData.data.currencies : CURRENCIES;
  const [createInvoice, { isLoading: creating }] = useCreateInvoiceMutation();
  const [updateInvoice, { isLoading: updating }] = useUpdateInvoiceMutation();

  const [form, setForm] = useState({
    clientId: params.get("client") || "",
    brandId: "",
    currency: "USD",
    color: "",
    taxRate: 0,
    discountAmount: 0,
    notes: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    status: "DRAFT",
  });
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  // Invoice-level design override; `null` means "inherit the brand design".
  const [designOverride, setDesignOverride] = useState<InvoiceDesign | null>(null);
  const [designTouched, setDesignTouched] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (invoiceData) {
      const inv = invoiceData.data;
      setForm({
        clientId: inv.clientId,
        brandId: inv.brandId || "",
        currency: inv.currency,
        color: inv.color || "",
        taxRate: Number(inv.taxRate),
        discountAmount: Number(inv.discountAmount),
        notes: inv.notes || "",
        issueDate: inv.issueDate.slice(0, 10),
        dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
        status: inv.status,
      });
      setItems(inv.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })));
      setDesignOverride(normalizeInvoiceDesign(inv.designOverride));
      setDesignTouched(false);
    }
  }, [invoiceData]);

  // New invoices always inherit the default (or first active) brand, so the
  // client-facing page/PDF is branded even if the user never touches this field.
  useEffect(() => {
    if (isEdit || form.brandId || !brands?.data?.length) return;
    const preferred =
      brands.data.find((b) => b.isActive !== false && b.isDefault) ||
      brands.data.find((b) => b.isActive !== false) ||
      brands.data[0];
    if (preferred) {
      setForm((f) => ({ ...f, brandId: preferred.id, currency: preferred.currency || f.currency }));
    }
  }, [brands?.data, form.brandId, isEdit]);

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));
  const selectedBrand = brands?.data.find((b) => b.id === form.brandId) || brands?.data.find((b) => b.isDefault);

  const changeBrand = (brandId: string) => {
    const next = brands?.data.find((b) => b.id === brandId);
    setForm((f) => ({ ...f, brandId, currency: next?.currency || f.currency, color: "" }));
  };

  /** The brand's saved design (null when the brand still uses the classic look). */
  const brandDesign = normalizeInvoiceDesign(selectedBrand?.invoiceDesign);
  const effectiveDesign = designOverride ?? brandDesign;

  const startCustomizing = () => {
    setDesignOverride(brandDesign ?? DEFAULT_INVOICE_DESIGN);
    setDesignTouched(true);
    setDesignOpen(true);
  };

  /** Revert to the brand's saved design — clears this invoice's override. */
  const resetToBrandDesign = () => {
    setDesignOverride(null);
    setDesignTouched(true);
    setDesignOpen(false);
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);
    const taxAmount = (subtotal * Number(form.taxRate || 0)) / 100;
    const total = Math.max(0, subtotal + taxAmount - Number(form.discountAmount || 0));
    return { subtotal, taxAmount, total };
  }, [items, form.taxRate, form.discountAmount]);

  const setItem = (index: number, key: keyof InvoiceItem, value: string | number) => {
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  const addItem = () => setItems((rows) => [...rows, { description: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (index: number) => setItems((rows) => rows.filter((_, i) => i !== index));

  const buildPayload = () => ({
    clientId: form.clientId,
    brandId: form.brandId || undefined,
    items,
    taxRate: Number(form.taxRate),
    discountAmount: Number(form.discountAmount),
    currency: form.currency,
    color: form.color || undefined,
    notes: form.notes,
    issueDate: new Date(form.issueDate).toISOString(),
    dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
    status: form.status as InvoiceStatus,
    // Only send when touched: `undefined` leaves the stored override untouched,
    // `null` clears it (revert to the brand design).
    ...(designTouched ? { designOverride: designOverride ?? null } : {}),
  });

  const validate = () => {
    if (!form.clientId) {
      toast.error("Select a client");
      return false;
    }
    if (!form.brandId) {
      toast.error("Select a brand");
      return false;
    }
    if (items.some((i) => !stripTags(i.description))) {
      toast.error("Every line item needs a description");
      return false;
    }
    return true;
  };

  const openPreview = async () => {
    if (!validate()) return;
    setPreviewing(true);
    try {
      const res = await api.post("/invoices/preview-pdf", buildPayload(), { responseType: "blob" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
      setPreviewOpen(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPreviewing(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      if (isEdit) {
        await updateInvoice({ id: id!, body: buildPayload() }).unwrap();
        toast.success("Invoice updated");
        navigate("/dashboard/invoices");
      } else {
        const result = await createInvoice(buildPayload()).unwrap();
        setCreatedInvoice(result.data);
        toast.success("Invoice created");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const paymentLink = createdInvoice?.permalink || "";
  const copyPaymentLink = async () => {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link. Select and copy it manually.");
    }
  };

  if (loadingInvoice) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={isEdit ? "Edit Invoice" : "Add Invoice"}
        description={isEdit ? "Update invoice details and preview the PDF" : "Create a new invoice"}
        action={
          <Button type="button" variant="outline" onClick={openPreview} loading={previewing}>
            <Eye className="size-4" /> Preview PDF
          </Button>
        }
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client" required>
                <Select value={form.clientId} onChange={(e) => set("clientId", e.target.value)} required>
                  <option value="">Select client...</option>
                  {clients?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Brand / Company"
                hint="Client-facing invoice, checkout and PDF details are read from this brand"
              >
                <Select value={form.brandId} onChange={(e) => changeBrand(e.target.value)}>
                  <option value="" disabled>
                    Select a brand
                  </option>
                  {brands?.data.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedBrand && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <p className="mb-1 font-semibold text-foreground">Brand details used on the client invoice</p>
                  <p className="font-medium">{selectedBrand.businessName || selectedBrand.name}</p>
                  {selectedBrand.address && <p className="whitespace-pre-line text-muted-foreground">{selectedBrand.address}</p>}
                  {[selectedBrand.email, selectedBrand.phone].filter(Boolean).length > 0 && (
                    <p className="text-muted-foreground">
                      {[selectedBrand.email, selectedBrand.phone].filter(Boolean).join("  |  ")}
                    </p>
                  )}
                  {selectedBrand.pdfHeader && (
                    <p className="mt-1 whitespace-pre-line text-muted-foreground">Header: {selectedBrand.pdfHeader}</p>
                  )}
                  {selectedBrand.pdfFooter && (
                    <p className="mt-1 whitespace-pre-line text-muted-foreground">Footer: {selectedBrand.pdfFooter}</p>
                  )}
                  <p className="mt-1 font-medium" style={{ color: selectedBrand.color || undefined }}>
                    Color: {selectedBrand.color || "default"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Invoice design: {effectiveDesign ? LAYOUT_LABEL[effectiveDesign.layout] : "Classic"}{" "}
                    {designOverride ? "(custom for this invoice)" : "(brand default)"}
                  </p>
                  {selectedBrand.paymentDomain && (
                    <p className="mt-1 text-muted-foreground">Pay link domain: {selectedBrand.paymentDomain}</p>
                  )}
                </div>
              )}
              <Field label="Currency">
                <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Override color" hint="Leave blank to use the brand color on the client's invoice, checkout and PDF">
                <div className="flex items-center gap-2">
                  <label
                    className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border shadow-sm"
                    style={{ background: form.color || "#111111" }}
                    title="Pick a custom color"
                  >
                    <input
                      type="color"
                      value={form.color || "#111111"}
                      onChange={(e) => set("color", e.target.value)}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                    <span className="text-[10px] font-bold text-white/90">▼</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => set("color", c)}
                        className={`size-6 rounded-full border transition-transform hover:scale-110 ${form.color === c ? "ring-2 ring-foreground ring-offset-2" : "border-black/10"}`}
                        style={{ background: c }}
                        aria-label={`Use color ${c}`}
                      />
                    ))}
                    {form.color && (
                      <button type="button" onClick={() => set("color", "")} className="text-xs text-muted-foreground underline">
                        Use brand default
                      </button>
                    )}
                  </div>
                </div>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Issue date" required>
                <Input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} required />
              </Field>
              <Field label="Due date">
                <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Invoice design</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedBrand?.name || "The selected brand"}'s saved design is used automatically. You can adjust the
                  layout and colours for this invoice only — the brand defaults are never changed.
                </p>
              </div>
              {!designOpen && (
                <Button type="button" variant="outline" size="sm" onClick={startCustomizing}>
                  <Palette className="size-4" /> {effectiveDesign ? "Customize this invoice" : "Choose a design"}
                </Button>
              )}
            </div>

            {!designOpen && effectiveDesign && (
              <div className="grid items-start gap-4 sm:grid-cols-[190px_1fr]">
                <div className="overflow-hidden rounded-lg border border-border bg-white">
                  <InvoiceDesignPreview
                    design={effectiveDesign}
                    logoUrl={selectedBrand?.logoUrl}
                    businessName={selectedBrand?.businessName || selectedBrand?.name}
                    currency={form.currency}
                    clientName={clients?.data.find((c) => c.id === form.clientId)?.name}
                    invoiceNumber={invoiceData?.data.number}
                  />
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">Layout:</span> {LAYOUT_LABEL[effectiveDesign.layout]}{" "}
                    {designOverride ? "(custom for this invoice)" : "(inherited from brand)"}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Colours:</span>{" "}
                    {(["primary", "secondary", "accent", "supporting"] as const).map((role) => (
                      <span
                        key={role}
                        className="mr-1.5 inline-block size-4 rounded-full border border-black/10 align-[-3px]"
                        style={{ background: effectiveDesign.colors[role] }}
                        title={`${role} ${effectiveDesign.colors[role]}`}
                      />
                    ))}
                  </p>
                  <p>The same design is used on the client-facing invoice page and the downloadable A4 PDF.</p>
                  <p>
                    <button type="button" onClick={startCustomizing} className="font-medium text-primary underline">
                      Customize this invoice
                    </button>{" "}
                    {designOverride && (
                      <>
                        ·{" "}
                        <button type="button" onClick={resetToBrandDesign} className="font-medium text-primary underline">
                          reset to brand design
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}

            {!designOpen && !effectiveDesign && (
              <p className="text-xs text-muted-foreground">
                This brand still uses the classic invoice look. Choose a design to use the modern brand-based invoice for
                this invoice.
              </p>
            )}

            {designOpen && (
              <InvoiceDesignEditor
                value={designOverride ?? brandDesign ?? DEFAULT_INVOICE_DESIGN}
                onChange={(d) => {
                  setDesignOverride(d);
                  setDesignTouched(true);
                }}
                palette={selectedBrand?.logoPalette || []}
                logoUrl={selectedBrand?.logoUrl}
                businessName={selectedBrand?.businessName || selectedBrand?.name}
                savedDesign={brandDesign}
                onReset={resetToBrandDesign}
                previewItems={items}
                currency={form.currency}
                clientName={clients?.data.find((c) => c.id === form.clientId)?.name}
                invoiceNumber={invoiceData?.data.number}
                actions={
                  <Button type="button" variant="ghost" size="sm" onClick={resetToBrandDesign}>
                    <Undo2 className="size-3.5" /> Reset to brand design
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Line items</h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="size-4" /> Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1">
                    <Field label={index === 0 ? "Description" : ""}>
                      <RichTextEditor
                        value={item.description}
                        onChange={(html) => setItem(index, "description", html)}
                        placeholder="Item description"
                      />
                    </Field>
                  </div>
                  <div className="w-20">
                    <Field label={index === 0 ? "Qty" : ""}>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => setItem(index, "quantity", Number(e.target.value))}
                      />
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field label={index === 0 ? "Unit price" : ""}>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => setItem(index, "unitPrice", Number(e.target.value))}
                      />
                    </Field>
                  </div>
                  <div className="w-24 pb-2 text-right text-sm font-medium">
                    {money(Number(item.quantity) * Number(item.unitPrice), form.currency)}
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length === 1}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tax rate (%)">
                <Input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => set("taxRate", Number(e.target.value))} />
              </Field>
              <Field label="Discount amount">
                <Input type="number" min={0} step="0.01" value={form.discountAmount} onChange={(e) => set("discountAmount", Number(e.target.value))} />
              </Field>
              <Field label="Notes">
                <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional note" />
              </Field>
            </div>
            <div className="flex flex-col items-end gap-1 border-t border-border pt-4 text-sm">
              <div className="flex w-64 justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{money(totals.subtotal, form.currency)}</span>
              </div>
              <div className="flex w-64 justify-between">
                <span className="text-muted-foreground">Tax ({form.taxRate}%)</span>
                <span>{money(totals.taxAmount, form.currency)}</span>
              </div>
              {Number(form.discountAmount) > 0 && (
                <div className="flex w-64 justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-{money(form.discountAmount, form.currency)}</span>
                </div>
              )}
              <div className="flex w-64 justify-between border-t border-border pt-2 text-base font-bold">
                <span>Total</span>
                <span>{money(totals.total, form.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/dashboard/invoices")}>
            Cancel
          </Button>
          {can(isEdit ? "update" : "create") && (
            <Button type="submit" loading={creating || updating}>
              {isEdit ? "Save changes" : "Create invoice"}
            </Button>
          )}
        </div>
      </form>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="Live PDF preview" description="Changes are not saved until you submit the form." className="max-w-4xl">
        {previewUrl ? <PdfFrame src={previewUrl} /> : <Spinner />}
      </Dialog>

      <Dialog
        open={!!createdInvoice}
        onClose={() => {
          setCreatedInvoice(null);
          navigate("/dashboard/invoices");
        }}
        title="Invoice Created"
        description={`Invoice ${createdInvoice?.number || ""} is ready. Share its permanent branded payment link with your client.`}
      >
        {createdInvoice && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-success" /> Payment link
              </p>
              <p className="break-all font-medium">{paymentLink}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedBrand?.paymentDomain || createdInvoice.paymentDomain} · {createdInvoice.currency}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyPaymentLink}>
                {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy Payment Link"}
              </Button>
              {paymentLink && (
                <a href={paymentLink} target="_blank" rel="noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="size-4" /> Open Payment Page
                  </Button>
                </a>
              )}
              <Button variant="ghost" onClick={() => navigate(`/dashboard/invoices/${createdInvoice.id}`)}>
                View invoice
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
