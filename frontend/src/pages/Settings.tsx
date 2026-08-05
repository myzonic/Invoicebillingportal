import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Save } from "lucide-react";
import { useSettingsQuery, useUpdateSettingsMutation, useRatesQuery, useRefreshRatesMutation, useSaveRatesMutation } from "@/app/apiSlice";
import { errorMessage, formatDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea, Field } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, Spinner } from "@/components/ui/table";

export default function Settings() {
  const { data, isLoading } = useSettingsQuery();
  const [updateSettings, { isLoading: saving }] = useUpdateSettingsMutation();
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", website: "" });

  const { data: rates, isLoading: ratesLoading } = useRatesQuery();
  const [refreshRates, { isLoading: refreshing }] = useRefreshRatesMutation();
  const [saveRates, { isLoading: savingRates }] = useSaveRatesMutation();
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.data?.company) {
      const c = data.data.company as Record<string, string>;
      setForm({ name: c.name || "", email: c.email || "", phone: c.phone || "", address: c.address || "", website: c.website || "" });
    }
  }, [data]);

  useEffect(() => {
    if (rates?.data) {
      setOverrides(
        Object.fromEntries(rates.data.currencies.map((c) => [c, rates.data.overrides[c] != null ? String(rates.data.overrides[c]) : ""])),
      );
    }
  }, [rates]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({ company: form }).unwrap();
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshRates().unwrap();
      toast.success("Live rates refreshed");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleSaveRates = async () => {
    try {
      const payload: Record<string, number | null> = {};
      for (const [c, v] of Object.entries(overrides)) {
        const trimmed = v.trim();
        payload[c] = trimmed === "" ? null : Number(trimmed);
      }
      await saveRates({ overrides: payload }).unwrap();
      toast.success("Rates saved");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (isLoading) return <Spinner />;

  const base = rates?.data?.base || "USD";
  const sourceLabel =
    rates?.data?.source === "live"
      ? "Live (ECB)"
      : rates?.data?.source === "override"
        ? "Manual override"
        : rates?.data?.source === "mixed"
          ? "Live + override"
          : "No rates";

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Company details, and currency conversion used across reports" />
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Company name" required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </Field>
            </div>
            <Field label="Website">
              <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
            </Field>
            <Field label="Address">
              <Textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                <Save className="size-4" /> Save settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardContent>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold tracking-tight">Currency Conversion</h3>
              <p className="text-sm text-muted-foreground">
                Live market rates (ECB) with manual overrides. Rates are "1 {base} = X".
              </p>
              {rates?.data && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Source: <span className="font-medium">{sourceLabel}</span>
                  {rates.data.updatedAt ? ` · updated ${formatDate(rates.data.updatedAt)}` : " · not fetched yet"}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
              <RefreshCw className="size-4" /> Refresh live
            </Button>
          </div>

          {ratesLoading ? (
            <Spinner />
          ) : rates?.data ? (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Currency</TH>
                    <TH className="text-right">Live rate</TH>
                    <TH className="text-right">Override (optional)</TH>
                  </TR>
                </THead>
                <TBody>
                  {rates.data.currencies.map((c) => {
                    const live = rates.data.live?.[c];
                    const overridden = rates.data.overrides[c] != null;
                    return (
                      <TR key={c}>
                        <TD className="font-medium">
                          {c === base ? `${c} (base)` : c}
                          {overridden && <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">OVERRIDE</span>}
                        </TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {c === base ? "1" : live != null ? live.toFixed(4) : "-"}
                        </TD>
                        <TD className="text-right">
                          {c === base ? (
                            <span className="text-sm text-muted-foreground">fixed</span>
                          ) : (
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={overrides[c] ?? ""}
                              placeholder={live != null ? live.toFixed(4) : "auto"}
                              onChange={(e) => setOverrides((o) => ({ ...o, [c]: e.target.value }))}
                              className="ml-auto h-9 w-40 text-right tabular-nums"
                            />
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <div className="mt-4 flex items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">
                  Total conversion check: 100 {base} ≈ {money(100, base)}
                </span>
                <Button onClick={handleSaveRates} loading={savingRates}>
                  <Save className="size-4" /> Save rates
                </Button>
              </div>
            </>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Could not load rates.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
