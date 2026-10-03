import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { useBrandQuery, useCreateBrandMutation, useUpdateBrandMutation, useUploadMutation } from "@/app/apiSlice";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea, Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/table";

export default function BrandForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: brandData, isLoading: loadingBrand } = useBrandQuery(id!, { skip: !id });
  const [createBrand, { isLoading: creating }] = useCreateBrandMutation();
  const [updateBrand, { isLoading: updating }] = useUpdateBrandMutation();
  const [upload, { isLoading: uploading }] = useUploadMutation();

  const [form, setForm] = useState({
    name: "",
    currency: "USD",
    email: "",
    phone: "",
    address: "",
    pdfHeader: "",
    pdfFooter: "",
    isDefault: false,
    logoUrl: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (brandData) {
      const b = brandData.data;
      setForm({
        name: b.name,
        currency: b.currency,
        email: b.email || "",
        phone: b.phone || "",
        address: b.address || "",
        pdfHeader: b.pdfHeader || "",
        pdfFooter: b.pdfFooter || "",
        isDefault: b.isDefault,
        logoUrl: b.logoUrl || "",
      });
      setPreview(b.logoUrl || "");
    }
  }, [brandData]);

  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setLogoFile(file);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      let logoUrl = form.logoUrl;
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        const res = await upload(fd).unwrap();
        logoUrl = res.data.url;
      }
      const body = { ...form, logoUrl };
      if (isEdit) {
        await updateBrand({ id: id!, body }).unwrap();
        toast.success("Brand updated");
      } else {
        await createBrand(body).unwrap();
        toast.success("Brand created");
      }
      navigate("/dashboard/brand-management");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (loadingBrand) return <Spinner />;

  return (
    <div className="max-w-xl">
      <PageHeader title={isEdit ? "Edit Brand" : "Add Brand"} />
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Brand name" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>

            <Field label="Logo">
              <div className="flex items-center gap-3">
                <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-input bg-muted">
                  {preview ? (
                    <img src={preview} alt="Brand logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImagePlus className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onPickLogo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
                    {preview ? "Change logo" : "Upload logo"}
                  </Button>
                  {preview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLogoFile(null);
                        setPreview("");
                        setForm((f) => ({ ...f, logoUrl: "" }));
                      }}
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {["USD", "AUD", "EUR", "GBP", "CAD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Default brand">
                <Select value={form.isDefault ? "yes" : "no"} onChange={(e) => set("isDefault", e.target.value === "yes")}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Select>
              </Field>
            </div>
            <Field label="Address">
              <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>

            <div className="space-y-1 pt-2">
              <h3 className="text-sm font-semibold">PDF customization</h3>
              <p className="text-xs text-muted-foreground">
                Shown on the invoice PDF. Header appears next to the logo; footer replaces the default thank-you line.
              </p>
            </div>
            <Field label="PDF header text (one line per row)">
              <Textarea
                value={form.pdfHeader}
                onChange={(e) => set("pdfHeader", e.target.value)}
                placeholder={"e.g. 123 Business Street, City\ninvoice@example.com"}
                rows={3}
              />
            </Field>
            <Field label="PDF footer text">
              <Textarea value={form.pdfFooter} onChange={(e) => set("pdfFooter", e.target.value)} rows={2} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard/brand-management")}>
                Cancel
              </Button>
              <Button type="submit" loading={creating || updating || uploading}>
                {isEdit ? "Save changes" : "Create brand"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
