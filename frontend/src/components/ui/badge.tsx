import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-primary/10 text-primary",
  PAID: "bg-success/10 text-success",
  OVERDUE: "bg-destructive/10 text-destructive",
  PARTIALLY_PAID: "bg-warning/10 text-warning",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

const dots: Record<string, string> = {
  DRAFT: "bg-muted-foreground",
  SENT: "bg-primary",
  PAID: "bg-success",
  OVERDUE: "bg-destructive",
  PARTIALLY_PAID: "bg-warning",
  CANCELLED: "bg-muted-foreground",
};

export function Badge({ children, tone, className }: { children: React.ReactNode; tone?: string; className?: string }) {
  const hasDot = tone ? dots[tone] : undefined;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone ? (tones[tone] ?? "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {hasDot && <span className={cn("size-1.5 rounded-full", hasDot)} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status}>{status.replace("_", " ").toLowerCase()}</Badge>;
}
