import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useDeleteMerchantMutation, useMerchantsQuery } from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm";

export default function Merchants({ recordView = false }: { recordView?: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const can = useCan("merchants");

  const { data, isLoading } = useMerchantsQuery({ page, limit: 10, search: debounced });
  const [deleteMerchant, { isLoading: deleting }] = useDeleteMerchantMutation();

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    const t = setTimeout(() => setDebounced(value), 400);
    return () => clearTimeout(t);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMerchant(toDelete).unwrap();
      toast.success("Merchant deleted");
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const base = recordView ? "/dashboard/merchant-records" : "/dashboard/merchant-management";

  return (
    <div>
      <PageHeader
        title={recordView ? "Merchant Records" : "Merchants"}
        description={recordView ? "All merchant records" : "Manage your merchants"}
        action={
          !recordView &&
          can("create") && (
            <Link to={`${base}/add`}>
              <Button>
                <Plus className="size-4" /> Add Merchant
              </Button>
            </Link>
          )
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search merchants..." value={search} onChange={(e) => onSearch(e.target.value)} className="pl-9" />
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
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={5}>
                  <EmptyState title="No merchants found" />
                </TD>
              </TR>
            )}
            {data?.data.map((merchant) => (
              <TR key={merchant.id}>
                <TD className="font-medium">{merchant.name}</TD>
                <TD>{merchant.email || "-"}</TD>
                <TD>{merchant.phone || "-"}</TD>
                <TD>{merchant.brand?.name || "-"}</TD>
                <TD className="text-right">
                  {!recordView && (
                    <div className="inline-flex gap-1">
                      {can("update") && (
                        <Link to={`${base}/update/${merchant.id}`}>
                          <Button variant="ghost" size="icon" title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                        </Link>
                      )}
                      {can("delete") && (
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(merchant.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {data && data.meta.pages > 1 && <Pagination page={page} pages={data.meta.pages} total={data.meta.total} onChange={setPage} />}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete merchant?"
        message="This cannot be undone."
      />
    </div>
  );
}
