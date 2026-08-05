import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useBrandsQuery, useClientsQuery, useCreateInvoiceMutation } from "@/app/apiSlice";
import { errorMessage, money } from "@/lib/utils";
import type { InvoiceItem } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export default function DirectInvoice() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clientId, setClientId] = useState(params.get("client") || "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [color, setColor] = useState("#e0a423");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const { data: clients } = useClientsQuery({ limit: 100 });
  const { data: brands } = useBrandsQuery({ limit: 100 });
  const [createInvoice, { isLoading }] = useCreateInvoiceMutation();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) return toast.error("Select a client");
    if (!description || Number(amount) <= 0) return toast.error("Enter a description and amount");
    const items: InvoiceItem[] = [{ description, quantity: 1, unitPrice: Number(amount) }];
    try {
      await createInvoice({
        clientId,
        items,
        currency,
        color: color || undefined,
        issueDate: new Date(issueDate).toISOString(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        status: "DRAFT",
      }).unwrap();
      toast.success("Invoice created");
      navigate("/dashboard/invoices");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Direct Invoice" description="Quickly raise a single-line invoice" />
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Client" required>
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Select client...</option>
                {clients?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" required>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Web development retainer" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount" required>
                <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </Field>
              <Field label="Currency">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {["USD", "AUD", "EUR", "GBP", "CAD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issue date" required>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
              </Field>
              <Field label="Due date">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Brand color" hint="Shown on the client's invoice, checkout and PDF">
              <div className="flex items-center gap-2">
                <label
                  className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border shadow-sm"
                  style={{ background: color }}
                  title="Pick a custom color"
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  <span className="text-[10px] font-bold text-white/90">▼</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {["#e0a423", "#171719", "#2563eb", "#0d9488", "#16a34a", "#7c3aed", "#dc2626", "#db2777", "#f97316"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`size-6 rounded-full border transition-transform hover:scale-110 ${color === c ? "ring-2 ring-foreground ring-offset-2" : "border-black/10"}`}
                      style={{ background: c }}
                      aria-label={`Use color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </Field>
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{money(Number(amount) || 0, currency)}</span>
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard/invoices")}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading}>
                Create invoice
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
