import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useBrandsQuery, useDeleteBrandMutation } from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm";

export default function Brands() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const can = useCan("brands");

  const { data, isLoading } = useBrandsQuery({ page, limit: 10, search: debounced });
  const [deleteBrand, { isLoading: deleting }] = useDeleteBrandMutation();

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    const t = setTimeout(() => setDebounced(value), 400);
    return () => clearTimeout(t);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteBrand(toDelete).unwrap();
      toast.success("Brand deleted");
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Brands"
        description="Manage your brands"
        action={
          can("create") && (
            <Link to="/dashboard/brand-management/add">
              <Button>
                <Plus className="size-4" /> Add Brand
              </Button>
            </Link>
          )
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search brands..." value={search} onChange={(e) => onSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Currency</TH>
              <TH>Email</TH>
              <TH>Clients</TH>
              <TH>Invoices</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={6}>
                  <EmptyState title="No brands found" />
                </TD>
              </TR>
            )}
            {data?.data.map((brand) => (
              <TR key={brand.id}>
                <TD className="font-medium">
                  <div className="flex items-center gap-2">
                    {brand.logoUrl && (
                      <img src={brand.logoUrl} alt="" className="size-7 rounded object-contain" />
                    )}
                    <span>
                      {brand.name}
                      {brand.isDefault && <Badge className="ml-2">default</Badge>}
                    </span>
                  </div>
                </TD>
                <TD>{brand.currency}</TD>
                <TD>{brand.email || "-"}</TD>
                <TD>{brand._count?.clients ?? 0}</TD>
                <TD>{brand._count?.invoices ?? 0}</TD>
                <TD className="text-right">
                  <div className="inline-flex gap-1">
                    {can("update") && (
                      <Link to={`/dashboard/brand-management/update/${brand.id}`}>
                        <Button variant="ghost" size="icon" title="Edit">
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                    )}
                    {can("delete") && (
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(brand.id)}>
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

      {data && data.meta.pages > 1 && <Pagination page={page} pages={data.meta.pages} total={data.meta.total} onChange={setPage} />}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete brand?"
        message="Clients and invoices referencing this brand will keep their records."
      />
    </div>
  );
}
