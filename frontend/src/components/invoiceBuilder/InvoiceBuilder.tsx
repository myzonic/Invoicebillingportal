import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  Eye,
  FileText,
  GripVertical,
  Lock,
  Maximize2,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  useBrandsQuery,
  useClientsQuery,
  useCreateClientMutation,
  useCreateInvoiceMutation,
  useInvoiceQuery,
  useRatesQuery,
  useSendInvoiceMutation,
  useUpdateInvoiceMutation,
  useUploadMutation,
} from "@/app/apiSlice";
import { api } from "@/lib/api";
import { cn, errorMessage, formatDate, money, statusLabel, stripTags } from "@/lib/utils";
import {
  DEFAULT_INVOICE_DESIGN,
  LAYOUT_LABEL,
  normalizeInvoiceDesign,
} from "@/lib/invoiceDesign";
import {
  computeBuilderTotals,
  DEFAULT_BUILDER_DATA,
  lineTotal,
  newItem,
  normalizeBuilderData,
  withIds,
} from "@/lib/invoiceBuilder";
import type { BuilderData, Invoice, InvoiceDesign, InvoiceItem } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea, Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/table";
import { RichTextEditor } from "@/components/ui/richText";
import { PdfFrame } from "@/components/PdfFrame";
import { InvoiceDesignEditor } from "@/components/invoiceDesign/InvoiceDesignEditor";
import { InvoiceDesignPreview } from "@/components/invoiceDesign/InvoiceDesignPreview";

const CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"];

type SectionKey = "info" | "customer" | "items" | "financial" | "payment" | "extra" | "design";

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "info", label: "Invoice" },
  { key: "customer", label: "Customer" },
  { key: "items", label: "Items" },
  { key: "financial", label: "Summary" },
  { key: "payment", label: "Payment" },
  { key: "extra", label: "More" },
  { key: "design", label: "Design" },
];

function SectionHeader({ index, title, description, icon }: { index: number; title: string; description: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
        {icon || index}
      </span>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function InvoiceBuilder() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const { data: invoiceData, isLoading: loadingInvoice } = useInvoiceQuery(id!, { skip: !id });
  const { data: clientsData } = useClientsQuery({ limit: 100 });
  const { data: brandsData } = useBrandsQuery({ limit: 100 });
  const { data: ratesData } = useRatesQuery();
  const [createClient, { isLoading: creatingClient }] = useCreateClientMutation();
  const [createInvoice, { isLoading: creating }] = useCreateInvoiceMutation();
  const [updateInvoice, { isLoading: updating }] = useUpdateInvoiceMutation();
  const [sendInvoice, { isLoading: sending }] = useSendInvoiceMutation();
  const [upload, { isLoading: uploading }] = useUploadMutation();

  const currencyOptions = ratesData?.data?.currencies?.length ? ratesData.data.currencies : CURRENCIES;
  const clients = clientsData?.data || [];
  const brands = brandsData?.data || [];

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
  });
  const [items, setItems] = useState<InvoiceItem[]>([newItem()]);
  const [builder, setBuilder] = useState<BuilderData>(DEFAULT_BUILDER_DATA);
  const [designOverride, setDesignOverride] = useState<InvoiceDesign | null>(null);
  const [designTouched, setDesignTouched] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const [showSavedDialog, setShowSavedDialog] = useState(false);

  const [clientSearch, setClientSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClient, setQuickClient] = useState({ name: "", email: "", phone: "", address: "" });
  const [expandedItemNotes, setExpandedItemNotes] = useState<Record<string, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const attachmentRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------------ */
  /* Hydration                                                           */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!invoiceData) return;
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
    });
    setItems(withIds((inv.items || []).map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))));
    setBuilder(normalizeBuilderData(inv.builderData));
    setDesignOverride(normalizeInvoiceDesign(inv.designOverride));
    setSavedInvoice(inv);
    setDirty(false);
  }, [invoiceData]);

  useEffect(() => {
    if (isEdit || form.brandId || !brands.length) return;
    const preferred = brands.find((b) => b.isActive !== false && b.isDefault) || brands.find((b) => b.isActive !== false) || brands[0];
    if (preferred) setForm((f) => ({ ...f, brandId: preferred.id, currency: preferred.currency || f.currency }));
  }, [brands, form.brandId, isEdit]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const previewUrlRef = useRef("");
  const pdfFrameRef = useRef<HTMLDivElement>(null);
  useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  /* ------------------------------------------------------------------ */
  /* Derived values                                                      */
  /* ------------------------------------------------------------------ */

  const selectedBrand = brands.find((b) => b.id === form.brandId) || brands.find((b) => b.isDefault);
  const selectedClient = clients.find((c) => c.id === form.clientId);
  const brandDesign = normalizeInvoiceDesign(selectedBrand?.invoiceDesign);
  const effectiveDesign = designOverride ?? brandDesign ?? DEFAULT_INVOICE_DESIGN;
  const totals = useMemo(
    () => computeBuilderTotals(items, Number(form.taxRate), Number(form.discountAmount), Number(builder.shipping)),
    [items, form.taxRate, form.discountAmount, builder.shipping],
  );
  const amountPaid = useMemo(() => {
    if (!savedInvoice?.payments) return 0;
    return savedInvoice.payments
      .filter((p) => p.status === "SUCCEEDED")
      .reduce((sum, p) => sum + (p.invoiceAmount != null ? Number(p.invoiceAmount) : Number(p.amount)), 0);
  }, [savedInvoice]);
  const balance = Math.max(0, totals.total - amountPaid);

  const filteredClients = clients.filter((c) => {
    const q = clientSearch.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q);
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const setBuilderField = <K extends keyof BuilderData>(key: K, value: BuilderData[K]) => {
    setBuilder((b) => ({ ...b, [key]: value }));
    setDirty(true);
  };

  const changeBrand = (brandId: string) => {
    const next = brands.find((b) => b.id === brandId);
    setForm((f) => ({ ...f, brandId, currency: next?.currency || f.currency, color: "" }));
    setDesignOverride(null);
    setDesignTouched(false);
    setDirty(true);
  };

  const selectClient = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId);
    setForm((f) => ({
      ...f,
      clientId,
      ...(c && !builder.billingAddress ? { brandId: f.brandId || c.brandId || "" } : {}),
    }));
    if (c && !builder.billingAddress) setBuilder((b) => ({ ...b, billingAddress: c.address || "" }));
    setPickerOpen(false);
    setClientSearch("");
    setDirty(true);
  };

  /* ------------------------------------------------------------------ */
  /* Items                                                               */
  /* ------------------------------------------------------------------ */

  const updateItem = (index: number, patch: Partial<InvoiceItem>) => {
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addItem = () => {
    setItems((rows) => [...rows, newItem()]);
    setDirty(true);
  };
  const duplicateItem = (index: number) => {
    setItems((rows) => {
      const copy = { ...rows[index], id: newItem().id, description: `${rows[index].description}` };
      return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
    });
    setDirty(true);
  };
  const removeItem = (index: number) => {
    setItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
    setDirty(true);
  };
  const moveItem = (from: number, to: number) => {
    if (from === to) return;
    setItems((rows) => {
      const next = [...rows];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  };

  /* ------------------------------------------------------------------ */
  /* Payload / validation / actions                                      */
  /* ------------------------------------------------------------------ */

  const payload = () => ({
    clientId: form.clientId,
    brandId: form.brandId || undefined,
    items: items.map(({ id: _id, ...rest }) => rest),
    taxRate: Number(form.taxRate),
    discountAmount: Number(form.discountAmount),
    currency: form.currency,
    color: form.color || undefined,
    notes: form.notes,
    issueDate: new Date(form.issueDate).toISOString(),
    dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
    builderData: builder,
    ...(designTouched ? { designOverride } : {}),
  });

  const validate = () => {
    if (!form.clientId) return toast.error("Select a customer"), false;
    if (!form.brandId) return toast.error("Select a company / brand"), false;
    if (!items.length) return toast.error("Add at least one line item"), false;
    if (items.some((i) => !stripTags(i.description))) return toast.error("Every item needs a description"), false;
    if (items.some((i) => Number(i.quantity) <= 0)) return toast.error("Item quantities must be greater than zero"), false;
    if (items.some((i) => Number(i.unitPrice) < 0)) return toast.error("Unit prices cannot be negative"), false;
    if (!form.issueDate) return toast.error("Choose an issue date"), false;
    return true;
  };

  const save = async (sendAfter = false): Promise<Invoice | null> => {
    if (savedInvoice?.status === "PAID") {
      toast.error("Paid invoices cannot be edited");
      return null;
    }
    if (!validate() || submittingRef.current) return null;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      let result: Invoice;
      if (savedInvoice) {
        result = (await updateInvoice({ id: savedInvoice.id, body: payload() }).unwrap()).data;
      } else {
        result = (await createInvoice(payload()).unwrap()).data;
      }
      setSavedInvoice(result);
      setDirty(false);
      setShowSavedDialog(true);
      // Keep the builder mounted: update the URL without a route remount.
      window.history.replaceState({}, "", `/dashboard/invoices/update/${result.id}`);
      if (sendAfter) {
        await sendInvoice(result.id).unwrap();
        toast.success("Invoice saved and sent to the customer");
      } else {
        toast.success(isEdit ? "Invoice updated" : "Invoice saved as draft");
      }
      return result;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const sendOnly = async () => {
    let invoice = savedInvoice;
    if (!invoice) {
      invoice = (await save(false)) || null;
      if (!invoice) return;
    }
    try {
      await sendInvoice(invoice.id).unwrap();
      toast.success("Invoice sent to the customer");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const openPdfPreview = async () => {
    if (!validate()) return;
    setPreviewing(true);
    try {
      const res = await api.post("/invoices/preview-pdf", payload(), { responseType: "blob" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
      setPreviewOpen(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPreviewing(false);
    }
  };

  const downloadPdf = async () => {
    if (!validate()) return;
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
      toast.error(errorMessage(err));
    }
  };

  const addAttachment = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Attachments must be 10 MB or smaller");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await upload(fd).unwrap();
      setBuilder((b) => ({ ...b, attachments: [...b.attachments, { name: file.name, url: res.data.url }].slice(0, 10) }));
      setDirty(true);
      toast.success("Attachment added");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const createQuickClient = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickClient.name.trim()) return toast.error("Customer name is required");
    try {
      const res = await createClient({ ...quickClient, isActive: true }).unwrap();
      setQuickClientOpen(false);
      setQuickClient({ name: "", email: "", phone: "", address: "" });
      selectClient(res.data.id);
      toast.success("Customer added");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (loadingInvoice) return <Spinner />;

  const previewProps = {
    design: effectiveDesign,
    logoUrl: selectedBrand?.logoUrl,
    businessName: selectedBrand?.businessName || selectedBrand?.name || "Your Company",
    clientName: selectedClient?.name || "Customer",
    customerEmail: selectedClient?.email,
    customerAddress: builder.billingAddress || selectedClient?.address,
    invoiceNumber: savedInvoice?.number || "Draft",
    items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0, discount: Number(i.discount || 0) })),
    currency: form.currency,
    issueDate: formatDate(form.issueDate),
    dueDate: form.dueDate ? formatDate(form.dueDate) : "-",
    status: savedInvoice ? statusLabel(savedInvoice.displayStatus || savedInvoice.status) : "Draft",
    notes: form.notes,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    totalAmount: totals.total,
    shipping: totals.shipping,
    paymentInstructions: builder.paymentInstructions,
    terms: builder.terms,
  };

  const previewPanel = (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Live invoice preview</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={openPdfPreview} loading={previewing}>
          <FileText className="size-3.5" /> PDF
        </Button>
      </div>
      <div className="max-h-[calc(100vh-9rem)] overflow-y-auto bg-neutral-50 p-3">
        <InvoiceDesignPreview {...previewProps} />
        <p className="mt-3 px-1 text-[10px] text-muted-foreground">
          The PDF preview shows the exact A4/Letter output, including all pages. Internal notes are never shown to customers.
        </p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8">
      <PageHeader
        title={isEdit ? "Edit Invoice" : "New Invoice"}
        description="Create a polished, branded invoice — everything updates as you type."
        action={
          <div className="flex items-center gap-2">
            {savedInvoice && <StatusBadge status={savedInvoice.displayStatus || savedInvoice.status} />}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {savedInvoice?.number || "Number is generated when saved"}
            </span>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5">
        {SECTIONS.map((s, i) => (
          <a
            key={s.key}
            href={`#section-${s.key}`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="mr-1.5 text-[10px] text-primary/70">{i + 1}</span>
            {s.label}
          </a>
        ))}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <Button type="button" variant="outline" size="sm" onClick={() => setMobilePreview(true)}>
            <Eye className="size-3.5" /> Preview
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        {/* ------------------------------- EDITOR ------------------------------- */}
        <form onSubmit={(e) => { e.preventDefault(); void save(false); }} className="min-w-0 space-y-8">
          <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/95 p-2 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={openPdfPreview} loading={previewing}>
                <Eye className="size-3.5" /> Preview
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={downloadPdf}>
                <ArrowDownToLine className="size-3.5" /> PDF
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void save(false)} loading={submitting}>
                <Check className="size-3.5" /> Save draft
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void sendOnly()} loading={sending || submitting} disabled={savedInvoice?.status === "PAID"}>
                <Send className="size-3.5" /> Send
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>Cancel</Button>
              <Button type="button" size="sm" onClick={() => void save(true)} loading={submitting || sending}>
                <Sparkles className="size-3.5" /> Save & send
              </Button>
            </div>
          </div>

          {/* A. Invoice information */}
          <section id="section-info" className="scroll-mt-20">
            <SectionHeader index={1} title="Invoice information" description="The essentials that identify this invoice." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company / brand" required hint="Logo, colours and payment details come from this brand">
                <Select value={form.brandId} onChange={(e) => changeBrand(e.target.value)} required>
                  <option value="" disabled>Select a company</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Invoice number" hint="Generated automatically — never changed by the builder">
                <div className="flex h-9 items-center rounded-lg border border-border bg-muted/50 px-3 text-sm font-medium">
                  {savedInvoice?.number || <span className="text-muted-foreground">Generated on save</span>}
                </div>
              </Field>
              <Field label="Issue date" required>
                <Input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} required />
              </Field>
              <Field label="Payment due date">
                <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
              </Field>
              <Field label="Currency">
                <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Status" hint="Automatic — Draft until sent, then Active / Partially paid / Paid">
                <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3">
                  <StatusBadge status={savedInvoice ? savedInvoice.displayStatus || savedInvoice.status : "DRAFT"} />
                  <span className="text-xs text-muted-foreground">Managed automatically</span>
                </div>
              </Field>
            </div>
            {selectedBrand && (
              <div className="mt-4 flex flex-wrap items-start gap-3 rounded-xl bg-muted/40 px-4 py-3">
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                  <img src={selectedBrand.logoUrl || undefined} alt={selectedBrand.name} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-semibold text-foreground">{selectedBrand.businessName || selectedBrand.name}</p>
                  {selectedBrand.address && <p className="whitespace-pre-line text-muted-foreground">{selectedBrand.address}</p>}
                  <p className="text-muted-foreground">{[selectedBrand.email, selectedBrand.phone].filter(Boolean).join("  ·  ")}</p>
                  <p className="mt-1 text-muted-foreground">
                    Design: <span className="font-medium text-foreground">{LAYOUT_LABEL[effectiveDesign.layout]}</span> · Colors:{" "}
                    {(["primary", "secondary", "accent", "supporting"] as const).map((role) => (
                      <span key={role} className="mr-1 inline-block size-3 rounded-full border border-black/10 align-[-2px]" style={{ background: effectiveDesign.colors[role] }} />
                    ))}
                  </p>
                </div>
                {selectedBrand.paymentDomain && <span className="rounded-md bg-card px-2 py-1 text-[10px] text-muted-foreground">{selectedBrand.paymentDomain}</span>}
              </div>
            )}
          </section>

          {/* B. Customer */}
          <section id="section-customer" className="scroll-mt-20">
            <SectionHeader index={2} title="Customer information" description="Who this invoice is for." icon={<Building2 className="size-3.5" />} />
            <Field label="Customer" required hint="Search existing customers or add a new one without leaving this page">
              <div className="relative">
                <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder={selectedClient ? selectedClient.name : "Search by name or email…"}
                    value={clientSearch}
                    onFocus={() => setPickerOpen(true)}
                    onChange={(e) => { setClientSearch(e.target.value); setPickerOpen(true); }}
                  />
                  {form.clientId && (
                    <button type="button" onClick={() => { set("clientId", ""); setClientSearch(""); }} className="text-muted-foreground hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  )}
                  <ChevronDown className="size-4 text-muted-foreground" />
                </div>
                {pickerOpen && (
                  <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
                    {filteredClients.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No customers found.</p>}
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectClient(c.id)}
                        className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-muted", c.id === form.clientId && "bg-primary/5")}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.email || ""}</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => { setPickerOpen(false); setQuickClientOpen(true); }} className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-3 py-2 text-xs font-medium text-primary hover:bg-muted">
                      <UserPlus className="size-3.5" /> Add a new customer
                    </button>
                  </div>
                )}
              </div>
            </Field>
            {selectedClient && (
              <div className="mt-3 grid gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
                <Field label="Company name">
                  <Input value={builder.customerCompany} onChange={(e) => setBuilderField("customerCompany", e.target.value)} placeholder={selectedClient.name} />
                </Field>
                <Field label="Tax identification number">
                  <Input value={builder.customerTaxId} onChange={(e) => setBuilderField("customerTaxId", e.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Billing address" hint="Shown on the invoice">
                  <Textarea value={builder.billingAddress || selectedClient.address || ""} onChange={(e) => setBuilderField("billingAddress", e.target.value)} rows={3} placeholder="Street, city, state, postcode" />
                </Field>
                <Field label="Shipping address" hint="Only shown when provided">
                  <Textarea value={builder.shippingAddress} onChange={(e) => setBuilderField("shippingAddress", e.target.value)} rows={3} placeholder="Optional" />
                </Field>
                <div className="sm:col-span-2 text-xs text-muted-foreground">
                  {selectedClient.email && <span>{selectedClient.email} </span>}
                  {selectedClient.phone && <span>· {selectedClient.phone}</span>}
                </div>
              </div>
            )}
          </section>

          {/* C. Items */}
          <section id="section-items" className="scroll-mt-20">
            <SectionHeader index={3} title="Invoice items" description="Add services or products. Drag to reorder, duplicate, or add notes." icon={<Plus className="size-3.5" />} />
            <div className="space-y-3">
              <div className="hidden grid-cols-[24px_minmax(180px,1fr)_64px_96px_88px_96px_60px] gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
                <span />
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Discount</span>
                <span className="text-right">Tax %</span>
                <span className="text-right">Amount</span>
              </div>
              {items.map((item, index) => {
                const itemId = item.id || `row-${index}`;
                return (
                  <div
                    key={itemId}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragIndex !== null) moveItem(dragIndex, index); setDragIndex(null); }}
                    className={cn(
                      "rounded-xl border border-border bg-card p-3 transition-shadow",
                      dragIndex === index ? "opacity-50" : "hover:shadow-sm",
                    )}
                  >
                    <div className="grid gap-2 sm:grid-cols-[24px_minmax(180px,1fr)_64px_96px_88px_96px_60px]">
                      <div className="flex items-start justify-center pt-2 text-muted-foreground">
                        <GripVertical className="size-4 cursor-grab" aria-label="Drag to reorder" />
                      </div>
                      <div className="min-w-0">
                        <RichTextEditor value={item.description} onChange={(html) => updateItem(index, { description: html })} placeholder="What did you provide?" minHeight="44px" />
                      </div>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} aria-label="Quantity" />
                      <Input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })} aria-label="Unit price" />
                      <Input type="number" min={0} step="0.01" value={item.discount ?? 0} onChange={(e) => updateItem(index, { discount: Number(e.target.value) })} aria-label="Line discount" />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={item.taxRate ?? ""}
                        onChange={(e) => updateItem(index, { taxRate: e.target.value === "" ? undefined : Number(e.target.value) })}
                        placeholder={String(form.taxRate)}
                        aria-label="Line tax percent"
                      />
                      <div className="flex h-9 items-center justify-end text-sm font-semibold tabular-nums">{money(lineTotal(item), form.currency)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setExpandedItemNotes((s) => ({ ...s, [itemId]: !s[itemId] }))}>
                          {expandedItemNotes[itemId] ? "Hide note" : "Add note"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => duplicateItem(index)}>
                          <Copy className="size-3.5" /> Duplicate
                        </Button>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length === 1} aria-label="Remove item">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                    {expandedItemNotes[itemId] && (
                      <Textarea
                        className="mt-2"
                        rows={2}
                        value={item.notes || ""}
                        onChange={(e) => updateItem(index, { notes: e.target.value })}
                        placeholder="Note for this line (not printed on the PDF)"
                      />
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
                <Plus className="size-4" /> Add another item
              </Button>
            </div>
          </section>

          {/* D. Financial summary */}
          <section id="section-financial" className="scroll-mt-20">
            <SectionHeader index={4} title="Financial summary" description="All amounts recalculate instantly. Multiple currencies are never combined." />
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_260px]">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Global tax rate (%)" hint="Applies to lines without their own tax rate">
                  <Input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => set("taxRate", Number(e.target.value))} />
                </Field>
                <Field label="Overall discount" hint="Applied after tax">
                  <Input type="number" min={0} step="0.01" value={form.discountAmount} onChange={(e) => set("discountAmount", Number(e.target.value))} />
                </Field>
                <Field label="Shipping / additional charges">
                  <Input type="number" min={0} step="0.01" value={builder.shipping} onChange={(e) => setBuilderField("shipping", Number(e.target.value))} />
                </Field>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <div className="space-y-1.5">
                  <Row label="Subtotal" value={money(totals.subtotal, form.currency)} />
                  {totals.itemDiscounts > 0 && <Row label="Item discounts" value={`- ${money(totals.itemDiscounts, form.currency)}`} muted />}
                  <Row label="Tax" value={money(totals.taxAmount, form.currency)} />
                  {totals.discountAmount > 0 && <Row label="Overall discount" value={`- ${money(totals.discountAmount, form.currency)}`} muted />}
                  {totals.shipping > 0 && <Row label="Shipping" value={money(totals.shipping, form.currency)} />}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs font-bold uppercase tracking-wide">Total</span>
                  <span className="text-xl font-extrabold tabular-nums">{money(totals.total, form.currency)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Amount paid</span>
                  <span>{money(amountPaid, form.currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Remaining balance</span>
                  <span className="tabular-nums">{money(balance, form.currency)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* E. Payment information */}
          <section id="section-payment" className="scroll-mt-20">
            <SectionHeader index={5} title="Payment information" description="Tell the customer how and when to pay." icon={<CreditCard className="size-3.5" />} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supported payment methods" hint="Card payments are enabled when online payments are on for this brand">
                <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-xs">
                  <Lock className="size-3.5 text-success" /> Secure card payment{selectedBrand?.paymentEnabled === false ? " (currently disabled)" : " via Square"}
                </div>
              </Field>
              <Field label="Deposit requirement">
                <Select value={builder.depositRequired ? "yes" : "no"} onChange={(e) => setBuilderField("depositRequired", e.target.value === "yes")}>
                  <option value="no">No deposit required</option>
                  <option value="yes">Deposit required before work begins</option>
                </Select>
              </Field>
              <Field label="Payment terms" hint="e.g. Net 14, due on receipt">
                <Input value={builder.paymentTerms} onChange={(e) => setBuilderField("paymentTerms", e.target.value)} placeholder="Payment is due within 14 days" />
              </Field>
              <Field label="Payment instructions" hint="Appears on the client page, PDF and email">
                <Input value={builder.paymentInstructions} onChange={(e) => setBuilderField("paymentInstructions", e.target.value)} placeholder="Bank transfer details, reference, etc." />
              </Field>
            </div>
          </section>

          {/* F. Additional information */}
          <section id="section-extra" className="scroll-mt-20">
            <SectionHeader index={6} title="Additional information" description="Notes, terms and attachments." icon={<FileText className="size-3.5" />} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer-facing notes" hint="Printed on the invoice and shown on the payment page">
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Thank you for your business…" />
              </Field>
              <Field label="Terms & conditions" hint="Printed on the invoice">
                <Textarea value={builder.terms} onChange={(e) => setBuilderField("terms", e.target.value)} rows={3} placeholder="Late payments may incur…" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Internal notes" hint="Only visible to your team — never printed or shown to customers">
                <Textarea value={builder.internalNotes} onChange={(e) => setBuilderField("internalNotes", e.target.value)} rows={2} placeholder="e.g. Follow up next week" />
              </Field>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {builder.attachments.map((a) => (
                  <span key={a.url} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
                    <Paperclip className="size-3.5" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="max-w-[180px] truncate hover:underline">{a.name}</a>
                    <button
                      type="button"
                      onClick={() => setBuilderField("attachments", builder.attachments.filter((x) => x.url !== a.url))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="file"
                  accept="image/*"
                  ref={attachmentRef}
                  className="hidden"
                  onChange={(e) => { void addAttachment(e.target.files?.[0]); e.target.value = ""; }}
                />
                <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => attachmentRef.current?.click()}>
                  <Paperclip className="size-3.5" /> Attach image
                </Button>
              </div>
            </div>
          </section>

          {/* G. Design */}
          <section id="section-design" className="scroll-mt-20">
            <SectionHeader index={7} title="Design & branding" description="Choose a layout and colours. Brand defaults load automatically; changes here affect only this invoice." icon={<Sparkles className="size-3.5" />} />
            <InvoiceDesignEditor
              value={effectiveDesign}
              onChange={(d) => { setDesignOverride(d); setDesignTouched(true); setDirty(true); }}
              palette={selectedBrand?.logoPalette || []}
              logoUrl={selectedBrand?.logoUrl}
              businessName={selectedBrand?.businessName || selectedBrand?.name}
              savedDesign={brandDesign}
              onReset={() => { setDesignOverride(null); setDesignTouched(true); setDirty(true); }}
              hidePreview
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Paper format" hint="Used for the downloadable PDF">
                <Select value={builder.paperSize} onChange={(e) => setBuilderField("paperSize", e.target.value as BuilderData["paperSize"])}>
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="LETTER">US Letter (8.5 × 11 in)</option>
                </Select>
              </Field>
              <Field label="Typography">
                <Select value={builder.typography} onChange={(e) => setBuilderField("typography", e.target.value as BuilderData["typography"])}>
                  <option value="sans">Modern sans-serif</option>
                  <option value="serif">Classic serif</option>
                  <option value="mono">Monospaced</option>
                </Select>
              </Field>
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={() => setCancelOpen(true)}>Cancel</Button>
            <Button type="submit" loading={submitting}>
              {savedInvoice ? "Save changes" : "Create invoice"}
            </Button>
          </div>
        </form>

        {/* ------------------------------- PREVIEW ------------------------------ */}
        <aside className="hidden lg:block">
          <div className="sticky top-4">{previewPanel}</div>
        </aside>
      </div>

      {/* ------------------------------- DIALOGS ------------------------------- */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="PDF preview" description="This is the exact document your customer will receive." className="max-w-6xl">
        <div ref={pdfFrameRef} className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute right-2 top-2 z-10"
            onClick={() => void pdfFrameRef.current?.requestFullscreen?.()}
          >
            <Maximize2 className="size-3.5" /> Full screen
          </Button>
          {previewUrl ? <PdfFrame src={previewUrl} className="h-[75vh]" /> : <Spinner />}
        </div>
      </Dialog>

      <Dialog open={mobilePreview} onClose={() => setMobilePreview(false)} title="Invoice preview" className="max-w-3xl">
        <div className="max-h-[75vh] overflow-y-auto bg-neutral-50 p-3"><InvoiceDesignPreview {...previewProps} /></div>
      </Dialog>

      <Dialog open={quickClientOpen} onClose={() => setQuickClientOpen(false)} title="Add customer" description="Create a customer and select it on this invoice.">
        <form onSubmit={createQuickClient} className="space-y-3">
          <Field label="Name" required><Input value={quickClient.name} onChange={(e) => setQuickClient({ ...quickClient, name: e.target.value })} required /></Field>
          <Field label="Email"><Input type="email" value={quickClient.email} onChange={(e) => setQuickClient({ ...quickClient, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={quickClient.phone} onChange={(e) => setQuickClient({ ...quickClient, phone: e.target.value })} /></Field>
          <Field label="Address"><Textarea rows={2} value={quickClient.address} onChange={(e) => setQuickClient({ ...quickClient, address: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setQuickClientOpen(false)}>Cancel</Button>
            <Button type="submit" loading={creatingClient}>Add customer</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={dirty ? "Discard changes?" : "Leave the invoice builder?"} description={dirty ? "Your unsaved changes will be lost." : undefined}>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>Stay</Button>
          <Button type="button" variant="destructive" onClick={() => navigate("/dashboard/invoices")}>Discard & leave</Button>
        </div>
      </Dialog>

      <Dialog open={showSavedDialog && Boolean(savedInvoice)} onClose={() => setShowSavedDialog(false)} title="Invoice saved" description={`Invoice ${savedInvoice?.number || ""} is ready.`}>
        <div className="space-y-3">
          <p className="break-all rounded-lg bg-muted p-3 text-xs">{savedInvoice?.permalink}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { void navigator.clipboard?.writeText(savedInvoice?.permalink || ""); toast.success("Link copied"); }}>
              <Copy className="size-3.5" /> Copy payment link
            </Button>
            <a href={savedInvoice?.permalink || "#"} target="_blank" rel="noreferrer">
              <Button type="button" variant="outline"><ArrowUp className="size-3.5" /> Open payment page</Button>
            </a>
            <Button type="button" onClick={() => navigate(`/dashboard/invoices/${savedInvoice?.id}`)}>View invoice</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
