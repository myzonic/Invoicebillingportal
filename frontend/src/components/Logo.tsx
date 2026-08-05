import { cn } from "@/lib/utils";

export default function Logo({ className }: { className?: string }) {
  return <img src="/logo.jpg" alt="Myzonic" className={cn("object-contain", className)} />;
}
