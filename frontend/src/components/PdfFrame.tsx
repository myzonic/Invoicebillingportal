import { cn } from "@/lib/utils";

/** Embeds a PDF (blob URL or same-origin URL) in a scrollable frame. */
export function PdfFrame({ src, className, title = "Invoice PDF preview" }: { src: string; className?: string; title?: string }) {
  return (
    <div className={cn("h-[70vh] w-full overflow-hidden rounded-lg border border-border bg-neutral-100", className)}>
      <iframe src={src} title={title} className="size-full" />
    </div>
  );
}
