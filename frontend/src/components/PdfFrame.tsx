import { cn } from "@/lib/utils";
import { FitInvoicePage } from "@/components/invoiceDesign/FitInvoicePage";

/**
 * Embeds the generated PDF at its true physical page size, scaled down to fit
 * phones/tablets. Without this, browser viewers zoom to "fit width" and the
 * document looks like the wrong paper size.
 */
export function PdfFrame({
  src,
  className,
  title = "Invoice PDF preview",
  paperSize = "A4",
}: {
  src: string;
  className?: string;
  title?: string;
  paperSize?: "A4" | "LETTER";
}) {
  const widthMm = paperSize === "LETTER" ? 215.9 : 210;
  const heightMm = paperSize === "LETTER" ? 279.4 : 297;

  return (
    <div className={cn("h-[70vh] w-full overflow-auto rounded-lg border border-border bg-neutral-100", className)}>
      <FitInvoicePage widthMm={widthMm} className="min-h-full">
        <iframe
          src={src}
          title={title}
          style={{ height: `${heightMm}mm` }}
          className="block w-full border-0 bg-white"
        />
      </FitInvoicePage>
    </div>
  );
}
