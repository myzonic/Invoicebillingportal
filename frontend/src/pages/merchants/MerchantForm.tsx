import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useBrandsQuery, useCreateMerchantMutation, useMerchantQuery, useUpdateMerchantMutation } from "@/app/apiSlice";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea, Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/table";

export default function MerchantForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: merchantData, isLoading: loadingMerchant } = useMerchantQuery(id!, { skip: !id });
  const { data: brands } = useBrandsQuery({ limit: 100 });
  const [createMerchant, { isLoading: creating }] = useCreateMerchantMutation();
  const [updateMerchant, { isLoading: updating }] = useUpdateMerchantMutation();

  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", brandId: "", isActive: true });

  useEffect(() => {
    if (merchantData) {
      const m = merchantData.data;
      setForm({
        name: m.name,
        email: m.email || "",
        phone: m.phone || "",
        address: m.address || "",
        brandId: m.brandId || "",
        isActive: m.isActive,
      });
    }
  }, [merchantData]);

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, brandId: form.brandId || undefined };
      if (isEdit) {
        await updateMerchant({ id: id!, body: payload }).unwrap();
        toast.success("Merchant updated");
      } else {
        await createMerchant(payload).unwrap();
        toast.success("Merchant created");
      }
      navigate("/dashboard/merchant-management");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (loadingMerchant) return <Spinner />;

  return (
    <div className="max-w-xl">
      <PageHeader title={isEdit ? "Edit Merchant" : "Add Merchant"} />
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Merchant name" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand">
                <Select value={form.brandId} onChange={(e) => set("brandId", e.target.value)}>
                  <option value="">No brand</option>
                  {brands?.data.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
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
            <Field label="Address">
              <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard/merchant-management")}>
                Cancel
              </Button>
              <Button type="submit" loading={creating || updating}>
                {isEdit ? "Save changes" : "Create merchant"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
