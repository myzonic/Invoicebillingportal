import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Send, Copy, ExternalLink, CheckCircle2, Trash2, Download, FilePenLine, Plus, RefreshCw } from "lucide-react";
import {
  useDeleteInvoiceMutation,
  useInvoiceCheckoutMutation,
  useInvoiceQuery,
  useRatesQuery,
  useSendInvoiceMutation,
  useUpdateInvoiceMutation,
  useUpdateInvoiceStatusMutation,
} from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { api } from "@/lib/api";
import { errorMessage, formatDate, money, richText } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { PdfFrame } from "@/components/PdfFrame";
import { Input } from "@/components/ui/input";
import { Field, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/richText";
import type { InvoiceItem } from "@/types";

const CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"];

export default function InvoiceDetail() {
  const { id = "" } = useParams();
  const can = useCan("invoices");
  const { data, isLoading } = useInvoiceQuery(id);
  const { data: ratesData } = useRatesQuery();
  const currencyOptions = ratesData?.data?.currencies?.length ? ratesData.data.currencies : CURRENCIES;
  const [updateStatus, { isLoading: updating }] = useUpdateInvoiceStatusMutation();
  const [sendInvoice, { isLoading: sending }] = useSendInvoiceMutation();
  const [checkout, { isLoading: creatingLink }] = useInvoiceCheckoutMutation();
  const [deleteInvoice, { isLoading: deleting }] = useDeleteInvoiceMutation();
  const [updateInvoice, { isLoading: savingPdf }] = useUpdateInvoiceMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdfEditOpen, setPdfEditOpen] = useState(false);
  const [editPreviewUrl, setEditPreviewUrl] = useState("");
  const [refreshingPreview, setRefreshingPreview] = useState(false);
  const [pdfForm, setPdfForm] = useState({
    currency: "USD",
    color: "#111111",
    notes: "",
    taxRate: 0,
    discountAmount: 0,
    issueDate: "",
    dueDate: "",
    items: [] as InvoiceItem[],
  });

  useEffect(() => () => {
    if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
  }, [editPreviewUrl]);

  if (isLoading) return <Spinner />;
  const invoice = data?.data;
  if (!invoice) return <EmptyState title="Invoice not found" />;

  const items = (invoice.items || []) as { description: string; quantity: number; unitPrice: number }[];

  const loadSavedPreview = async () => {
    setRefreshingPreview(true);
    try {
      const res = await api.get(`/invoices/${id}/pdf?inline=1`, { responseType: "blob" });
      setEditPreviewUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshingPreview(false);
    }
  };

  const openPdfEditor = async () => {
    setPdfForm({
      currency: invoice.currency,
      color: invoice.color || "#111111",
      notes: invoice.notes || "",
      taxRate: Number(invoice.taxRate),
      discountAmount: Number(invoice.discountAmount),
      issueDate: invoice.issueDate.slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : "",
      items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
    });
    setPdfEditOpen(true);
    await loadSavedPreview();
  };

  const pdfPayload = () => ({
    clientId: invoice.clientId,
    brandId: invoice.brandId || undefined,
    items: pdfForm.items,
    taxRate: Number(pdfForm.taxRate),
    discountAmount: Number(pdfForm.discountAmount),
    currency: pdfForm.currency,
    color: pdfForm.color || undefined,
    notes: pdfForm.notes,
    issueDate: new Date(pdfForm.issueDate).toISOString(),
    dueDate: pdfForm.dueDate ? new Date(pdfForm.dueDate).toISOString() : undefined,
    status: invoice.status,
  });

  const refreshEditedPreview = async () => {
    setRefreshingPreview(true);
    try {
      const res = await api.post("/invoices/preview-pdf", pdfPayload(), { responseType: "blob" });
      setEditPreviewUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshingPreview(false);
    }
  };

  const savePdfEdits = async () => {
    try {
      await updateInvoice({ id, body: pdfPayload() }).unwrap();
      toast.success("PDF content saved and regenerated");
      await loadSavedPreview();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const markPaid = async () => {
    try {
      await updateStatus({ id, status: "PAID" }).unwrap();
      toast.success("Invoice marked as paid");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const emailInvoice = async () => {
    try {
      await sendInvoice(id).unwrap();
      toast.success("Invoice sent by email");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice?.number || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const createLink = async () => {
    try {
      const result = await checkout(id).unwrap();
      window.open(result.data.url, "_blank");
      toast.success("Payment link created");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const paymentLink = invoice.permalink || "";
  const paymentDomain = invoice.paymentDomain || invoice.brand?.paymentDomain || "";

  const copyLink = async () => {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link. Select and copy it manually.");
    }
  };

  const doDelete = async () => {
    try {
      await deleteInvoice(id).unwrap();
      toast.success("Invoice deleted");
      window.location.href = "/dashboard/invoices";
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const paidAmount = (invoice.payments || []).filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Invoice ${invoice.number}`}
        description="Invoice details"
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/invoices">
              <Button variant="outline">
                <ArrowLeft className="size-4" /> Back
              </Button>
            </Link>
            {can("update") && invoice.status !== "PAID" && (
              <Link to={`/dashboard/invoices/update/${id}`}>
                <Button variant="outline">
                  <Pencil className="size-4" /> Edit
                </Button>
              </Link>
            )}
            {can("update") && invoice.status !== "PAID" && (
              <Button variant="outline" onClick={openPdfEditor}>
                <FilePenLine className="size-4" /> Edit PDF
              </Button>
            )}
            {can("update") && invoice.status === "DRAFT" && (
              <Button variant="outline" onClick={emailInvoice} loading={sending}>
                <Send className="size-4" /> Email invoice
              </Button>
            )}
            {can("read") && (
              <Button variant="outline" onClick={downloadPdf}>
                <Download className="size-4" /> PDF
              </Button>
            )}
            {can("update") && invoice.status !== "PAID" && (
              <>
                <Button variant="outline" onClick={createLink} loading={creatingLink}>
                  <ExternalLink className="size-4" /> Square checkout
                </Button>
                <Button variant="outline" onClick={copyLink} disabled={!paymentLink}>
                  {copied ? <CheckCircle2 className="size-4 text-success" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy payment link"}
                </Button>
              </>
            )}
            {can("update") && invoice.status !== "PAID" && (
              <Button variant="success" onClick={markPaid} loading={updating}>
                <CheckCircle2 className="size-4" /> Mark paid
              </Button>
            )}
            {can("delete") && invoice.status !== "PAID" && (
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Client</p>
            <p className="font-medium">{invoice.client?.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Brand</p>
            <p className="font-medium">{invoice.brand?.name || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Issued</p>
            <p className="font-medium">{formatDate(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Due</p>
            <p className="font-medium">{formatDate(invoice.dueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <StatusBadge status={invoice.status} />
          </div>
          <div>
            <p className="text-muted-foreground">Currency</p>
            <p className="font-medium">{invoice.currency}</p>
          </div>
          {invoice.paidAt && (
            <div>
              <p className="text-muted-foreground">Paid on</p>
              <p className="font-medium">{formatDate(invoice.paidAt)}</p>
            </div>
          )}
          {invoice.squarePaymentLink && (
            <div>
              <p className="text-muted-foreground">Square checkout</p>
              <a href={invoice.squarePaymentLink} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                Open checkout
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {paymentLink && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-success" /> Permanent branded payment link
              </p>
              <p className="break-all text-sm font-medium">{paymentLink}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {paymentDomain || "Default payment host"} · {invoice.currency} · this link never changes
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyLink}>
                {copied ? <CheckCircle2 className="size-4 text-success" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <a href={paymentLink} target="_blank" rel="noreferrer">
                <Button size="sm">
                  <ExternalLink className="size-4" /> Open
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent>
          <Table className="border-0">
            <THead>
              <TR>
                <TH>Description</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Unit price</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item, i) => (
                <TR key={i}>
                  <TD className="whitespace-pre-line">
                    <span className="richtext" dangerouslySetInnerHTML={{ __html: richText(item.description) }} />
                  </TD>
                  <TD className="text-right">{item.quantity}</TD>
                  <TD className="text-right">{money(item.unitPrice, invoice.currency)}</TD>
                  <TD className="text-right">{money(item.quantity * item.unitPrice, invoice.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex flex-col items-end gap-1 border-t border-border pt-4 text-sm">
            <div className="flex w-64 justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{money(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex w-64 justify-between">
              <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
              <span>{money(invoice.taxAmount, invoice.currency)}</span>
            </div>
            {Number(invoice.discountAmount) > 0 && (
              <div className="flex w-64 justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{money(invoice.discountAmount, invoice.currency)}</span>
              </div>
            )}
            <div className="flex w-64 justify-between text-base font-bold">
              <span>Total</span>
              <span>{money(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {(invoice.payments || []).length > 0 && (
        <Card>
          <CardContent>
            <h3 className="mb-3 text-base font-semibold">Payments</h3>
            <Table className="border-0">
              <THead>
                <TR>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                  <TH>Date</TH>
                </TR>
              </THead>
              <TBody>
                {invoice.payments!.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.method}</TD>
                    <TD>{p.reference || "-"}</TD>
                    <TD>{money(p.amount, p.currency)}</TD>
                    <TD>
                      <StatusBadge status={p.status} />
                    </TD>
                    <TD>{formatDate(p.capturedAt || p.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="mt-3 text-sm text-muted-foreground">
              Total collected: <span className="font-semibold text-foreground">{money(paidAmount, invoice.currency)}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={pdfEditOpen}
        onClose={() => setPdfEditOpen(false)}
        title="Edit PDF content"
        description="Fix mistakes here, refresh the preview, then save. The PDF is regenerated from these values."
        className="max-w-6xl"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <Field label="Notes">
              <Textarea rows={2} value={pdfForm.notes} onChange={(e) => setPdfForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Accent color">
                <Input type="color" value={pdfForm.color} onChange={(e) => setPdfForm((f) => ({ ...f, color: e.target.value }))} className="h-10 p-1" />
              </Field>
              <Field label="Currency">
                <Select value={pdfForm.currency} onChange={(e) => setPdfForm((f) => ({ ...f, currency: e.target.value }))}>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Issue date">
                <Input type="date" value={pdfForm.issueDate} onChange={(e) => setPdfForm((f) => ({ ...f, issueDate: e.target.value }))} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={pdfForm.dueDate} onChange={(e) => setPdfForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </Field>
              <Field label="Tax rate (%)">
                <Input type="number" min={0} max={100} step="0.01" value={pdfForm.taxRate} onChange={(e) => setPdfForm((f) => ({ ...f, taxRate: Number(e.target.value) }))} />
              </Field>
              <Field label="Discount amount">
                <Input type="number" min={0} step="0.01" value={pdfForm.discountAmount} onChange={(e) => setPdfForm((f) => ({ ...f, discountAmount: Number(e.target.value) }))} />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Line items</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPdfForm((f) => ({ ...f, items: [...f.items, { description: "", quantity: 1, unitPrice: 0 }] }))}
                >
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              {pdfForm.items.map((item, index) => (
                <div key={index} className="mb-2 space-y-2 rounded-lg border border-border p-2">
                  <RichTextEditor
                    value={item.description}
                    onChange={(html) => setPdfForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, description: html } : it)) }))}
                  />
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => setPdfForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, quantity: Number(e.target.value) } : it)) }))}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => setPdfForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, unitPrice: Number(e.target.value) } : it)) }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPdfForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))}
                      disabled={pdfForm.items.length === 1}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" onClick={refreshEditedPreview} loading={refreshingPreview}>
                <RefreshCw className="size-4" /> Refresh preview
              </Button>
              <Button type="button" onClick={savePdfEdits} loading={savingPdf}>
                Save &amp; regenerate PDF
              </Button>
            </div>
          </div>
          <div>{editPreviewUrl ? <PdfFrame src={editPreviewUrl} /> : <Spinner />}</div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete invoice?"
        message="This cannot be undone."
      />
    </div>
  );
}
