import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useCreateUserMutation, useRolesQuery, useUpdateUserMutation, useUsersQuery } from "@/app/apiSlice";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/table";

export default function UserForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: users } = useUsersQuery({ limit: 100 });
  const { data: roles } = useRolesQuery();
  const [createUser, { isLoading: creating }] = useCreateUserMutation();
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation();

  const editingUser = users?.data.find((u) => u.id === id);

  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: "", isActive: true });

  useEffect(() => {
    if (editingUser) {
      setForm({
        name: editingUser.name,
        email: editingUser.email,
        password: "",
        roleId: editingUser.role.id,
        isActive: editingUser.isActive,
      });
    }
  }, [editingUser]);

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, unknown> = { name: form.name, email: form.email, roleId: form.roleId, isActive: form.isActive };
      if (form.password) payload.password = form.password;
      if (isEdit) {
        await updateUser({ id: id!, body: payload }).unwrap();
        toast.success("User updated");
      } else {
        await createUser(payload).unwrap();
        toast.success("User created");
      }
      navigate("/dashboard/user-management");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (isEdit && !editingUser) return <Spinner />;

  return (
    <div className="max-w-xl">
      <PageHeader title={isEdit ? "Edit User" : "Add User"} />
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full name" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            </Field>
            <Field label={isEdit ? "New password (leave blank to keep)" : "Password"} hint={isEdit ? undefined : "Minimum 8 characters"}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                minLength={isEdit ? undefined : 8}
                required={!isEdit}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" required>
                <Select value={form.roleId} onChange={(e) => set("roleId", e.target.value)} required>
                  <option value="">Select role...</option>
                  {roles?.data.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.isActive ? "active" : "inactive"} onChange={(e) => set("isActive", e.target.value === "active")}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard/user-management")}>
                Cancel
              </Button>
              <Button type="submit" loading={creating || updating}>
                {isEdit ? "Save changes" : "Create user"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
