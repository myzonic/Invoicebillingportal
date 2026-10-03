import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Send, Copy, ExternalLink, CheckCircle2, Trash2, Download } from "lucide-react";
import {
  useDeleteInvoiceMutation,
  useInvoiceCheckoutMutation,
  useInvoiceQuery,
  useSendInvoiceMutation,
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
import { branding } from "@/config/branding";

export default function InvoiceDetail() {
  const { id = "" } = useParams();
  const can = useCan("invoices");
  const { data, isLoading } = useInvoiceQuery(id);
  const [updateStatus, { isLoading: updating }] = useUpdateInvoiceStatusMutation();
  const [sendInvoice, { isLoading: sending }] = useSendInvoiceMutation();
  const [checkout, { isLoading: creatingLink }] = useInvoiceCheckoutMutation();
  const [deleteInvoice, { isLoading: deleting }] = useDeleteInvoiceMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isLoading) return <Spinner />;
  const invoice = data?.data;
  if (!invoice) return <EmptyState title="Invoice not found" />;

  const items = (invoice.items || []) as { description: string; quantity: number; unitPrice: number }[];

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

  const copyLink = async () => {
    const url = invoice.squarePaymentLink || `${branding.paymentUrl}/invoice/payment-link/${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {invoice.status !== "PAID" && (
              <>
                <Button variant="outline" onClick={createLink} loading={creatingLink}>
                  <ExternalLink className="size-4" /> Payment link
                </Button>
                <Button variant="outline" onClick={copyLink}>
                  {copied ? <CheckCircle2 className="size-4 text-success" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </>
            )}
            {invoice.status !== "PAID" && (
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
              <p className="text-muted-foreground">Payment link</p>
              <a href={invoice.squarePaymentLink} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                Open checkout
              </a>
            </div>
          )}
        </CardContent>
      </Card>

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
