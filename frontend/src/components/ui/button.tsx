import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium tracking-tight transition-all outline-none",
          "disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1",
          "active:scale-[0.98]",
          variant === "primary" &&
            "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-sm hover:brightness-105 hover:shadow-md",
          variant === "secondary" && "bg-muted text-foreground hover:bg-muted/70",
          variant === "outline" && "border border-border bg-card shadow-sm hover:bg-muted hover:border-primary/30",
          variant === "ghost" && "hover:bg-muted",
          variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          variant === "success" && "bg-success text-white hover:bg-success/90",
          size === "sm" && "h-8 px-3 text-xs",
          size === "md" && "h-9 px-4 text-sm",
          size === "lg" && "h-11 px-6 text-sm",
          size === "icon" && "h-9 w-9",
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
