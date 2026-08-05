import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useDeleteUserMutation, useUsersQuery } from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { errorMessage, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm";

export default function Users() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const can = useCan("users");

  const { data, isLoading } = useUsersQuery({ page, limit: 10, search: debounced });
  const [deleteUser, { isLoading: deleting }] = useDeleteUserMutation();

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    const t = setTimeout(() => setDebounced(value), 400);
    return () => clearTimeout(t);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteUser(toDelete).unwrap();
      toast.success("User deleted");
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage portal users"
        action={
          can("create") && (
            <Link to="/dashboard/user-management/add">
              <Button>
                <Plus className="size-4" /> Add User
              </Button>
            </Link>
          )
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={(e) => onSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={6}>
                  <EmptyState title="No users found" />
                </TD>
              </TR>
            )}
            {data?.data.map((user) => (
              <TR key={user.id}>
                <TD className="font-medium">{user.name}</TD>
                <TD>{user.email}</TD>
                <TD>
                  <Badge>{user.role?.name}</Badge>
                </TD>
                <TD>
                  <Badge tone={user.isActive ? "PAID" : "CANCELLED"}>{user.isActive ? "active" : "disabled"}</Badge>
                </TD>
                <TD>{formatDate(user.createdAt)}</TD>
                <TD className="text-right">
                  <div className="inline-flex gap-1">
                    {can("update") && (
                      <Link to={`/dashboard/user-management/update/${user.id}`}>
                        <Button variant="ghost" size="icon" title="Edit">
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                    )}
                    {can("delete") && (
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(user.id)}>
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
        title="Delete user?"
        message="Their audit history is preserved."
      />
    </div>
  );
}
