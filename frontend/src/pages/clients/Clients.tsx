import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useClientsQuery, useDeleteClientMutation } from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { errorMessage, formatDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm";

export default function Clients() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const can = useCan("clients");

  const { data, isLoading } = useClientsQuery({ page, limit: 10, search: debounced });
  const [deleteClient, { isLoading: deleting }] = useDeleteClientMutation();

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    const t = setTimeout(() => setDebounced(value), 400);
    return () => clearTimeout(t);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteClient(toDelete).unwrap();
      toast.success("Client deleted");
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage your clients"
        action={
          can("create") && (
            <Link to="/dashboard/clients/add">
              <Button>
                <Plus className="size-4" /> Add Client
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search clients..." value={search} onChange={(e) => onSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Phone</TH>
              <TH>Brand</TH>
              <TH>Invoices</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={7}>
                  <EmptyState title="No clients found" hint="Add your first client to get started" />
                </TD>
              </TR>
            )}
            {data?.data.map((client) => (
              <TR key={client.id}>
                <TD className="font-medium">
                  <Link to={`/dashboard/clients/${client.id}`} className="hover:underline">
                    {client.name}
                  </Link>
                </TD>
                <TD>{client.email || "-"}</TD>
                <TD>{client.phone || "-"}</TD>
                <TD>{client.brand?.name || "-"}</TD>
                <TD>
                  <Badge>{client._count?.invoices ?? 0}</Badge>
                </TD>
                <TD>{formatDate(client.createdAt)}</TD>
                <TD className="text-right">
                  <div className="inline-flex gap-1">
                    {can("update") && (
                      <Link to={`/dashboard/clients/update/${client.id}`}>
                        <Button variant="ghost" size="icon" title="Edit">
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                    )}
                    {can("delete") && (
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(client.id)}>
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
        title="Delete client?"
        message="This will also remove their invoices. This cannot be undone."
      />
    </div>
  );
}
