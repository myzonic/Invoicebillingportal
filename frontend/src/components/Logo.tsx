import { cn } from "@/lib/utils";
import { ReceiptText } from "lucide-react";
import { branding } from "@/config/branding";

export default function Logo({ className }: { className?: string }) {
  if (!branding.logoUrl) return <ReceiptText aria-label={branding.companyName} className={cn("text-neutral-900", className)} />;
  return <img src={branding.logoUrl} alt={branding.companyName} className={cn("object-contain", className)} />;
}
