import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, ExternalLink, FileText } from "lucide-react";
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
import AssetImage from "@/components/AssetImage";

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
        title="Brands / Companies"
        description="Manage brand identities, payment domains and branding for invoices"
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
              <TH>Brand</TH>
              <TH>Primary domain</TH>
              <TH>Payment domain</TH>
              <TH>Status</TH>
              <TH>Invoices</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={6}>
                  <EmptyState title="No brands found" hint="Add your first brand to start issuing branded payment links." />
                </TD>
              </TR>
            )}
            {data?.data.map((brand) => (
              <TR key={brand.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                      <AssetImage
                        src={brand.logoUrl}
                        alt={brand.name}
                        className="h-full w-full object-contain"
                        fallback={<span className="text-xs font-bold">{brand.name.slice(0, 2).toUpperCase()}</span>}
                      />
                    </div>
                    <div>
                      <div className="font-medium">
                        {brand.name}
                        {brand.isDefault && <Badge className="ml-2">default</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{brand.businessName || brand.currency}</div>
                    </div>
                  </div>
                </TD>
                <TD className="text-sm">{brand.domain || <span className="text-muted-foreground">—</span>}</TD>
                <TD className="text-sm font-medium">
                  {brand.paymentDomain ? (
                    <a
                      href={`https://${brand.paymentDomain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {brand.paymentDomain} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not configured</span>
                  )}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Badge className={brand.isActive === false ? "bg-muted text-muted-foreground" : "bg-success/10 text-success"}>
                      {brand.isActive === false ? "Inactive" : "Active"}
                    </Badge>
                    {brand.paymentEnabled === false && <Badge className="bg-warning/10 text-warning">Payments off</Badge>}
                  </div>
                </TD>
                <TD>{brand._count?.invoices ?? 0}</TD>
                <TD className="text-right">
                  <div className="inline-flex gap-1">
                    <Link to={`/dashboard/invoices?brand=${brand.id}`} title="View brand invoices">
                      <Button variant="ghost" size="icon">
                        <FileText className="size-4" />
                      </Button>
                    </Link>
                    {can("update") && (
                      <Link to={`/dashboard/brand-management/update/${brand.id}`} title="Manage / Edit / Settings">
                        <Button variant="ghost" size="icon">
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
