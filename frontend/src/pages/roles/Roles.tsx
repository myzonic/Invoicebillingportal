import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { useDeleteRoleMutation, useRolesQuery } from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm";

export default function Roles() {
  const [toDelete, setToDelete] = useState<string | null>(null);
  const can = useCan("roles");

  const { data, isLoading } = useRolesQuery();
  const [deleteRole, { isLoading: deleting }] = useDeleteRoleMutation();

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteRole(toDelete).unwrap();
      toast.success("Role deleted");
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Control what each role can do per module"
        action={
          can("create") && (
            <Link to="/dashboard/roles/add">
              <Button>
                <Plus className="size-4" /> Add Role
              </Button>
            </Link>
          )
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Role</TH>
              <TH>Description</TH>
              <TH>Type</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={4}>
                  <EmptyState title="No roles found" />
                </TD>
              </TR>
            )}
            {data?.data.map((role) => (
              <TR key={role.id}>
                <TD className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    {role.name}
                  </span>
                </TD>
                <TD className="text-muted-foreground">{role.description || "-"}</TD>
                <TD>
                  <Badge tone={role.isSystem ? "PAID" : undefined}>{role.isSystem ? "system" : "custom"}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="inline-flex gap-1">
                    {can("update") && !role.isSystem && (
                      <Link to={`/dashboard/roles/update/${role.id}`}>
                        <Button variant="ghost" size="icon" title="Edit">
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                    )}
                    {can("delete") && !role.isSystem && (
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(role.id)}>
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

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete role?"
        message="Users assigned to this role must be reassigned first."
      />
    </div>
  );
}
