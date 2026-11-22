import { PDFViewer } from "@embedpdf/viewer-react";
import { cn } from "@/lib/utils";

/**
 * In-app PDF viewer used by the invoice editor's PDF preview.
 *
 * The viewer is read-only here: the generated PDF is the authoritative document,
 * so people can zoom, search and navigate pages without editing the invoice.
 */
export function PdfFrame({
  src,
  className,
  title = "Invoice PDF preview",
  paperSize: _paperSize = "A4",
}: {
  src: string;
  className?: string;
  title?: string;
  paperSize?: "A4" | "LETTER";
}) {
  return (
    <div className={cn("h-[70vh] w-full overflow-hidden rounded-lg border border-border bg-neutral-100", className)} aria-label={title}>
      <PDFViewer
        src={src}
        readOnly
        theme="light"
        features={{ forms: false }}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
