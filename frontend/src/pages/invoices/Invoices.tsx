import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useInvoicesQuery, useDeleteInvoiceMutation } from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { errorMessage, formatDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm";

const STATUSES = ["", "DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];

export default function Invoices() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const can = useCan("invoices");

  const { data, isLoading } = useInvoicesQuery({ page, limit: 10, search: debounced, status: status || undefined });
  const [deleteInvoice, { isLoading: deleting }] = useDeleteInvoiceMutation();

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    const t = setTimeout(() => setDebounced(value), 400);
    return () => clearTimeout(t);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteInvoice(toDelete).unwrap();
      toast.success("Invoice deleted");
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create and manage invoices"
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by invoice # or client..." value={search} onChange={(e) => onSearch(e.target.value)} className="pl-9" />
        </div>
        <Select className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? `Status: ${s.toLowerCase()}` : "All statuses"}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice #</TH>
              <TH>Client</TH>
              <TH>Date</TH>
              <TH>Due</TH>
              <TH>Amount</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={7}>
                  <EmptyState title="No invoices found" hint="Create your first invoice" />
                </TD>
              </TR>
            )}
            {data?.data.map((inv) => (
              <TR key={inv.id}>
                <TD className="font-medium">
                  <Link to={`/dashboard/invoices/${inv.id}`} className="hover:underline">
                    {inv.number}
                  </Link>
                </TD>
                <TD>{inv.client?.name}</TD>
                <TD>{formatDate(inv.issueDate)}</TD>
                <TD>{formatDate(inv.dueDate)}</TD>
                <TD className="font-medium">{money(inv.total, inv.currency)}</TD>
                <TD>
                  <StatusBadge status={inv.status} />
                </TD>
                <TD className="text-right">
                  <div className="inline-flex gap-1">
                    {can("update") && (
                      <Link to={`/dashboard/invoices/update/${inv.id}`}>
                        <Button variant="ghost" size="icon" title="Edit">
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                    )}
                    {can("delete") && inv.status !== "PAID" && (
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(inv.id)}>
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

      {data && data.meta.pages > 1 && (
        <Pagination page={page} pages={data.meta.pages} total={data.meta.total} onChange={setPage} />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete invoice?"
        message="This cannot be undone."
      />
    </div>
  );
}
