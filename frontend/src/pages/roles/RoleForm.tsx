import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useCreateRoleMutation, useRolesQuery, useUpdateRoleMutation } from "@/app/apiSlice";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/table";

interface PermRow {
  module: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

const ALL_MODULES = ["dashboard", "clients", "invoices", "items", "brands", "merchants", "users", "roles", "logs"];

function emptyPerms(): PermRow[] {
  return ALL_MODULES.map((m) => ({ module: m, canCreate: false, canRead: false, canUpdate: false, canDelete: false }));
}

export default function RoleForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: roles } = useRolesQuery();
  const [createRole, { isLoading: creating }] = useCreateRoleMutation();
  const [updateRole, { isLoading: updating }] = useUpdateRoleMutation();

  const editingRole = roles?.data.find((r) => r.id === id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<PermRow[]>(emptyPerms());

  useEffect(() => {
    if (editingRole) {
      setName(editingRole.name);
      setDescription(editingRole.description || "");
      const map = new Map(editingRole.permissions.map((p) => [p.module, p]));
      setPerms(
        ALL_MODULES.map((m) => {
          const p = map.get(m);
          return p
            ? { module: m, canCreate: p.canCreate, canRead: p.canRead, canUpdate: p.canUpdate, canDelete: p.canDelete }
            : { module: m, canCreate: false, canRead: false, canUpdate: false, canDelete: false };
        }),
      );
    }
  }, [editingRole]);

  const setPerm = (module: string, key: keyof Omit<PermRow, "module">, value: boolean) =>
    setPerms((rows) => rows.map((r) => (r.module === module ? { ...r, [key]: value } : r)));

  const toggleAll = (module: string, value: boolean) =>
    setPerms((rows) => rows.map((r) => (r.module === module ? { ...r, canCreate: value, canRead: value, canUpdate: value, canDelete: value } : r)));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        description,
        permissions: perms.filter((p) => p.canCreate || p.canRead || p.canUpdate || p.canDelete),
      };
      if (isEdit) {
        await updateRole({ id: id!, body: payload as never }).unwrap();
        toast.success("Role updated");
      } else {
        await createRole(payload as never).unwrap();
        toast.success("Role created");
      }
      navigate("/dashboard/roles");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (isEdit && !editingRole) return <Spinner />;

  return (
    <div>
      <PageHeader title={isEdit ? "Edit Role" : "Add Role"} />
      <Card className="mb-6">
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Description">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent>
          <h3 className="mb-4 text-base font-semibold">Module permissions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Module</th>
                  <th className="px-3 py-2 text-center">All</th>
                  <th className="px-3 py-2 text-center">Create</th>
                  <th className="px-3 py-2 text-center">Read</th>
                  <th className="px-3 py-2 text-center">Update</th>
                  <th className="px-3 py-2 text-center">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perms.map((row) => (
                  <tr key={row.module}>
                    <td className="px-3 py-2 font-medium capitalize">{row.module}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={row.canCreate && row.canRead && row.canUpdate && row.canDelete}
                        onChange={(e) => toggleAll(row.module, e.target.checked)}
                      />
                    </td>
                    {(["canCreate", "canRead", "canUpdate", "canDelete"] as const).map((key) => (
                      <td key={key} className="px-3 py-2 text-center">
                        <input type="checkbox" className="size-4" checked={row[key]} onChange={(e) => setPerm(row.module, key, e.target.checked)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/dashboard/roles")}>
          Cancel
        </Button>
        <Button onClick={onSubmit} loading={creating || updating}>
          {isEdit ? "Save changes" : "Create role"}
        </Button>
      </div>
    </div>
  );
}
