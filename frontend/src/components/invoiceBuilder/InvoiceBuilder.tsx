import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Lock,
  Maximize2,
  Paperclip,
  Plus,
  Search,
  Send,
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
import { DEFAULT_INVOICE_DESIGN, LAYOUT_LABEL, normalizeInvoiceDesign } from "@/lib/invoiceDesign";
import {
  computeBuilderTotals,
  DEFAULT_BUILDER_DATA,
  lineTotal,
  newItem,
  normalizeBuilderData,
  withIds,
} from "@/lib/invoiceBuilder";
import type { BuilderData, Invoice, InvoiceDesign, InvoiceItem } from "@/types";
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
import { InvoiceDesignPreview, type EditablePreviewField, type InvoicePreviewEditor } from "@/components/invoiceDesign/InvoiceDesignPreview";

const CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"];

const STEPS = [
  { label: "Invoice", hint: "Details & branding" },
  { label: "Customer", hint: "Who you're billing" },
  { label: "Items", hint: "Products & services" },
  { label: "Summary", hint: "Totals & adjustments" },
  { label: "Payment", hint: "Terms & instructions" },
  { label: "Additional Details", hint: "Notes & attachments" },
  { label: "Design", hint: "Template & colours" },
];

function StepNav({
  active,
  completed,
  onSelect,
}: {
  active: number;
  completed: number[];
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-sm" aria-label="Invoice steps">
      {STEPS.map((step, index) => {
        const isActive = index === active;
        const isDone = index < active || completed.includes(index);
        return (
          <button
            key={step.label}
            type="button"
            onClick={() => onSelect(index)}
            title={step.hint}
            className={cn(
              "flex min-w-[130px] flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left transition-all",
              isActive ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                isActive ? "bg-primary-foreground/20 text-primary-foreground" : isDone ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {isDone && !isActive ? <Check className="size-3" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className={cn("block truncate text-xs font-semibold", isActive ? "text-primary-foreground" : "text-foreground")}>{step.label}</span>
              <span className={cn("hidden truncate text-[10px] xl:block", isActive ? "text-primary-foreground/70" : "text-muted-foreground")}>{step.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", strong && "font-semibold")}>
      <span className={cn("text-xs", muted ? "text-muted-foreground" : "text-foreground")}>{label}</span>
      <span className={cn("tabular-nums", strong ? "text-base" : "text-sm")}>{value}</span>
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
    number: "",
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

  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  const [clientSearch, setClientSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClient, setQuickClient] = useState({ name: "", email: "", phone: "", address: "" });
  const [editCustomer, setEditCustomer] = useState(false);
  const [expandedItemNotes, setExpandedItemNotes] = useState<Record<string, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandOpen, setExpandOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const lastSavedRef = useRef("");
  const attachmentRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");
  const pdfFrameRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------ */
  /* Hydration & lifecycle                                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!invoiceData) return;
    const inv = invoiceData.data;
    setForm({
      clientId: inv.clientId,
      brandId: inv.brandId || "",
      number: inv.number,
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
    setForm((f) => ({ ...f, clientId, ...(c && !builder.billingAddress ? { brandId: f.brandId || c.brandId || "" } : {}) }));
    if (c && !builder.billingAddress) setBuilder((b) => ({ ...b, billingAddress: c.address || "" }));
    setPickerOpen(false);
    setClientSearch("");
    setDirty(true);
  };

  const goToStep = (index: number) => {
    setActiveStep(Math.max(0, Math.min(STEPS.length - 1, index)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goNext = () => {
    setCompletedSteps((prev) => [...new Set([...prev, activeStep])]);
    goToStep(activeStep + 1);
  };

  /* ------------------------------------------------------------------ */
  /* Items                                                               */
  /* ------------------------------------------------------------------ */

  const updateItem = (index: number, patch: Partial<InvoiceItem>) => {
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addItem = () => { setItems((rows) => [...rows, newItem()]); setDirty(true); };
  const duplicateItem = (index: number) => {
    setItems((rows) => {
      const copy = { ...rows[index], id: newItem().id };
      return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
    });
    setDirty(true);
  };
  const removeItem = (index: number) => {
    setItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
    setDirty(true);
  };
  const moveItem = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setItems((rows) => {
      const next = [...rows];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  };

  /* ------------------------------------------------------------------ */
  /* Payload, validation & actions                                      */
  /* ------------------------------------------------------------------ */

  const payload = () => ({
    clientId: form.clientId,
    brandId: form.brandId || undefined,
    ...(savedInvoice && form.number ? { number: form.number } : {}),
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

  // Inline preview edits auto-save to the saved invoice (silent, debounced).
  // New invoices are saved explicitly via "Save Invoice" first.
  const payloadSnapshot = JSON.stringify(payload());
  useEffect(() => {
    if (!savedInvoice) return;
    if (!lastSavedRef.current) { lastSavedRef.current = payloadSnapshot; return; }
    if (payloadSnapshot === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      if (submittingRef.current || !savedInvoice) return;
      updateInvoice({ id: savedInvoice.id, body: JSON.parse(payloadSnapshot) })
        .unwrap()
        .then((res) => {
          lastSavedRef.current = payloadSnapshot;
          setSavedInvoice(res.data);
          setDirty(false);
        })
        .catch(() => { /* keep local edits; user can retry with Save Invoice */ });
    }, 900);
    return () => clearTimeout(timer);
  }, [payloadSnapshot, savedInvoice, updateInvoice]);

  const validate = () => {
    if (!form.clientId) { toast.error("Select a customer"); goToStep(1); return false; }
    if (!form.brandId) { toast.error("Select a company / brand"); goToStep(0); return false; }
    if (!items.length) { toast.error("Add at least one line item"); goToStep(2); return false; }
    if (items.some((i) => !stripTags(i.description))) { toast.error("Every item needs a description"); goToStep(2); return false; }
    if (items.some((i) => Number(i.quantity) <= 0)) { toast.error("Item quantities must be greater than zero"); goToStep(2); return false; }
    if (items.some((i) => Number(i.unitPrice) < 0)) { toast.error("Unit prices cannot be negative"); goToStep(2); return false; }
    if (!form.issueDate) { toast.error("Choose an issue date"); goToStep(0); return false; }
    return true;
  };

  const save = async (sendAfter = false): Promise<Invoice | null> => {
    if (savedInvoice?.status === "PAID") { toast.error("Paid invoices cannot be edited"); return null; }
    if (!validate() || submittingRef.current) return null;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = savedInvoice
        ? (await updateInvoice({ id: savedInvoice.id, body: payload() }).unwrap()).data
        : (await createInvoice(payload()).unwrap()).data;
      setSavedInvoice(result);
      setDirty(false);
      lastSavedRef.current = JSON.stringify(payload());
      setShowSavedDialog(true);
      window.history.replaceState({}, "", `/dashboard/invoices/update/${result.id}`);
      if (sendAfter) {
        await sendInvoice(result.id).unwrap();
        toast.success("Invoice saved and sent to the customer");
      } else {
        toast.success(isEdit ? "Invoice updated" : "Invoice saved");
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

  const onPreviewField = (field: EditablePreviewField, value: string) => {
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
    }
  };
  const previewEditor: InvoicePreviewEditor = {
    onField: onPreviewField,
    onItem: (index, field, value) => {
      if (field === "description") return updateItem(index, { description: value });
      if (field === "quantity") return updateItem(index, { quantity: Number(value) || 0 });
      if (field === "unitPrice") return updateItem(index, { unitPrice: Number(value) || 0 });
      return updateItem(index, { discount: Math.max(0, Number(value) || 0) });
    },
    onAddItem: addItem,
    onRemoveItem: removeItem,
  };

  const previewProps = {
    design: effectiveDesign,
    logoUrl: selectedBrand?.logoUrl,
    businessName: builder.businessName || selectedBrand?.businessName || selectedBrand?.name || "Your Company",
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
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    totalAmount: totals.total,
    shipping: totals.shipping,
    paymentInstructions: builder.paymentInstructions,
    terms: builder.terms,
    editor: previewEditor,
  };

  const previewPanel = (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Live preview</p>
          <p className="text-[11px] text-muted-foreground">Updates as you type</p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpandOpen(true)} title="Expand preview">
            <Maximize2 className="size-3.5" /> <span className="hidden sm:inline">Expand</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openPdfPreview} loading={previewing}>
            <FileText className="size-3.5" /> PDF
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={downloadPdf} title="Download PDF">
            <ArrowDownToLine className="size-4" />
          </Button>
        </div>
      </div>
      <div className="max-h-[calc(100vh-11rem)] overflow-y-auto bg-neutral-50 p-4">
        <InvoiceDesignPreview {...previewProps} />
        <p className="mt-3 px-1 text-[10px] text-muted-foreground">
          The PDF shows the exact document, including all pages. Internal notes are never shown to customers.
        </p>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (activeStep) {
      /* ---------------- 1. Invoice ---------------- */
      case 0:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Invoice details</h2>
              <p className="mt-1 text-xs text-muted-foreground">Choose the company and set the dates for this invoice.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company / brand" required hint="Its logo, colours and payment details are used automatically">
                <Select value={form.brandId} onChange={(e) => changeBrand(e.target.value)} required>
                  <option value="" disabled>Select a company</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Invoice number" hint="Generated automatically — never changed">
                <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium">
                  {form.number || savedInvoice?.number || <span className="text-muted-foreground">Generated on save</span>}
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
            </div>
            {selectedBrand && (
              <Group title="Brand identity" description="Saved with this company and applied to the invoice design.">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5">
                    <img src={selectedBrand.logoUrl || undefined} alt={selectedBrand.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="text-sm font-semibold">{selectedBrand.businessName || selectedBrand.name}</p>
                    {selectedBrand.address && <p className="mt-1 whitespace-pre-line text-muted-foreground">{selectedBrand.address}</p>}
                    <p className="text-muted-foreground">{[selectedBrand.email, selectedBrand.phone, selectedBrand.website].filter(Boolean).join("  ·  ")}</p>
                    <p className="mt-2 text-muted-foreground">
                      Saved design: <span className="font-medium text-foreground">{LAYOUT_LABEL[effectiveDesign.layout]}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["primary", "secondary", "accent", "supporting"] as const).map((role) => (
                      <span key={role} className="size-6 rounded-full border border-black/10 shadow-sm" style={{ background: effectiveDesign.colors[role] }} title={`${role}: ${effectiveDesign.colors[role]}`} />
                    ))}
                  </div>
                </div>
              </Group>
            )}
          </div>
        );

      /* ---------------- 2. Customer ---------------- */
      case 1:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Customer</h2>
              <p className="mt-1 text-xs text-muted-foreground">Search an existing customer or add a new one.</p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <div className="relative min-w-[240px] flex-1">
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
                    <button type="button" onClick={() => { set("clientId", ""); setClientSearch(""); }} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
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
                        className={cn("flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs hover:bg-muted", c.id === form.clientId && "bg-primary/5")}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="truncate text-muted-foreground">{c.email || ""}</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => { setPickerOpen(false); setQuickClientOpen(true); }} className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-3 py-2 text-xs font-medium text-primary hover:bg-muted">
                      <UserPlus className="size-3.5" /> Add New Customer
                    </button>
                  </div>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setQuickClientOpen(true)}><UserPlus className="size-3.5" /> New</Button>
            </div>
            {selectedClient ? (
              <Group
                title="Selected customer"
                description="Billing and shipping details for this invoice."
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{selectedClient.name}</p>
                    <p className="text-xs text-muted-foreground">{[selectedClient.email, selectedClient.phone].filter(Boolean).join("  ·  ")}</p>
                    {builder.customerCompany && <p className="text-xs text-muted-foreground">{builder.customerCompany}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditCustomer((v) => !v)}>
                    {editCustomer ? "Done" : "Edit Customer Details"}
                  </Button>
                </div>
                {editCustomer && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    <Field label="Company name"><Input value={builder.customerCompany} onChange={(e) => setBuilderField("customerCompany", e.target.value)} placeholder={selectedClient.name} /></Field>
                    <Field label="Tax identification number"><Input value={builder.customerTaxId} onChange={(e) => setBuilderField("customerTaxId", e.target.value)} placeholder="Optional" /></Field>
                    <Field label="Billing address"><Textarea rows={3} value={builder.billingAddress || selectedClient.address || ""} onChange={(e) => setBuilderField("billingAddress", e.target.value)} placeholder="Street, city, state, postcode" /></Field>
                    <Field label="Shipping address"><Textarea rows={3} value={builder.shippingAddress} onChange={(e) => setBuilderField("shippingAddress", e.target.value)} placeholder="Optional" /></Field>
                  </div>
                )}
              </Group>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
                No customer selected yet.
              </div>
            )}
          </div>
        );

      /* ---------------- 3. Items ---------------- */
      case 2:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Invoice items</h2>
              <p className="mt-1 text-xs text-muted-foreground">Drag rows to reorder. Every amount recalculates instantly.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2 text-left">Description</th>
                    <th className="w-16 px-2 py-2 text-right">Qty</th>
                    <th className="w-28 px-2 py-2 text-right">Unit price</th>
                    <th className="w-24 px-2 py-2 text-right">Discount</th>
                    <th className="w-20 px-2 py-2 text-right">Tax %</th>
                    <th className="w-24 px-2 py-2 text-right">Total</th>
                    <th className="w-20 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, index) => {
                    const itemId = item.id || `row-${index}`;
                    return (
                      <tr
                        key={itemId}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { if (dragIndex !== null) moveItem(dragIndex, index); setDragIndex(null); }}
                        onDragEnd={() => setDragIndex(null)}
                        className={cn("align-top", dragIndex === index ? "opacity-50" : "hover:bg-muted/20")}
                      >
                        <td className="px-2 py-3"><GripVertical className="size-4 cursor-grab text-muted-foreground" aria-label="Drag to reorder" /></td>
                        <td className="px-2 py-3">
                          <RichTextEditor value={item.description} onChange={(html) => updateItem(index, { description: html })} placeholder="What did you provide?" minHeight="44px" />
                          <div className="mt-1 flex items-center gap-2">
                            <button type="button" className="text-[10px] font-medium text-primary underline" onClick={() => setExpandedItemNotes((s) => ({ ...s, [itemId]: !s[itemId] }))}>
                              {expandedItemNotes[itemId] ? "Hide note" : "Item note"}
                            </button>
                            <button type="button" className="text-[10px] font-medium text-primary underline" onClick={() => duplicateItem(index)}>Duplicate</button>
                          </div>
                          {expandedItemNotes[itemId] && (
                            <Textarea className="mt-2" rows={2} value={item.notes || ""} onChange={(e) => updateItem(index, { notes: e.target.value })} placeholder="Note for this line (not printed)" />
                          )}
                        </td>
                        <td className="px-2 py-3"><Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} aria-label="Quantity" /></td>
                        <td className="px-2 py-3"><Input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })} aria-label="Unit price" /></td>
                        <td className="px-2 py-3"><Input type="number" min={0} step="0.01" value={item.discount ?? 0} onChange={(e) => updateItem(index, { discount: Number(e.target.value) })} aria-label="Line discount" /></td>
                        <td className="px-2 py-3">
                          <Input
                            type="number" min={0} max={100} step="0.01"
                            value={item.taxRate ?? ""}
                            onChange={(e) => updateItem(index, { taxRate: e.target.value === "" ? undefined : Number(e.target.value) })}
                            placeholder={String(form.taxRate)} aria-label="Line tax percent"
                          />
                        </td>
                        <td className="px-2 py-3 text-right font-semibold tabular-nums">{money(lineTotal(item), form.currency)}</td>
                        <td className="px-2 py-3 text-right">
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length === 1} aria-label="Remove item">
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="size-4" /> Add Item</Button>
          </div>
        );

      /* ---------------- 4. Summary ---------------- */
      case 3:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Financial summary</h2>
              <p className="mt-1 text-xs text-muted-foreground">Adjustments apply instantly to the total and preview.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tax rate (%)" hint="Default for lines without their own rate">
                <Input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => set("taxRate", Number(e.target.value))} />
              </Field>
              <Field label="Overall discount">
                <Input type="number" min={0} step="0.01" value={form.discountAmount} onChange={(e) => set("discountAmount", Number(e.target.value))} />
              </Field>
              <Field label="Shipping / additional">
                <Input type="number" min={0} step="0.01" value={builder.shipping} onChange={(e) => setBuilderField("shipping", Number(e.target.value))} />
              </Field>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-5">
              <div className="space-y-2">
                <SummaryRow label="Subtotal" value={money(totals.subtotal, form.currency)} />
                {totals.itemDiscounts > 0 && <SummaryRow label="Item discounts" value={`- ${money(totals.itemDiscounts, form.currency)}`} muted />}
                <SummaryRow label="Tax" value={money(totals.taxAmount, form.currency)} />
                {totals.discountAmount > 0 && <SummaryRow label="Overall discount" value={`- ${money(totals.discountAmount, form.currency)}`} muted />}
                {totals.shipping > 0 && <SummaryRow label="Shipping / additional charges" value={money(totals.shipping, form.currency)} />}
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                <span className="text-xs font-bold uppercase tracking-wide">Total</span>
                <span className="text-2xl font-extrabold tracking-tight tabular-nums">{money(totals.total, form.currency)}</span>
              </div>
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <SummaryRow label="Amount paid" value={money(amountPaid, form.currency)} muted />
                <SummaryRow label="Remaining balance" value={money(balance, form.currency)} strong />
              </div>
            </div>
          </div>
        );

      /* ---------------- 5. Payment ---------------- */
      case 4:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Payment</h2>
              <p className="mt-1 text-xs text-muted-foreground">Tell the customer how and when to pay.</p>
            </div>
            <Group title="Payment methods" description="Card payments use the brand's Square connection.">
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
                <Lock className="size-3.5 text-success" />
                Secure card payment{selectedBrand?.paymentEnabled === false ? " (currently disabled)" : " via Square"}
              </div>
              <div className="mt-3">
                <Field label="Deposit requirement">
                  <Select value={builder.depositRequired ? "yes" : "no"} onChange={(e) => setBuilderField("depositRequired", e.target.value === "yes")}>
                    <option value="no">No deposit required</option>
                    <option value="yes">Deposit required before work begins</option>
                  </Select>
                </Field>
              </div>
            </Group>
            <Group title="Terms & instructions" description="Shown on the client page, PDF and email.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Payment terms" hint="e.g. Net 14, due on receipt">
                  <Input value={builder.paymentTerms} onChange={(e) => setBuilderField("paymentTerms", e.target.value)} placeholder="Payment is due within 14 days" />
                </Field>
                <Field label="Payment instructions" hint="Bank details, reference, etc.">
                  <Input value={builder.paymentInstructions} onChange={(e) => setBuilderField("paymentInstructions", e.target.value)} placeholder="Pay via bank transfer…" />
                </Field>
              </div>
            </Group>
          </div>
        );

      /* ---------------- 6. Additional details ---------------- */
      case 5:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Additional details</h2>
              <p className="mt-1 text-xs text-muted-foreground">Keep customer-facing information separate from internal notes.</p>
            </div>
            <Group title="Customer-facing" description="Printed on the invoice and shown on the payment page.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer notes"><Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Thank you for your business…" /></Field>
                <Field label="Terms & conditions"><Textarea rows={3} value={builder.terms} onChange={(e) => setBuilderField("terms", e.target.value)} placeholder="Late payments may incur…" /></Field>
              </div>
            </Group>
            <Group title="Internal only" description="Never displayed on customer PDFs or payment pages.">
              <Field label="Internal notes"><Textarea rows={2} value={builder.internalNotes} onChange={(e) => setBuilderField("internalNotes", e.target.value)} placeholder="e.g. Follow up next week" /></Field>
            </Group>
            <Group title={`Attachments (${builder.attachments.length})`} description="Images up to 10 MB each.">
              <div className="flex flex-wrap gap-2">
                {builder.attachments.map((a) => (
                  <span key={a.url} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
                    <Paperclip className="size-3.5" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="max-w-[180px] truncate hover:underline">{a.name}</a>
                    <button type="button" onClick={() => setBuilderField("attachments", builder.attachments.filter((x) => x.url !== a.url))} className="text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
                  </span>
                ))}
                <input ref={attachmentRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void addAttachment(e.target.files?.[0]); e.target.value = ""; }} />
                <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => attachmentRef.current?.click()}><Paperclip className="size-3.5" /> Attach image</Button>
              </div>
            </Group>
          </div>
        );

      /* ---------------- 7. Design ---------------- */
      case 6:
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Design & branding</h2>
                <p className="mt-1 text-xs text-muted-foreground">Choose a template and colours. The preview updates immediately.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setDesignOverride(null); setDesignTouched(true); setDirty(true); }}
              >
                Reset to Brand Defaults
              </Button>
            </div>
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
            <Group title="Document settings" description="Used for the downloadable PDF.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Paper size">
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
            </Group>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* -------------------------- TOP TOOLBAR -------------------------- */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/dashboard/invoices")}>
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{savedInvoice?.number || "New Invoice"}</p>
            <p className="text-[10px] text-muted-foreground">{isEdit ? "Edit invoice" : "Create invoice"}</p>
          </div>
          <div className="ml-2"><StatusBadge status={savedInvoice ? savedInvoice.displayStatus || savedInvoice.status : "DRAFT"} /></div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={openPdfPreview} loading={previewing}>
              <FileText className="size-3.5" /> PDF
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setExpandOpen(true)} className="hidden lg:inline-flex">
              <Eye className="size-3.5" /> Preview
            </Button>
            <Button type="button" variant="secondary" size="sm" className="lg:hidden" onClick={() => setMobileTab((t) => (t === "edit" ? "preview" : "edit"))}>
              <Eye className="size-3.5" /> {mobileTab === "edit" ? "Preview" : "Edit"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-8">
        <StepNav active={activeStep} completed={completedSteps} onSelect={goToStep} />

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
          {/* -------------------------- EDITOR -------------------------- */}
          <div className={cn("min-w-0", mobileTab === "preview" && "hidden lg:block")}>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all sm:p-6">
              {renderStep()}
            </div>

            <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(activeStep - 1)} disabled={activeStep === 0}>
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <span className="px-1 text-[11px] text-muted-foreground">Step {activeStep + 1} of {STEPS.length}</span>
                <Button type="button" variant="ghost" size="sm" onClick={goNext} disabled={activeStep === STEPS.length - 1}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>Cancel</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void save(false)} loading={submitting}>
                  <Check className="size-3.5" /> Save Invoice
                </Button>
                <Button type="button" size="sm" onClick={() => void save(true)} loading={submitting || sending} disabled={savedInvoice?.status === "PAID"}>
                  <Send className="size-3.5" /> Send Invoice
                </Button>
              </div>
            </div>
          </div>

          {/* -------------------------- PREVIEW -------------------------- */}
          <aside className={cn("hidden lg:block", mobileTab === "preview" && "!block")}>
            <div className="sticky top-20">{previewPanel}</div>
          </aside>
        </div>
      </div>

      {/* -------------------------- DIALOGS -------------------------- */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="PDF preview" description="The exact document your customer will receive." className="max-w-6xl">
        <div ref={pdfFrameRef} className="relative">
          <Button type="button" variant="outline" size="sm" className="absolute right-2 top-2 z-10" onClick={() => void pdfFrameRef.current?.requestFullscreen?.()}>
            <Maximize2 className="size-3.5" /> Full screen
          </Button>
          {previewUrl ? <PdfFrame src={previewUrl} className="h-[75vh]" /> : <Spinner />}
        </div>
      </Dialog>

      <Dialog open={expandOpen} onClose={() => setExpandOpen(false)} title="Invoice preview" description="How the invoice looks to your customer." className="max-w-5xl">
        <div className="max-h-[75vh] overflow-y-auto bg-neutral-50 p-4">
          <InvoiceDesignPreview {...previewProps} />
        </div>
      </Dialog>

      <Dialog open={quickClientOpen} onClose={() => setQuickClientOpen(false)} title="Add New Customer" description="Create a customer and select it on this invoice.">
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
