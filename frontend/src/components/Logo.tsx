import { ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import { branding } from "@/config/branding";
import AssetImage from "@/components/AssetImage";

/**
 * Renders a brand logo when `src` is provided (public branded payment pages),
 * otherwise falls back to the portal-wide configured logo. Broken uploads fall
 * back gracefully instead of showing a broken-image icon.
 */
export default function Logo({ className, src, alt }: { className?: string; src?: string | null; alt?: string }) {
  const label = alt || branding.companyName;
  const primary = src || branding.logoUrl;
  const fallback = src && branding.logoUrl ? branding.logoUrl : null;

  return (
    <AssetImage
      src={primary}
      alt={label}
      className={cn("object-contain", className)}
      fallback={
        fallback ? (
          <AssetImage
            src={fallback}
            alt={label}
            className={cn("object-contain", className)}
            fallback={<ReceiptText aria-label={label} className={cn("text-neutral-900", className)} />}
          />
        ) : (
          <ReceiptText aria-label={label} className={cn("text-neutral-900", className)} />
        )
      }
    />
  );
}
