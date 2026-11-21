import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  Check,
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
import AssetImage from "@/components/AssetImage";
import { RichTextEditor } from "@/components/ui/richText";
import { PdfFrame } from "@/components/PdfFrame";
import { InvoiceDesignEditor } from "@/components/invoiceDesign/InvoiceDesignEditor";
import { InvoiceDesignPreview, type EditablePreviewField, type InvoicePreviewEditor } from "@/components/invoiceDesign/InvoiceDesignPreview";
import { FitInvoicePage } from "@/components/invoiceDesign/FitInvoicePage";

const CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"];

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
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

/**
 * Single-page invoice editor. Every section stays on this page; the right
 * column is the live document and the exact PDF, with no step navigation.
 */
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

  const [clientSearch, setClientSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClient, setQuickClient] = useState({ name: "", email: "", phone: "", address: "" });
  const [expandedItemNotes, setExpandedItemNotes] = useState<Record<string, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [pdfMode, setPdfMode] = useState<"live" | "pdf">("live");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandOpen, setExpandOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submittingRef = useRef(false);
  const lastSavedRef = useRef("");
  const attachmentRef = useRef<HTMLInputElement>(null);
  const pdfUrlRef = useRef("");
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

  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

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
  const businessName = builder.businessName || selectedBrand?.businessName || selectedBrand?.name || "Your Company";
  const contactLine = [selectedBrand?.email, selectedBrand?.phone, selectedBrand?.website].filter(Boolean).join("  ·  ");
  const footerText = selectedBrand?.pdfFooter?.trim() || `Thank you for your business. ${businessName}`;
  const pageWidthMm = builder.paperSize === "LETTER" ? 215.9 : 210;
  const pageLabel = builder.paperSize === "LETTER" ? "Letter · 215.9 × 279.4 mm" : "A4 · 210 × 297 mm";

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

  const startNewInvoice = () => {
    if (dirty && !window.confirm("Discard unsaved changes and start a new invoice?")) return;
    setSavedInvoice(null);
    setForm({
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
    setItems([newItem()]);
    setBuilder(DEFAULT_BUILDER_DATA);
    setDesignOverride(null);
    setDesignTouched(false);
    setExpandedItemNotes({});
    setDirty(false);
    setShowSavedDialog(false);
    lastSavedRef.current = "";
    navigate("/dashboard/invoices/add");
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

  const payloadSnapshot = JSON.stringify(payload());

  const validationError = () => {
    if (!form.clientId) return "Select a customer";
    if (!form.brandId) return "Select a company / brand";
    if (!items.length) return "Add at least one line item";
    if (items.some((i) => !stripTags(i.description))) return "Every item needs a description";
    if (items.some((i) => Number(i.quantity) <= 0)) return "Item quantities must be greater than zero";
    if (items.some((i) => Number(i.unitPrice) < 0)) return "Unit prices cannot be negative";
    if (!form.issueDate) return "Choose an issue date";
    return "";
  };
  const validate = () => {
    const problem = validationError();
    if (problem) { toast.error(problem); return false; }
    return true;
  };

  // Edits to a saved invoice auto-save quietly; new invoices save explicitly.
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
      lastSavedRef.current = "";
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

  const generatePdfPreview = async (body: unknown) => {
    const res = await api.post("/invoices/preview-pdf", body, { responseType: "blob" });
    const next = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = next;
    setPdfUrl(next);
  };

  // The PDF tab is auto-refreshed from the current editor values, so every
  // page of the document stays accurate without leaving this screen.
  useEffect(() => {
    if (pdfMode !== "pdf" || validationError()) return;
    const timer = setTimeout(() => {
      void generatePdfPreview(JSON.parse(payloadSnapshot)).catch(() => { /* silent in background */ });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadSnapshot, pdfMode]);

  const openPdfPreview = async () => {
    if (!validate()) return;
    setPdfGenerating(true);
    try {
      await generatePdfPreview(JSON.parse(payloadSnapshot));
      setPreviewOpen(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPdfGenerating(false);
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
      setBuilderField("attachments", [...builder.attachments, { name: file.name, url: res.data.url }].slice(0, 10));
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

  /* ------------------------------------------------------------------ */
  /* Direct editing in the live document                                 */
  /* ------------------------------------------------------------------ */

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
      if (field === "description") return updateItem(index, { description: value });
      const amount = field === "quantity" ? Number(value) || 0 : Math.max(0, Number(value) || 0);
      return updateItem(index, { [field]: amount });
    },
    onAddItem: addItem,
    onRemoveItem: removeItem,
  };

  const previewProps = {
    design: effectiveDesign,
    paperSize: builder.paperSize,
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
    contactLine,
    brandAddress: selectedBrand?.address || "",
    brandHeader: selectedBrand?.pdfHeader || "",
    footerText,
    paymentInstructions: builder.paymentInstructions,
    terms: builder.terms,
    editor: previewEditor,
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  const previewPanel = (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Live PDF preview</p>
          <p className="text-[11px] text-muted-foreground">Click any text in the document to edit it</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            {(["live", "pdf"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPdfMode(mode)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                  pdfMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode === "live" ? "Live" : "PDF pages"}
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setExpandOpen(true)} title="Expand preview">
            <Maximize2 className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={downloadPdf} title="Download PDF">
            <ArrowDownToLine className="size-4" />
          </Button>
        </div>
      </div>
      <div className="max-h-[calc(100vh-11.5rem)] overflow-y-auto bg-neutral-50 p-3 sm:p-4">
        {pdfMode === "live" ? (
          <FitInvoicePage widthMm={pageWidthMm} className="mx-auto">
            <InvoiceDesignPreview {...previewProps} className="!shadow-none" />
          </FitInvoicePage>
        ) : pdfUrl ? (
          <PdfFrame src={pdfUrl} paperSize={builder.paperSize} className="h-[calc(100vh-14rem)] min-h-[520px] border-0 bg-transparent" />
        ) : (
          <div className="flex h-[520px] items-center justify-center"><Spinner /></div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border bg-card px-4 py-2 text-[10px] text-muted-foreground">
        <span>{pdfMode === "live" ? "Instant document preview" : "Exact paginated PDF, auto-refreshed"}</span>
        <span className="font-medium text-foreground/70">{pageLabel}</span>
        <span className="hidden sm:inline">Internal notes are never printed</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* -------------------------- TOP ACTIONS -------------------------- */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4 lg:px-6">
          <Button type="button" variant="ghost" size="sm" onClick={() => (dirty ? setCancelOpen(true) : navigate("/dashboard/invoices"))}>
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={startNewInvoice}>
            <Plus className="size-4" /> <span className="hidden sm:inline">New Invoice</span>
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{savedInvoice?.number || "New Invoice"}</p>
            <p className="text-[10px] text-muted-foreground">{isEdit ? "Edit invoice" : "Create invoice"}</p>
          </div>
          <div className="ml-2 flex items-center gap-1.5">
            <StatusBadge status={savedInvoice ? savedInvoice.displayStatus || savedInvoice.status : "DRAFT"} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {savedInvoice ? "Saved" : "Draft"}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={openPdfPreview} loading={pdfGenerating} aria-label="PDF preview">
              <FileText className="size-3.5" /> <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setExpandOpen(true)} aria-label="Preview invoice">
              <Eye className="size-3.5" /> <span className="hidden sm:inline">Preview</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void save(false)} loading={submitting} aria-label="Save invoice">
              <Check className="size-3.5" /> <span className="hidden sm:inline">Save Invoice</span>
            </Button>
            <Button type="button" size="sm" onClick={() => void save(true)} loading={submitting || sending} disabled={savedInvoice?.status === "PAID"} aria-label="Send invoice">
              <Send className="size-3.5" /> <span className="hidden sm:inline">Send Invoice</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-4 lg:px-6">
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,830px)]">
          {/* -------------------------- EDITOR -------------------------- */}
          <div className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <h1 className="text-lg font-semibold tracking-tight">Invoice editor</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a brand, then edit anywhere on this page or directly on the document. Everything updates the preview instantly.
                </p>
              </div>

              <div className="space-y-4">
                <Group title="Company / brand" description="Its saved logo, colours, company details and payment details are applied automatically.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Company / brand" required>
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
                    <div className="mt-4 flex flex-wrap items-start gap-4 rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex size-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1">
                        <AssetImage
                          src={selectedBrand.logoUrl}
                          alt={selectedBrand.name}
                          className="max-h-full max-w-full object-contain"
                          fallback={<span className="text-xs font-bold">{selectedBrand.name.slice(0, 2).toUpperCase()}</span>}
                        />
                      </div>
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="text-sm font-semibold">{selectedBrand.businessName || selectedBrand.name}</p>
                        {selectedBrand.address && <p className="mt-1 whitespace-pre-line text-muted-foreground">{selectedBrand.address}</p>}
                        <p className="text-muted-foreground">{[selectedBrand.email, selectedBrand.phone, selectedBrand.website].filter(Boolean).join("  ·  ")}</p>
                        <p className="mt-2 text-muted-foreground">
                          Invoice style: <span className="font-medium text-foreground">{LAYOUT_LABEL[effectiveDesign.layout]}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(["primary", "secondary", "accent", "supporting"] as const).map((role) => (
                          <span key={role} className="size-6 rounded-full border border-black/10 shadow-sm" style={{ background: effectiveDesign.colors[role] }} title={`${role}: ${effectiveDesign.colors[role]}`} />
                        ))}
                      </div>
                    </div>
                  )}
                </Group>

                <Group title="Customer details" description="Search an existing customer or add a new one. All fields below can be edited for this invoice only.">
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
                        <ChevronDownIcon />
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
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Customer display name">
                      <Input value={builder.clientName || selectedClient?.name || ""} onChange={(e) => setBuilderField("clientName", e.target.value)} placeholder="Name shown on the invoice" />
                    </Field>
                    <Field label="Customer email">
                      <Input type="email" value={builder.customerEmail || selectedClient?.email || ""} onChange={(e) => setBuilderField("customerEmail", e.target.value)} placeholder="name@example.com" />
                    </Field>
                    <Field label="Company name">
                      <Input value={builder.customerCompany} onChange={(e) => setBuilderField("customerCompany", e.target.value)} placeholder="Optional" />
                    </Field>
                    <Field label="Tax identification number">
                      <Input value={builder.customerTaxId} onChange={(e) => setBuilderField("customerTaxId", e.target.value)} placeholder="Optional" />
                    </Field>
                    <Field label="Billing address">
                      <Textarea rows={2} value={builder.billingAddress || selectedClient?.address || ""} onChange={(e) => setBuilderField("billingAddress", e.target.value)} placeholder="Street, city, state, postcode" />
                    </Field>
                    <Field label="Shipping address">
                      <Textarea rows={2} value={builder.shippingAddress} onChange={(e) => setBuilderField("shippingAddress", e.target.value)} placeholder="Optional" />
                    </Field>
                  </div>
                </Group>

                <Group title="Products & services" description="Drag rows to reorder. Amounts recalculate instantly and flow into the preview.">
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          <th className="w-8 px-2 py-2" />
                          <th className="px-2 py-2 text-left">Description</th>
                          <th className="w-20 px-2 py-2 text-right">Qty</th>
                          <th className="w-28 px-2 py-2 text-right">Unit price</th>
                          <th className="w-24 px-2 py-2 text-right">Discount</th>
                          <th className="w-20 px-2 py-2 text-right">Tax %</th>
                          <th className="w-24 px-2 py-2 text-right">Total</th>
                          <th className="w-10 px-2 py-2" />
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
                                <RichTextEditor value={item.description} onChange={(html) => updateItem(index, { description: html })} placeholder="What did you provide?" minHeight="40px" />
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
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addItem}><Plus className="size-4" /> Add Item</Button>
                </Group>

                <Group title="Totals & adjustments" description="Tax, discount and shipping apply instantly to the document and PDF.">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Tax rate (%)">
                      <Input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => set("taxRate", Number(e.target.value))} />
                    </Field>
                    <Field label="Overall discount">
                      <Input type="number" min={0} step="0.01" value={form.discountAmount} onChange={(e) => set("discountAmount", Number(e.target.value))} />
                    </Field>
                    <Field label="Shipping / additional">
                      <Input type="number" min={0} step="0.01" value={builder.shipping} onChange={(e) => setBuilderField("shipping", Number(e.target.value))} />
                    </Field>
                  </div>
                  <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
                    <div className="space-y-2">
                      <SummaryRow label="Subtotal" value={money(totals.subtotal, form.currency)} />
                      {totals.itemDiscounts > 0 && <SummaryRow label="Item discounts" value={`- ${money(totals.itemDiscounts, form.currency)}`} muted />}
                      <SummaryRow label="Tax" value={money(totals.taxAmount, form.currency)} />
                      {totals.discountAmount > 0 && <SummaryRow label="Overall discount" value={`- ${money(totals.discountAmount, form.currency)}`} muted />}
                      {totals.shipping > 0 && <SummaryRow label="Shipping / additional charges" value={money(totals.shipping, form.currency)} />}
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                      <span className="text-xs font-bold uppercase tracking-wide">Total</span>
                      <span className="text-2xl font-extrabold tracking-tight tabular-nums">{money(totals.total, form.currency)}</span>
                    </div>
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <SummaryRow label="Amount paid" value={money(amountPaid, form.currency)} muted />
                      <SummaryRow label="Remaining balance" value={money(balance, form.currency)} strong />
                    </div>
                  </div>
                </Group>

                <Group title="Payment terms & instructions" description="Shown on the client page, PDF and email.">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
                    <Lock className="size-3.5 text-success" />
                    Secure card payment{selectedBrand?.paymentEnabled === false ? " (currently disabled)" : " via Square"}
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Payment terms" hint="e.g. Net 14, due on receipt">
                      <Input value={builder.paymentTerms} onChange={(e) => setBuilderField("paymentTerms", e.target.value)} placeholder="Payment is due within 14 days" />
                    </Field>
                    <Field label="Payment instructions" hint="Bank details, reference, etc.">
                      <Input value={builder.paymentInstructions} onChange={(e) => setBuilderField("paymentInstructions", e.target.value)} placeholder="Pay via bank transfer…" />
                    </Field>
                    <Field label="Deposit requirement">
                      <Select value={builder.depositRequired ? "yes" : "no"} onChange={(e) => setBuilderField("depositRequired", e.target.value === "yes")}>
                        <option value="no">No deposit required</option>
                        <option value="yes">Deposit required before work begins</option>
                      </Select>
                    </Field>
                  </div>
                </Group>

                <Group title="Notes & additional details" description="Customer-facing notes stay separate from internal information.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Customer notes">
                      <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Thank you for your business…" />
                    </Field>
                    <Field label="Terms & conditions">
                      <Textarea rows={3} value={builder.terms} onChange={(e) => setBuilderField("terms", e.target.value)} placeholder="Late payments may incur…" />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Internal notes" hint="Never displayed on customer PDFs or payment pages">
                      <Textarea rows={2} value={builder.internalNotes} onChange={(e) => setBuilderField("internalNotes", e.target.value)} placeholder="e.g. Follow up next week" />
                    </Field>
                  </div>
                  <div className="mt-4 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold">Attachments ({builder.attachments.length})</p>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                  </div>
                </Group>

                <Group title="Design & branding" description="Colours come from the selected brand. The same design is used by the preview, PDF and client page.">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-xl text-xs text-muted-foreground">
                      One consistent document style. Adjust the brand colours here if needed; layout templates are intentionally hidden.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setDesignOverride(null); setDesignTouched(true); setDirty(true); }}
                    >
                      Reset to brand defaults
                    </Button>
                  </div>
                  <div className="mt-4">
                    <InvoiceDesignEditor
                      value={effectiveDesign}
                      onChange={(d) => { setDesignOverride(d); setDesignTouched(true); setDirty(true); }}
                      palette={selectedBrand?.logoPalette || []}
                      logoUrl={selectedBrand?.logoUrl}
                      businessName={selectedBrand?.businessName || selectedBrand?.name}
                      savedDesign={brandDesign}
                      onReset={() => { setDesignOverride(null); setDesignTouched(true); setDirty(true); }}
                      hidePreview
                      hideLayout
                    />
                  </div>
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
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
            </div>
          </div>

          {/* -------------------------- PREVIEW -------------------------- */}
          <aside className="min-w-0 xl:sticky xl:top-[76px]">{previewPanel}</aside>
        </div>
      </main>

      {/* -------------------------- DIALOGS -------------------------- */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="PDF preview" description="The exact paginated document your customer will receive." className="max-w-6xl">
        <div ref={pdfFrameRef} className="relative">
          <Button type="button" variant="outline" size="sm" className="absolute right-2 top-2 z-10" onClick={() => void pdfFrameRef.current?.requestFullscreen?.()}>
            <Maximize2 className="size-3.5" /> Full screen
          </Button>
          {pdfUrl ? <PdfFrame src={pdfUrl} paperSize={builder.paperSize} className="h-[75vh]" /> : <Spinner />}
        </div>
      </Dialog>

      <Dialog open={expandOpen} onClose={() => setExpandOpen(false)} title="Invoice preview" description="How the invoice looks to your customer." className="max-w-5xl">
        <div className="max-h-[75vh] overflow-auto bg-neutral-50 p-2 sm:p-4">
          <FitInvoicePage widthMm={pageWidthMm} className="mx-auto">
            <InvoiceDesignPreview {...previewProps} />
          </FitInvoicePage>
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

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={dirty ? "Discard changes?" : "Leave the invoice editor?"} description={dirty ? "Your unsaved changes will be lost." : undefined}>
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

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 text-muted-foreground" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
