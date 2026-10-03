import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  useBrandsQuery,
  useClientsQuery,
  useCreateInvoiceMutation,
  useInvoiceQuery,
  useUpdateInvoiceMutation,
} from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { errorMessage, money, stripTags } from "@/lib/utils";
import type { InvoiceItem, InvoiceStatus } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/richText";
import { Textarea, Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/table";

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
  const [createInvoice, { isLoading: creating }] = useCreateInvoiceMutation();
  const [updateInvoice, { isLoading: updating }] = useUpdateInvoiceMutation();

  const [form, setForm] = useState({
    clientId: params.get("client") || "",
    brandId: "",
    currency: "USD",
    color: "#111111",
    taxRate: 0,
    discountAmount: 0,
    notes: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    status: "DRAFT",
  });
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);

  useEffect(() => {
    if (invoiceData) {
      const inv = invoiceData.data;
      setForm({
        clientId: inv.clientId,
        brandId: inv.brandId || "",
        currency: inv.currency,
        color: inv.color || "#111111",
        taxRate: Number(inv.taxRate),
        discountAmount: Number(inv.discountAmount),
        notes: inv.notes || "",
        issueDate: inv.issueDate.slice(0, 10),
        dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
        status: inv.status,
      });
      setItems(inv.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })));
    }
  }, [invoiceData]);

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.clientId) return toast.error("Select a client");
    if (items.some((i) => !stripTags(i.description))) return toast.error("Every line item needs a description");
    try {
      const payload = {
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
      };
      if (isEdit) {
        await updateInvoice({ id: id!, body: payload }).unwrap();
        toast.success("Invoice updated");
      } else {
        await createInvoice(payload).unwrap();
        toast.success("Invoice created");
      }
      navigate("/dashboard/invoices");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (loadingInvoice) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={isEdit ? "Edit Invoice" : "Add Invoice"} description={isEdit ? "Update invoice details" : "Create a new invoice"} />
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
              <Field label="Brand">
                <Select value={form.brandId} onChange={(e) => set("brandId", e.target.value)}>
                  <option value="">Default brand</option>
                  {brands?.data.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Currency">
                <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Brand color" hint="Shown on the client's invoice, checkout and PDF">
                <div className="flex items-center gap-2">
                  <label
                    className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border shadow-sm"
                    style={{ background: form.color }}
                    title="Pick a custom color"
                  >
                    <input
                      type="color"
                      value={form.color}
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
                        min={0}
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
          {can("create") && (
            <Button type="submit" loading={creating || updating}>
              {isEdit ? "Save changes" : "Create invoice"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
