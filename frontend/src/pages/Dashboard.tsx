import { Link } from "react-router-dom";
import { FileText, Users, Boxes, Store, CircleDollarSign, Clock, AlertTriangle, Repeat } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDashboardQuery, useRatesQuery } from "@/app/apiSlice";
import { StatCard, Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn, convertAmount, formatDate, money } from "@/lib/utils";
import { useState } from "react";

const statusTone: Record<string, string> = {
  DRAFT: "bg-muted-foreground",
  SENT: "bg-primary",
  PAID: "bg-success",
  OVERDUE: "bg-destructive",
  PARTIALLY_PAID: "bg-warning",
  CANCELLED: "bg-muted-foreground",
};

export default function Dashboard() {
  const { data, isLoading, isError } = useDashboardQuery();
  const { data: ratesData } = useRatesQuery();
  const [baseCurrency, setBaseCurrency] = useState("USD");

  if (isLoading) return <Spinner />;
  if (isError || !data) return <EmptyState title="Could not load dashboard" hint="Refresh to try again" />;

  const t = data.data.totals;
  const revenue = data.data.monthlyRevenue || [];
  const byStatus = data.data.totalsByStatus || [];
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));

  const rates = ratesData?.data?.rates || {};
  const revenueByCurrency = data.data.revenueByCurrency || [];
  const convertedRevenue = revenueByCurrency.reduce(
    (sum, c) => sum + convertAmount(Number(c.total), c.currency, baseCurrency, rates),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Your finance and billing at a glance"
        action={
          <Link to="/dashboard/invoices/add">
            <Button>Add Invoice</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Invoices" value={t.invoices} icon={<FileText className="size-4" />} />
        <StatCard label="Clients" value={t.clients} icon={<Users className="size-4" />} />
        <StatCard label="Brands" value={t.brands} icon={<Boxes className="size-4" />} />
        <StatCard label="Merchants" value={t.merchants} icon={<Store className="size-4" />} />
        <StatCard label="Collected Revenue" value={money(convertedRevenue, baseCurrency)} icon={<CircleDollarSign className="size-4" />} tone="success" />
        <StatCard label="Paid Invoices" value={t.paid} icon={<CircleDollarSign className="size-4" />} tone="success" />
        <StatCard label="Unpaid" value={t.unpaid} icon={<Clock className="size-4" />} tone="warning" />
        <StatCard label="Overdue" value={t.overdue} icon={<AlertTriangle className="size-4" />} tone="destructive" />
      </div>

      <Card className="mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Repeat className="size-4" /> Multi-currency Revenue
            </h3>
            <p className="text-sm text-muted-foreground">Collected amount per currency, converted to a base currency</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Base:</span>
            <Select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} className="w-28">
              {(ratesData?.data?.currencies || ["USD", "GBP", "EUR", "AUD", "CAD"]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {revenueByCurrency.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No paid invoices yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <Table className="border-0">
              <THead>
                <TR>
                  <TH>Currency</TH>
                  <TH className="text-right">Collected</TH>
                  <TH className="text-right">Converted ({baseCurrency})</TH>
                </TR>
              </THead>
              <TBody>
                {revenueByCurrency.map((c) => (
                  <TR key={c.currency}>
                    <TD className="font-medium">{c.currency}</TD>
                    <TD className="text-right tabular-nums">{money(c.total, c.currency)}</TD>
                    <TD className="text-right tabular-nums">{money(convertAmount(Number(c.total), c.currency, baseCurrency, rates), baseCurrency)}</TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-semibold">Total</TD>
                  <TD className="text-right text-xs text-muted-foreground">
                    {revenueByCurrency.map((c) => money(c.total, c.currency)).join(" + ")}
                  </TD>
                  <TD className="text-right font-semibold">{money(convertedRevenue, baseCurrency)}</TD>
                </TR>
              </TBody>
            </Table>
          </div>
        )}
        {ratesData?.data?.source === "none" && (
          <p className="mt-3 text-xs text-muted-foreground">No conversion rates available — amounts shown in their own currencies.</p>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Revenue</h3>
            <p className="text-sm text-muted-foreground">Invoiced amount per month</p>
          </div>
        </div>
        <div className="h-64 w-full">
          {revenue.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(224 76% 55%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(224 76% 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(228 18% 90%)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(228 10% 45%)" }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "hsl(228 10% 45%)" }}
                  tickFormatter={(v: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(v)}
                />
                <Tooltip
                  formatter={(v) => money(Number(v))}
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(228 18% 90%)", boxShadow: "0 8px 24px -8px rgb(15 23 42 / 0.2)" }}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(224 76% 55%)" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-base font-semibold tracking-tight">Recent Invoices</h3>
          </div>
          <Table className="border-0">
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Client</TH>
                <TH>Date</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {data.data.recentInvoices.length === 0 && (
                <TR>
                  <TD colSpan={5}>
                    <EmptyState title="No invoices yet" />
                  </TD>
                </TR>
              )}
              {data.data.recentInvoices.map((inv) => (
                <TR key={inv.id}>
                  <TD className="font-medium">
                    <Link to={`/dashboard/invoices/${inv.id}`} className="hover:text-primary">
                      {inv.number}
                    </Link>
                  </TD>
                  <TD>{inv.client?.name}</TD>
                  <TD>{formatDate(inv.issueDate)}</TD>
                  <TD className="text-right font-medium">{money(inv.total, inv.currency)}</TD>
                  <TD>
                    <StatusBadge status={inv.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-base font-semibold tracking-tight">By Status</h3>
          <div className="flex flex-col gap-4">
            {byStatus.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet</p>}
            {byStatus.map((s) => (
              <div key={s.status} className="flex items-center gap-4">
                <div className="w-32 shrink-0 text-sm font-medium">
                  <StatusBadge status={s.status} />
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all", statusTone[s.status] || "bg-muted-foreground")}
                    style={{ width: `${Math.round((s.count / maxStatus) * 100)}%` }}
                  />
                </div>
                <div className="w-20 shrink-0 text-right">
                  <span className="font-semibold">{s.count}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{money(s.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
