import { cn } from "@/lib/utils";
import { ReceiptText } from "lucide-react";
import { branding } from "@/config/branding";

/**
 * Renders a brand logo when `src` is provided (public branded payment pages),
 * otherwise falls back to the portal-wide configured logo.
 */
export default function Logo({ className, src, alt }: { className?: string; src?: string | null; alt?: string }) {
  const url = src || branding.logoUrl;
  const label = alt || branding.companyName;
  if (!url) return <ReceiptText aria-label={label} className={cn("text-neutral-900", className)} />;
  return <img src={url} alt={label} className={cn("object-contain", className)} />;
}
