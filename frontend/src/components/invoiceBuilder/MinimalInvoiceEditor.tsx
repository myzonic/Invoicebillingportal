import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, FileText, Lock, Plus, UserPlus } from "lucide-react";
import {
  useBrandsQuery,
  useClientsQuery,
  useCreateClientMutation,
  useCreateInvoiceMutation,
  useInvoiceQuery,
  useUpdateInvoiceMutation,
  useUploadMutation,
} from "@/app/apiSlice";
import { api } from "@/lib/api";
import { cn, errorMessage, formatDate, money, statusLabel, stripTags } from "@/lib/utils";
import { designForBrand, normalizeInvoiceDesign } from "@/lib/invoiceDesign";
import {
  computeBuilderTotals,
  DEFAULT_BUILDER_DATA,
  newItem,
  normalizeBuilderData,
  withIds,
} from "@/lib/invoiceBuilder";
import type { Brand, BuilderData, Invoice, InvoiceItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/table";
import {
  InvoiceDesignPreview,
  type EditablePreviewField,
  type InvoicePreviewEditor,
} from "@/components/invoiceDesign/InvoiceDesignPreview";

/**
 * The portal's only invoice workflow:
 * Select brand → Create → edit the document itself → Save / Generate invoice.
 * There is one document style; brand settings supply its logo, colours and
 * header/footer details.
 */
export default function MinimalInvoiceEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: invoiceData, isLoading: loadingInvoice } = useInvoiceQuery(id!, { skip: !id });
  const { data: brandsData, isLoading: loadingBrands } = useBrandsQuery({ limit: 100 });
  const { data: clientsData } = useClientsQuery({ limit: 100 });
  const [createClient, { isLoading: creatingClient }] = useCreateClientMutation();
  const [createInvoice, { isLoading: creating }] = useCreateInvoiceMutation();
  const [updateInvoice, { isLoading: updating }] = useUpdateInvoiceMutation();
  const [upload, { isLoading: uploading }] = useUploadMutation();

  const brands = brandsData?.data || [];
  const clients = clientsData?.data || [];

  const [stage, setStage] = useState<"brand" | "document">(isEdit ? "document" : "brand");
  const [pickedBrandId, setPickedBrandId] = useState("");
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);

  const [form, setForm] = useState({
    clientId: "",
    number: "",
    currency: "USD",
    taxRate: 0,
    discountAmount: 0,
    notes: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
  });
  const [items, setItems] = useState<InvoiceItem[]>([newItem()]);
  const [builder, setBuilder] = useState<BuilderData>(DEFAULT_BUILDER_DATA);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", address: "" });
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [error, setError] = useState("");

  const submittingRef = useRef(false);
  const lastSavedRef = useRef("");
  const attachmentRef = useRef<HTMLInputElement>(null);

  /* ---------------------------------------------------------------- */
  /* Hydration                                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!invoiceData) return;
    const inv = invoiceData.data;
    setForm({
      clientId: inv.clientId,
      number: inv.number,
      currency: inv.currency,
      taxRate: Number(inv.taxRate),
      discountAmount: Number(inv.discountAmount),
      notes: inv.notes || "",
      issueDate: inv.issueDate.slice(0, 10),
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
    });
    setItems(withIds((inv.items || []).map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))));
    setBuilder(normalizeBuilderData(inv.builderData));
    setPickedBrandId(inv.brandId || "");
    setSavedInvoice(inv);
    setStage("document");
    setError("");
  }, [invoiceData]);

  useEffect(() => {
    if (isEdit || pickedBrandId || !brands.length) return;
    const preferred = brands.find((b) => b.isActive !== false && b.isDefault) || brands.find((b) => b.isActive !== false) || brands[0];
    if (preferred) setPickedBrandId(preferred.id);
  }, [brands, isEdit, pickedBrandId]);

  /* ---------------------------------------------------------------- */
  /* Derived values                                                    */
  /* ---------------------------------------------------------------- */

  const selectedBrand = brands.find((b) => b.id === (savedInvoice?.brandId || pickedBrandId)) || null;
  const selectedClient = clients.find((c) => c.id === form.clientId) || null;
  const design = useMemo(() => {
    if (savedInvoice) return normalizeInvoiceDesign(savedInvoice.designOverride) || designForBrand(selectedBrand);
    return designForBrand(selectedBrand);
  }, [savedInvoice, selectedBrand]);

  const totals = useMemo(
    () => computeBuilderTotals(items, Number(form.taxRate), Number(form.discountAmount), Number(builder.shipping)),
    [items, form.taxRate, form.discountAmount, builder.shipping],
  );

  const businessName = builder.businessName || selectedBrand?.businessName || selectedBrand?.name || "Your Company";
  const contactLine = [selectedBrand?.email, selectedBrand?.phone, selectedBrand?.website].filter(Boolean).join("  ·  ");
  const footerText = selectedBrand?.pdfFooter?.trim() || `Thank you for your business. ${businessName}`;

  const payload = () => ({
    clientId: form.clientId,
    brandId: selectedBrand?.id || undefined,
    ...(savedInvoice && form.number ? { number: form.number } : {}),
    items: items.map(({ id: _id, ...rest }) => rest),
    taxRate: Number(form.taxRate),
    discountAmount: Number(form.discountAmount),
    currency: form.currency || selectedBrand?.currency || "USD",
    notes: form.notes,
    issueDate: new Date(form.issueDate).toISOString(),
    dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
    builderData: builder,
    designOverride: design,
  });

  const payloadSnapshot = JSON.stringify(payload());

  // Once the invoice exists, every edit saves itself quietly.
  useEffect(() => {
    if (!savedInvoice || stage !== "document") return;
    if (!lastSavedRef.current) {
      lastSavedRef.current = payloadSnapshot;
      return;
    }
    if (payloadSnapshot === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      if (submittingRef.current || !savedInvoice) return;
      updateInvoice({ id: savedInvoice.id, body: JSON.parse(payloadSnapshot) })
        .unwrap()
        .then((res) => {
          lastSavedRef.current = payloadSnapshot;
          setSavedInvoice(res.data);
        })
        .catch(() => setError("Could not auto-save. Use Save / Generate Invoice to retry."));
    }, 900);
    return () => clearTimeout(timer);
  }, [payloadSnapshot, savedInvoice, stage, updateInvoice]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setBuilderField = <K extends keyof BuilderData>(key: K, value: BuilderData[K]) =>
    setBuilder((b) => ({ ...b, [key]: value }));

  const chooseBrand = (brand: Brand) => {
    setPickedBrandId(brand.id);
    setForm((f) => ({ ...f, currency: brand.currency || f.currency }));
    setBuilder((b) => ({
      ...b,
      businessName: brand.businessName || brand.name || "",
      customerEmail: "",
      clientName: "",
      billingAddress: "",
    }));
    setError("");
  };

  const selectClient = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    set("clientId", clientId);
    if (client) {
      setBuilder((b) => ({
        ...b,
        clientName: b.clientName || client.name,
        customerEmail: b.customerEmail || client.email || "",
        billingAddress: b.billingAddress || client.address || "",
      }));
    }
  };

  const addQuickClient = async () => {
    if (!newCustomer.name.trim()) return setError("Customer name is required");
    try {
      const res = await createClient({ ...newCustomer, isActive: true }).unwrap();
      setShowNewCustomer(false);
      setNewCustomer({ name: "", email: "", phone: "", address: "" });
      selectClient(res.data.id);
      setError("");
      toast.success("Customer added");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const addAttachment = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError("Attachments must be 10 MB or smaller");
    try {
      const data = new FormData();
      data.append("file", file);
      const uploaded = await upload(data).unwrap();
      setBuilderField("attachments", [...builder.attachments, { name: file.name, url: uploaded.data.url }].slice(0, 10));
      toast.success("Attachment added");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const validate = () => {
    if (!form.clientId) return "Select a customer";
    if (!selectedBrand) return "Select a brand";
    if (!items.length) return "Add at least one item";
    if (items.some((i) => !stripTags(i.description))) return "Every item needs a description";
    if (items.some((i) => Number(i.quantity) <= 0)) return "Quantities must be greater than zero";
    if (items.some((i) => Number(i.unitPrice) < 0)) return "Unit prices cannot be negative";
    if (!form.issueDate) return "Choose an issue date";
    return "";
  };

  const save = async () => {
    const problem = validate();
    if (problem || submittingRef.current) {
      setError(problem || "Please wait");
      return;
    }
    submittingRef.current = true;
    setError("");
    try {
      const result = savedInvoice
        ? (await updateInvoice({ id: savedInvoice.id, body: payload() }).unwrap()).data
        : (await createInvoice(payload()).unwrap()).data;
      setSavedInvoice(result);
      setForm((f) => ({ ...f, number: result.number }));
      // The auto-save effect will initialise from the freshly hydrated payload.
      lastSavedRef.current = "";
      window.history.replaceState({}, "", `/dashboard/invoices/update/${result.id}`);
      toast.success(savedInvoice ? "Invoice updated" : "Invoice generated");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submittingRef.current = false;
    }
  };

  const downloadPdf = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    try {
      const res = savedInvoice
        ? await api.get(`/invoices/${savedInvoice.id}/pdf`, { responseType: "blob" })
        : await api.post("/invoices/preview-pdf", payload(), { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${savedInvoice?.number || "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const copyLink = async () => {
    if (!savedInvoice?.permalink) return;
    try {
      await navigator.clipboard.writeText(savedInvoice.permalink);
      toast.success("Customer link copied");
    } catch {
      setError("Could not copy the link");
    }
  };

  /* ---------------------------------------------------------------- */
  /* Inline document editor                                            */
  /* ---------------------------------------------------------------- */

  const onPreviewField = (field: EditablePreviewField, value: string) => {
    const amount = Math.max(0, Number(value) || 0);
    switch (field) {
      case "businessName": return setBuilderField("businessName", value);
      case "clientName": return setBuilderField("clientName", value);
      case "customerEmail": return setBuilderField("customerEmail", value);
      case "customerAddress": return setBuilderField("billingAddress", value);
      case "invoiceNumber": return set("number", value);
      case "issueDate": return set("issueDate", value);
      case "dueDate": return set("dueDate", value);
      case "notes": return set("notes", value);
      case "paymentInstructions": return setBuilderField("paymentInstructions", value);
      case "terms": return setBuilderField("terms", value);
      case "taxRate": return set("taxRate", amount);
      case "discountAmount": return set("discountAmount", amount);
      case "shipping": return setBuilderField("shipping", amount);
    }
  };

  const previewEditor: InvoicePreviewEditor = {
    onField: onPreviewField,
    onItem: (index, field, value) => {
      if (field === "description") return setItems((rows) => rows.map((r, i) => (i === index ? { ...r, description: value } : r)));
      const amount = field === "quantity" ? Number(value) || 0 : Math.max(0, Number(value) || 0);
      return setItems((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: amount } : r)));
    },
    onAddItem: () => setItems((rows) => [...rows, newItem()]),
    onRemoveItem: (index) => setItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows)),
  };

  const previewProps = {
    design,
    logoUrl: selectedBrand?.logoUrl,
    businessName,
    clientName: builder.clientName || selectedClient?.name || "Customer",
    customerEmail: builder.customerEmail || selectedClient?.email,
    customerAddress: builder.billingAddress || selectedClient?.address,
    invoiceNumber: form.number || savedInvoice?.number || "Draft",
    items: items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity) || 0,
      unitPrice: Number(i.unitPrice) || 0,
      discount: Number(i.discount || 0),
    })),
    currency: form.currency,
    issueDate: formatDate(form.issueDate),
    dueDate: form.dueDate ? formatDate(form.dueDate) : "-",
    status: savedInvoice ? statusLabel(savedInvoice.displayStatus || savedInvoice.status) : "Draft",
    notes: form.notes,
    subtotal: totals.subtotal,
    taxRate: Number(form.taxRate),
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    totalAmount: totals.total,
    shipping: totals.shipping,
    brandAddress: selectedBrand?.address || "",
    brandHeader: selectedBrand?.pdfHeader || "",
    footerText,
    contactLine,
    paymentInstructions: builder.paymentInstructions,
    terms: builder.terms,
    editor: previewEditor,
  };

  /* ---------------------------------------------------------------- */
  /* Screens                                                           */
  /* ---------------------------------------------------------------- */

  if (loadingInvoice || (loadingBrands && !brands.length)) return <Spinner />;

  if (stage === "brand" && !isEdit) {
    const activeBrands = brands.filter((b) => b.isActive !== false);
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Step 1 of 2</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Select a brand</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Its logo, colours, header and footer are applied to the invoice automatically.
          </p>
        </div>

        {activeBrands.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No active brands yet. Add one in Brand Settings, then come back to create an invoice.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeBrands.map((brand) => {
              const swatch = designForBrand(brand).colors;
              const active = pickedBrandId === brand.id;
              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => chooseBrand(brand)}
                  className={cn(
                    "rounded-2xl border bg-card p-5 text-left transition-all hover:shadow-md",
                    active ? "border-primary ring-2 ring-primary/20" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl border bg-white p-1">
                      {brand.logoUrl ? (
                        <img src={brand.logoUrl} alt={brand.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-xs font-bold" style={{ color: swatch.primary }}>{brand.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{brand.businessName || brand.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{brand.currency} · {brand.email || "No email saved"}</p>
                    </div>
                    {active && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}
                  </div>
                  <div className="mt-4 flex gap-1.5">
                    {(["primary", "secondary", "accent", "supporting"] as const).map((role) => (
                      <span key={role} className="h-2 flex-1 rounded-full" style={{ background: swatch[role] }} title={role} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button size="lg" disabled={!pickedBrandId} onClick={() => setStage("document")}>
            Create invoice <Plus className="size-4" />
          </Button>
          <button
            type="button"
            onClick={() => navigate("/dashboard/brand-management")}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Add or edit a brand
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!isEdit && (
            <Button variant="ghost" size="icon" title="Change brand" onClick={() => setStage("brand")} disabled={Boolean(savedInvoice)}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{savedInvoice ? savedInvoice.number : "New invoice"}</h1>
            <p className="text-xs text-muted-foreground">
              {selectedBrand?.businessName || selectedBrand?.name || "Brand"} · click any text in the document to edit it
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadPdf}><FileText className="size-3.5" /> PDF</Button>
          <Button size="sm" onClick={save} loading={creating || updating}>{savedInvoice ? "Save changes" : "Save / Generate invoice"}</Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>
      )}

      {savedInvoice?.permalink && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-success">Invoice generated and ready to share</p>
            <a href={savedInvoice.permalink} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted-foreground hover:underline">
              {savedInvoice.permalink}
            </a>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyLink}><Copy className="size-3.5" /> Copy link</Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/invoice/payment-link/${savedInvoice.publicToken || savedInvoice.id}`)}>
              <Lock className="size-3.5" /> Customer view
            </Button>
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Invoice details</h2>
            <p className="mt-1 text-xs text-muted-foreground">Everything else can be edited directly on the document.</p>

            <div className="mt-4 space-y-4">
              <Field label="Customer" required>
                <select
                  className="flex h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none"
                  value={form.clientId}
                  onChange={(e) => selectClient(e.target.value)}
                >
                  <option value="">Select customer</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              <button
                type="button"
                onClick={() => setShowNewCustomer((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary"
              >
                <UserPlus className="size-3.5" /> {showNewCustomer ? "Cancel" : "New customer"}
              </button>

              {showNewCustomer && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <Input placeholder="Name" value={newCustomer.name} onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))} />
                  <Input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))} />
                  <Input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))} />
                  <Textarea rows={2} placeholder="Address" value={newCustomer.address} onChange={(e) => setNewCustomer((c) => ({ ...c, address: e.target.value }))} />
                  <Button size="sm" onClick={addQuickClient} loading={creatingClient}>Add customer</Button>
                </div>
              )}

              <Field label="Currency">
                <select
                  className="flex h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none"
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  {["USD", "AUD", "EUR", "GBP", "CAD"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Issue date">
                  <Input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
                </Field>
                <Field label="Due date">
                  <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tax %">
                  <Input type="number" min="0" max="100" value={form.taxRate} onChange={(e) => set("taxRate", Math.max(0, Number(e.target.value) || 0))} />
                </Field>
                <Field label="Discount">
                  <Input type="number" min="0" value={form.discountAmount} onChange={(e) => set("discountAmount", Math.max(0, Number(e.target.value) || 0))} />
                </Field>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex justify-between text-xs text-muted-foreground"><span>Subtotal</span><span>{money(totals.subtotal, form.currency)}</span></div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Tax</span><span>{money(totals.taxAmount, form.currency)}</span></div>
                <div className="mt-2 flex justify-between font-semibold"><span>Total</span><span>{money(totals.total, form.currency)}</span></div>
              </div>

              <div>
                <input
                  ref={attachmentRef}
                  type="file"
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.pdf"
                  onChange={(e) => { void addAttachment(e.target.files?.[0]); e.target.value = ""; }}
                />
                <Button variant="ghost" size="sm" onClick={() => attachmentRef.current?.click()} loading={uploading}>
                  Attach file
                </Button>
                {builder.attachments.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">{builder.attachments.length} attachment(s)</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">How to edit</p>
            <p className="mt-1">Click any word, amount, date or item in the invoice on the right. Press Enter to save the field or Escape to cancel. Add/remove rows using the controls inside the document.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-neutral-50 shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Live invoice preview</p>
              <p className="text-[11px] text-muted-foreground">This is the final document — PDF and customer page use the same design.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">Editable</span>
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto w-full max-w-[794px]">
              <InvoiceDesignPreview {...previewProps} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
