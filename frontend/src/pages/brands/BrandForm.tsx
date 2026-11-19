import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  useBrandQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useUploadMutation,
  useRatesQuery,
} from "@/app/apiSlice";
import { errorMessage } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea, Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/table";

const FALLBACK_CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"];
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SUBDOMAIN_RE = /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^pay\./, "")
    .split(/[/?#]/)[0]
    .replace(/\/+$/, "");
}

function normalizeSubdomain(value: string) {
  return value.trim().toLowerCase().replace(/\..*$/, "").replace(/[^a-z0-9-]/g, "") || "pay";
}

export default function BrandForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: brandData, isLoading: loadingBrand } = useBrandQuery(id!, { skip: !id });
  const [createBrand, { isLoading: creating }] = useCreateBrandMutation();
  const [updateBrand, { isLoading: updating }] = useUpdateBrandMutation();
  const [upload, { isLoading: uploading }] = useUploadMutation();
  const { data: ratesData } = useRatesQuery();
  const currencyOptions = ratesData?.data?.currencies?.length ? ratesData.data.currencies : FALLBACK_CURRENCIES;

  const [form, setForm] = useState({
    name: "",
    businessName: "",
    domain: "",
    paymentSubdomain: "pay",
    country: "",
    website: "",
    currency: "USD",
    email: "",
    phone: "",
    address: "",
    pdfHeader: "",
    pdfFooter: "",
    isDefault: false,
    isActive: true,
    paymentEnabled: true,
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
        businessName: b.businessName || "",
        domain: b.domain || "",
        paymentSubdomain: b.paymentSubdomain || "pay",
        country: b.country || "",
        website: b.website || "",
        currency: b.currency,
        email: b.email || "",
        phone: b.phone || "",
        address: b.address || "",
        pdfHeader: b.pdfHeader || "",
        pdfFooter: b.pdfFooter || "",
        isDefault: b.isDefault,
        isActive: b.isActive ?? true,
        paymentEnabled: b.paymentEnabled ?? true,
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

  const { domain, subdomain, paymentDomain, domainError } = useMemo(() => {
    const d = normalizeDomain(form.domain);
    const s = normalizeSubdomain(form.paymentSubdomain);
    let error = "";
    if (d && !DOMAIN_RE.test(d)) error = "Enter a valid domain, e.g. crystalwebsites.com.au";
    else if (!SUBDOMAIN_RE.test(s)) error = "Subdomain may contain only letters, numbers and hyphens";
    return { domain: d, subdomain: s, paymentDomain: d ? `${s}.${d}` : "", domainError: error };
  }, [form.domain, form.paymentSubdomain]);

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
    if (domainError) {
      toast.error(domainError);
      return;
    }
    try {
      let logoUrl = form.logoUrl;
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        const res = await upload(fd).unwrap();
        logoUrl = res.data.url;
      }
      const body = {
        ...form,
        domain,
        paymentSubdomain: subdomain,
        paymentSettings: form.paymentEnabled ? {} : { disabled: true },
        logoUrl,
      };
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
    <div className="max-w-2xl">
      <PageHeader title={isEdit ? "Edit Brand" : "Add Brand"} />
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Brand identity</h3>
              <p className="text-xs text-muted-foreground">Shown on invoices, the PDF and the branded payment page.</p>
            </div>
            <Field label="Brand name" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <Field label="Business name" hint="Legal/trading name shown to clients (defaults to brand name)">
              <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder={form.name} />
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

            <div className="space-y-1 pt-2">
              <h3 className="text-sm font-semibold">Domain & payment link</h3>
              <p className="text-xs text-muted-foreground">
                Each invoice for this brand gets a permanent link at <code>https://{paymentDomain || "pay.yourdomain.com"}/invoice/&#123;token&#125;</code>.
                DNS and SSL for this host are configured outside the portal (see README).
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Field label="Primary domain" hint="e.g. crystalwebsites.com.au">
                <Input value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="crystalwebsites.com.au" />
              </Field>
              <Field label="Payment subdomain">
                <Input value={form.paymentSubdomain} onChange={(e) => set("paymentSubdomain", e.target.value)} placeholder="pay" />
              </Field>
            </div>
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${domainError ? "border-destructive/50 bg-destructive/5 text-destructive" : "border-border bg-muted/50"}`}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Generated payment domain: </span>
              <span className="font-semibold">{paymentDomain || "—"}</span>
              {domainError && <p className="mt-1 text-xs">{domainError}</p>}
            </div>

            <div className="space-y-1 pt-2">
              <h3 className="text-sm font-semibold">Business details & payment settings</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Australia" />
              </Field>
              <Field label="Business email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" />
              </Field>
              <Field label="Default brand">
                <Select value={form.isDefault ? "yes" : "no"} onChange={(e) => set("isDefault", e.target.value === "yes")}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Select>
              </Field>
              <Field label="Active">
                <Select value={form.isActive ? "yes" : "no"} onChange={(e) => set("isActive", e.target.value === "yes")}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
              <Field label="Online payments">
                <Select value={form.paymentEnabled ? "yes" : "no"} onChange={(e) => set("paymentEnabled", e.target.value === "yes")}>
                  <option value="yes">Enabled</option>
                  <option value="no">Disabled</option>
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
