import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-card transition-shadow duration-200",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-start justify-between gap-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

const toneChip: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export const StatCard = ({
  label,
  value,
  icon,
  tone = "default",
  className,
  ...props
}: { label: string; value: React.ReactNode; icon?: React.ReactNode; tone?: "default" | "success" | "warning" | "destructive" } & HTMLAttributes<HTMLDivElement>) => (
  <Card className={cn("flex flex-col gap-3 p-5 hover:shadow-card-hover", className)} {...props}>
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {icon && (
        <span className={cn("flex size-9 items-center justify-center rounded-xl", toneChip[tone])}>{icon}</span>
      )}
    </div>
    <div className="text-2xl font-bold tracking-tight">{value}</div>
  </Card>
);
