import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Columns3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import {
  useBrandsQuery,
  useBulkSendInvoicesMutation,
  useClientsQuery,
  useDeleteInvoiceMutation,
  useExportInvoicesMutation,
  useInvoicesQuery,
  useRatesQuery,
} from "@/app/apiSlice";
import { api } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { cn, errorMessage, formatDate, money } from "@/lib/utils";
import type { CurrencyTotal, Invoice } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Card, StatCard } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

const STATUSES = ["", "DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];

const COLUMN_OPTIONS = [
  { key: "client", label: "Client" },
  { key: "brand", label: "Brand / company" },
  { key: "issueDate", label: "Issue date" },
  { key: "dueDate", label: "Due date" },
  { key: "currency", label: "Currency" },
  { key: "amount", label: "Amount" },
  { key: "paid", label: "Amount paid" },
  { key: "balance", label: "Balance" },
  { key: "status", label: "Status" },
] as const;

type ColumnKey = (typeof COLUMN_OPTIONS)[number]["key"];

interface Filters {
  search: string;
  status: string;
  brandId: string;
  clientId: string;
  currency: string;
  issueDateFrom: string;
  issueDateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  amountMin: string;
  amountMax: string;
}

interface ListPrefs {
  page: number;
  limit: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  columns: ColumnKey[];
  filters: Filters;
}

const PREFS_KEY = "myzonic.invoice-list-prefs.v1";

const DEFAULT_PREFS: ListPrefs = {
  page: 1,
  limit: 10,
  sortBy: "createdAt",
  sortDir: "desc",
  columns: ["client", "issueDate", "dueDate", "amount", "status"],
  filters: {
    search: "",
    status: "",
    brandId: "",
    clientId: "",
    currency: "",
    issueDateFrom: "",
    issueDateTo: "",
    dueDateFrom: "",
    dueDateTo: "",
    amountMin: "",
    amountMax: "",
  },
};

function loadPrefs(): ListPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw) as Partial<ListPrefs>;
    const validColumns = COLUMN_OPTIONS.map((c) => c.key);
    return {
      ...DEFAULT_PREFS,
      ...saved,
      page: Math.max(1, Number(saved.page) || 1),
      limit: [10, 25, 50, 100].includes(Number(saved.limit)) ? Number(saved.limit) : DEFAULT_PREFS.limit,
      sortDir: saved.sortDir === "asc" ? "asc" : "desc",
      columns: Array.isArray(saved.columns)
        ? saved.columns.filter((c): c is ColumnKey => validColumns.includes(c as ColumnKey))
        : DEFAULT_PREFS.columns,
      filters: { ...DEFAULT_PREFS.filters, ...(saved.filters || {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Convert stored payment snapshots back into the invoice's currency. */
function paidAmount(invoice: Invoice) {
  let paid = 0;
  for (const payment of invoice.payments || []) {
    if (payment.status !== "SUCCEEDED") continue;
    if (payment.invoiceCurrency && payment.invoiceAmount != null) {
      if (payment.invoiceCurrency === invoice.currency) paid += Number(payment.invoiceAmount);
      else if (payment.exchangeRate) paid += Number(payment.amount) * Number(payment.exchangeRate);
      continue;
    }
    if (payment.currency === invoice.currency) paid += Number(payment.amount);
    else if (payment.exchangeRate) paid += Number(payment.amount) * Number(payment.exchangeRate);
  }
  if (invoice.status === "PAID" && paid === 0) paid = Number(invoice.total);
  return Math.round(paid * 100) / 100;
}

function balanceAmount(invoice: Invoice) {
  return Math.max(0, Math.round((Number(invoice.total) - paidAmount(invoice)) * 100) / 100);
}

function groupValue(totals?: CurrencyTotal[]) {
  if (!totals || totals.length === 0) return "—";
  return totals.map((t) => money(t.amount, t.currency)).join(" · ");
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Invoices() {
  const [searchParams] = useSearchParams();
  const brandParam = searchParams.get("brand") || "";
  const [prefs, setPrefs] = useState<ListPrefs>(() => {
    const loaded = loadPrefs();
    return brandParam ? { ...loaded, page: 1, filters: { ...loaded.filters, brandId: brandParam } } : loaded;
  });
  const [searchInput, setSearchInput] = useState(prefs.filters.search);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<string | null>(null);
  const can = useCan("invoices");

  const filters = prefs.filters;
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  useEffect(() => {
    if (!brandParam) return;
    setPrefs((p) => (p.filters.brandId === brandParam ? p : { ...p, page: 1, filters: { ...p.filters, brandId: brandParam } }));
  }, [brandParam]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPrefs((p) =>
        p.filters.search === searchInput ? p : { ...p, page: 1, filters: { ...p.filters, search: searchInput } },
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const { data, isLoading, isFetching } = useInvoicesQuery({
    page: prefs.page,
    limit: prefs.limit,
    search: filters.search || undefined,
    status: filters.status || undefined,
    brandId: filters.brandId || undefined,
    clientId: filters.clientId || undefined,
    currency: filters.currency || undefined,
    issueDateFrom: filters.issueDateFrom || undefined,
    issueDateTo: filters.issueDateTo || undefined,
    dueDateFrom: filters.dueDateFrom || undefined,
    dueDateTo: filters.dueDateTo || undefined,
    amountMin: filters.amountMin === "" ? undefined : Number(filters.amountMin),
    amountMax: filters.amountMax === "" ? undefined : Number(filters.amountMax),
    sortBy: prefs.sortBy,
    sortDir: prefs.sortDir,
  });
  const { data: brandsData } = useBrandsQuery({ limit: 100 });
  const { data: clientsData } = useClientsQuery({ limit: 100 });
  const { data: ratesData } = useRatesQuery();
  const [deleteInvoice, { isLoading: deleting }] = useDeleteInvoiceMutation();
  const [bulkSendInvoices, { isLoading: sending }] = useBulkSendInvoicesMutation();
  const [exportInvoices, { isLoading: exporting }] = useExportInvoicesMutation();

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setPrefs((p) => ({ ...p, page: 1, filters: { ...p.filters, ...patch } }));
  }, []);

  const resetFilters = () => {
    setSearchInput("");
    setPrefs((p) => ({
      ...p,
      page: 1,
      filters: { ...DEFAULT_PREFS.filters, brandId: brandParam },
    }));
  };

  const activeFilterCount = [
    filters.search,
    filters.status,
    filters.brandId,
    filters.clientId,
    filters.currency,
    filters.issueDateFrom,
    filters.issueDateTo,
    filters.dueDateFrom,
    filters.dueDateTo,
    filters.amountMin,
    filters.amountMax,
  ].filter(Boolean).length;

  const currencyOptions = useMemo(() => {
    const fromBrands = (brandsData?.data || []).map((b) => b.currency).filter(Boolean);
    return Array.from(new Set([...(ratesData?.data?.currencies || []), ...fromBrands, "USD", "GBP", "EUR", "AUD", "CAD"]))
      .filter(Boolean)
      .sort();
  }, [brandsData, ratesData]);

  const visibleIds = useMemo(() => (data?.data || []).map((invoice) => invoice.id), [data]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const sortBy = (field: string) => {
    setPrefs((p) => {
      const preferred: "asc" | "desc" = ["client", "number", "status"].includes(field) ? "asc" : "desc";
      const dir = p.sortBy === field ? (p.sortDir === "asc" ? "desc" : "asc") : preferred;
      return { ...p, page: 1, sortBy: field, sortDir: dir };
    });
  };

  const sortValue = `${prefs.sortBy}:${prefs.sortDir}`;

  const sortableHeader = (field: string, label: string, className?: string) => {
    const active = prefs.sortBy === field;
    const Icon = active ? (prefs.sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TH className={className} aria-sort={active ? (prefs.sortDir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(field)}>
          {label}
          <Icon className="size-3.5" />
        </button>
      </TH>
    );
  };

  const headerFor = (key: ColumnKey) => {
    switch (key) {
      case "client":
        return sortableHeader("client", "Client");
      case "issueDate":
        return sortableHeader("issueDate", "Issue date");
      case "dueDate":
        return sortableHeader("dueDate", "Due date");
      case "amount":
        return sortableHeader("total", "Amount", "text-right");
      case "status":
        return sortableHeader("status", "Status");
      case "brand":
        return <TH>Brand</TH>;
      case "currency":
        return <TH>Currency</TH>;
      case "paid":
        return <TH className="text-right">Paid</TH>;
      case "balance":
        return <TH className="text-right">Balance</TH>;
    }
  };

  const cellFor = (invoice: Invoice, key: ColumnKey) => {
    switch (key) {
      case "client":
        return <TD>{invoice.client?.name || "—"}</TD>;
      case "brand":
        return <TD>{invoice.brand?.name || "—"}</TD>;
      case "issueDate":
        return <TD>{formatDate(invoice.issueDate)}</TD>;
      case "dueDate":
        return <TD>{formatDate(invoice.dueDate)}</TD>;
      case "currency":
        return <TD>{invoice.currency}</TD>;
      case "amount":
        return <TD className="text-right font-medium tabular-nums">{money(invoice.total, invoice.currency)}</TD>;
      case "paid":
        return <TD className="text-right tabular-nums">{money(paidAmount(invoice), invoice.currency)}</TD>;
      case "balance":
        return <TD className="text-right tabular-nums">{money(balanceAmount(invoice), invoice.currency)}</TD>;
      case "status":
        return (
          <TD>
            <StatusBadge status={invoice.status} />
          </TD>
        );
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    setPrefs((p) => ({
      ...p,
      columns: p.columns.includes(key) ? p.columns.filter((c) => c !== key) : [...p.columns, key],
    }));
  };

  const downloadSelectedPdfs = async () => {
    try {
      for (const id of selectedIds) {
        const response = await api.get<Blob>(`/invoices/${id}/pdf`, { responseType: "blob" });
        const number = data?.data.find((invoice) => invoice.id === id)?.number || id;
        saveBlob(response.data, `${number}.pdf`);
      }
      toast.success(`Downloaded ${selectedIds.length} PDF${selectedIds.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const exportSelected = async () => {
    try {
      const blob = await exportInvoices({ ids: selectedIds }).unwrap();
      saveBlob(blob, `invoices-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("CSV export downloaded");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const confirmBulkSend = async () => {
    try {
      const result = await bulkSendInvoices({ ids: selectedIds }).unwrap();
      setConfirmSend(false);
      setSelected(new Set());
      toast.success(`Sent ${result.data.sent} invoice${result.data.sent === 1 ? "" : "s"}`);
      if (result.data.failed > 0) {
        const firstError = result.data.results.find((r) => !r.ok)?.error || "Unknown error";
        toast.error(`${result.data.failed} failed — ${firstError}`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteInvoice(toDelete).unwrap();
      toast.success("Invoice deleted");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(toDelete);
        return next;
      });
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const summary = data?.summary;
  const columnCount = 3 + prefs.columns.length;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create, track and manage every invoice"
        action={
          can("create") && (
            <Link to="/dashboard/invoices/add">
              <Button>
                <Plus className="size-4" /> Add Invoice
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Invoices" value={summary?.totalInvoices ?? data?.meta.total ?? 0} icon={<FileText className="size-4" />} />
        <StatCard label="Total Invoiced" value={groupValue(summary?.totalInvoiced)} icon={<FileText className="size-4" />} />
        <StatCard label="Total Paid" value={groupValue(summary?.totalPaid)} icon={<CheckCircle2 className="size-4" />} tone="success" />
        <StatCard label="Total Outstanding" value={groupValue(summary?.totalOutstanding)} icon={<Clock className="size-4" />} tone="warning" />
        <StatCard label="Total Overdue" value={groupValue(summary?.totalOverdue)} icon={<AlertTriangle className="size-4" />} tone="destructive" />
        <StatCard label="Draft Invoices" value={summary?.draftInvoices ?? 0} icon={<FileText className="size-4" />} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Invoice #, client, description or amount..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters((v) => !v)}>
          <Filter className="size-4" /> Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilterCount}</span>
          )}
        </Button>
        <Button variant="outline" onClick={() => setShowColumns(true)}>
          <Columns3 className="size-4" /> Columns
        </Button>
        <Select
          className="w-48"
          value={sortValue}
          onChange={(e) => {
            const [sortByValue, sortDirValue] = e.target.value.split(":");
            setPrefs((p) => ({ ...p, page: 1, sortBy: sortByValue, sortDir: sortDirValue === "asc" ? "asc" : "desc" }));
          }}
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="total:desc">Highest amount</option>
          <option value="total:asc">Lowest amount</option>
          <option value="dueDate:asc">Due date (soonest)</option>
          <option value="dueDate:desc">Due date (latest)</option>
          <option value="client:asc">Client name A-Z</option>
          <option value="client:desc">Client name Z-A</option>
          <option value="number:asc">Invoice number</option>
          {!["createdAt:desc", "createdAt:asc", "total:desc", "total:asc", "dueDate:asc", "dueDate:desc", "client:asc", "client:desc", "number:asc"].includes(sortValue) && (
            <option value={sortValue}>Custom sort</option>
          )}
        </Select>
      </div>

      {showFilters && (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Status">
              <Select value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status ? status.replace("_", " ").toLowerCase() : "All statuses"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand / company">
              <Select value={filters.brandId} onChange={(e) => updateFilters({ brandId: e.target.value })}>
                <option value="">All brands</option>
                {(brandsData?.data || []).map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Client">
              <Select value={filters.clientId} onChange={(e) => updateFilters({ clientId: e.target.value })}>
                <option value="">All clients</option>
                {(clientsData?.data || []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={filters.currency} onChange={(e) => updateFilters({ currency: e.target.value })}>
                <option value="">All currencies</option>
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Issue date from">
              <Input type="date" value={filters.issueDateFrom} onChange={(e) => updateFilters({ issueDateFrom: e.target.value })} />
            </Field>
            <Field label="Issue date to">
              <Input type="date" value={filters.issueDateTo} onChange={(e) => updateFilters({ issueDateTo: e.target.value })} />
            </Field>
            <Field label="Due date from">
              <Input type="date" value={filters.dueDateFrom} onChange={(e) => updateFilters({ dueDateFrom: e.target.value })} />
            </Field>
            <Field label="Due date to">
              <Input type="date" value={filters.dueDateTo} onChange={(e) => updateFilters({ dueDateTo: e.target.value })} />
            </Field>
            <Field label="Minimum amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={filters.amountMin}
                onChange={(e) => updateFilters({ amountMin: e.target.value })}
              />
            </Field>
            <Field label="Maximum amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={filters.amountMax}
                onChange={(e) => updateFilters({ amountMax: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        </Card>
      )}

      {selectedIds.length > 0 && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{selectedIds.length} selected</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadSelectedPdfs}>
              <Download className="size-4" /> Download PDFs
            </Button>
            {can("update") && (
              <Button variant="outline" size="sm" onClick={() => setConfirmSend(true)} disabled={sending}>
                <Send className="size-4" /> Send
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportSelected} disabled={exporting}>
              <FileSpreadsheet className="size-4" /> Export CSV
            </Button>
          </div>
        </Card>
      )}

      <div className={cn("transition-opacity", isFetching && "opacity-70")}>
        {isLoading ? (
          <Spinner />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-10">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all invoices on this page"
                  />
                </TH>
                <TH>Invoice #</TH>
                {prefs.columns.map((key) => (
                  <Fragment key={key}>{headerFor(key)}</Fragment>
                ))}
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {data?.data.length === 0 && (
                <TR>
                  <TD colSpan={columnCount}>
                    <EmptyState title="No invoices found" hint="Adjust the filters or create your first invoice" />
                  </TD>
                </TR>
              )}
              {data?.data.map((invoice) => (
                <TR key={invoice.id} className={cn(selected.has(invoice.id) && "bg-primary/5")}>
                  <TD>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selected.has(invoice.id)}
                      onChange={() => toggleRow(invoice.id)}
                      aria-label={`Select invoice ${invoice.number}`}
                    />
                  </TD>
                  <TD className="font-medium">
                    <Link to={`/dashboard/invoices/${invoice.id}`} className="hover:underline">
                      {invoice.number}
                    </Link>
                  </TD>
                  {prefs.columns.map((key) => (
                    <Fragment key={key}>{cellFor(invoice, key)}</Fragment>
                  ))}
                  <TD className="text-right">
                    <div className="inline-flex gap-1">
                      {can("update") && (
                        <Link to={`/dashboard/invoices/update/${invoice.id}`}>
                          <Button variant="ghost" size="icon" title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                        </Link>
                      )}
                      {can("delete") && invoice.status !== "PAID" && (
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(invoice.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {data && (
        <Pagination
          page={prefs.page}
          pages={data.meta.pages}
          total={data.meta.total}
          limit={prefs.limit}
          onLimitChange={(limit) => setPrefs((p) => ({ ...p, page: 1, limit }))}
          onChange={(page) => setPrefs((p) => ({ ...p, page }))}
        />
      )}

      <Dialog open={showColumns} onClose={() => setShowColumns(false)} title="Table columns" description="Choose which columns appear in the invoice list.">
        <div className="grid grid-cols-2 gap-3">
          {COLUMN_OPTIONS.map((column) => (
            <label key={column.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={prefs.columns.includes(column.key)}
                onChange={() => toggleColumn(column.key)}
              />
              {column.label}
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setShowColumns(false)}>Done</Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        title={`Send ${selectedIds.length} invoice${selectedIds.length === 1 ? "" : "s"}?`}
        description="Each invoice is emailed with its current PDF. Drafts become Sent only where delivery succeeds."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmSend(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={confirmBulkSend} loading={sending}>
            <Send className="size-4" /> Send now
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete invoice?"
        message="This permanently deletes the invoice and its payment history. This cannot be undone."
      />
    </div>
  );
}
