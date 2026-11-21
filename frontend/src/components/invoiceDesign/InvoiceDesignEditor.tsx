import { useState } from "react";
import { RotateCcw, Sparkles, Undo2 } from "lucide-react";
import type { InvoiceDesign, InvoiceDesignColors } from "@/types";
import { COLOR_ROLES, INVOICE_LAYOUTS, LAYOUT_LABEL, readableOn, sameDesign, suggestColors } from "@/lib/invoiceDesign";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InvoiceDesignPreview, InvoiceLayoutThumb, type PreviewItem } from "./InvoiceDesignPreview";

export interface InvoiceDesignEditorProps {
  value: InvoiceDesign;
  onChange: (design: InvoiceDesign) => void;
  /** Dominant colours extracted from the brand logo. */
  palette?: string[];
  logoUrl?: string | null;
  businessName?: string;
  /** Design currently stored on the server, used by the revert controls. */
  savedDesign?: InvoiceDesign | null;
  /** Restore unsaved edits back to the stored design. */
  onReset?: () => void;
  /** Re-run automatic colour extraction from the logo. */
  onExtract?: () => void;
  extracting?: boolean;
  extractNote?: string;
  /** Sample invoice shown in the live preview. */
  previewItems?: PreviewItem[];
  currency?: string;
  clientName?: string;
  invoiceNumber?: string;
  /** Extra action buttons rendered next to the revert controls. */
  actions?: React.ReactNode;
  /** Hide the big preview (used in tight layouts). */
  hidePreview?: boolean;
}

const PRESET_COLORS = ["#111827", "#1f2937", "#0f766e", "#b45309", "#7c2d12", "#1d4ed8", "#4338ca", "#9f1239"];

export function InvoiceDesignEditor({
  value,
  onChange,
  palette = [],
  logoUrl,
  businessName,
  savedDesign,
  onReset,
  onExtract,
  extracting,
  extractNote,
  previewItems,
  currency,
  clientName,
  invoiceNumber,
  actions,
  hidePreview,
}: InvoiceDesignEditorProps) {
  const [openRole, setOpenRole] = useState<keyof InvoiceDesignColors | null>(null);
  const dirty = Boolean(savedDesign) && !sameDesign(value, savedDesign);

  const setColor = (role: keyof InvoiceDesignColors, color: string) =>
    onChange({ ...value, colors: { ...value.colors, [role]: color.toLowerCase() } });

  const autoAssign = () => {
    if (!palette.length) return;
    onChange({ ...value, colors: suggestColors(palette) });
  };

  return (
    <div className="space-y-5">
      {/* ---------------- Layout picker ---------------- */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold">Layout</h4>
            <p className="text-xs text-muted-foreground">Pick the structure of this brand's invoice.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {INVOICE_LAYOUTS.map((layout) => {
            const selected = value.layout === layout.id;
            return (
              <button
                key={layout.id}
                type="button"
                onClick={() => onChange({ ...value, layout: layout.id })}
                className={cn(
                  "group rounded-xl border p-2 text-left transition-all",
                  selected ? "border-primary ring-2 ring-primary/30 shadow-sm" : "border-border bg-card hover:border-primary/40 hover:shadow-sm",
                )}
              >
                <div className="h-24 overflow-hidden rounded-lg border border-border bg-white">
                  <InvoiceLayoutThumb layout={layout.id} colors={value.colors} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className={cn("text-xs font-semibold", selected ? "text-primary" : "text-foreground")}>{layout.label}</span>
                  {selected && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">Selected</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">{layout.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- Colour roles ---------------- */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold">Colours</h4>
            <p className="text-xs text-muted-foreground">
              {palette.length
                ? `${palette.length} colour${palette.length > 1 ? "s" : ""} detected in the logo — click to assign.`
                : "No logo colours detected yet — pick colours manually."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {palette.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={autoAssign} title="Assign the strongest logo colours automatically">
                <Sparkles className="size-3.5" /> Auto-assign
              </Button>
            )}
            {onExtract && (
              <Button type="button" variant="outline" size="sm" onClick={onExtract} loading={extracting}>
                <RotateCcw className="size-3.5" /> Re-scan logo
              </Button>
            )}
          </div>
        </div>
        {extractNote && <p className="mb-2 text-xs text-muted-foreground">{extractNote}</p>}

        {palette.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">From logo</span>
            {palette.map((c) => (
              <span key={c} className="h-5 w-5 rounded-md border border-black/10 shadow-sm" style={{ background: c }} title={c} />
            ))}
          </div>
        )}

        <div className="space-y-2">
          {COLOR_ROLES.map(({ key, label, hint }) => {
            const current = value.colors[key];
            const isOpen = openRole === key;
            return (
              <div key={key} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-block size-6 shrink-0 rounded-md border border-black/10 shadow-sm" style={{ background: current }} />
                    <div>
                      <div className="text-xs font-semibold">{label}</div>
                      <div className="text-[10px] text-muted-foreground">{hint}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {palette.slice(0, 8).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(key, c)}
                        title={`Use ${c} as ${label.toLowerCase()}`}
                        className={cn(
                          "size-5 rounded-md border transition-transform hover:scale-110",
                          current === c ? "border-foreground ring-2 ring-foreground/30" : "border-black/10",
                        )}
                        style={{ background: c }}
                      />
                    ))}
                    {PRESET_COLORS.filter((c) => !palette.includes(c))
                      .slice(0, 4)
                      .map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(key, c)}
                          title={`Use ${c} as ${label.toLowerCase()}`}
                          className={cn(
                            "size-5 rounded-md border transition-transform hover:scale-110",
                            current === c ? "border-foreground ring-2 ring-foreground/30" : "border-black/10",
                          )}
                          style={{ background: c }}
                        />
                      ))}
                    <label
                      className="relative inline-flex size-5 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border shadow-sm"
                      style={{ background: current }}
                      title="Pick a custom colour"
                    >
                      <input
                        type="color"
                        value={current}
                        onChange={(e) => setColor(key, e.target.value)}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setOpenRole(isOpen ? null : key)}
                      className="ml-1 text-[10px] font-medium text-muted-foreground underline"
                    >
                      {isOpen ? "Hide" : "All"}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                    {[...palette, ...PRESET_COLORS]
                      .filter((c, i, all) => all.indexOf(c) === i)
                      .map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(key, c)}
                          className={cn(
                            "h-6 min-w-[52px] rounded-md border px-1.5 text-[9px] font-semibold",
                            current === c ? "border-foreground ring-2 ring-foreground/30" : "border-black/10",
                          )}
                          style={{ background: c, color: readableOn(c) }}
                          title={`Use ${c}`}
                        >
                          {c}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- Revert controls ---------------- */}
      {(onReset || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div className="text-xs text-muted-foreground">
            {dirty ? (
              <span className="font-medium text-amber-600">Unsaved design changes</span>
            ) : savedDesign ? (
              <span>Design matches the saved brand design.</span>
            ) : (
              <span>No saved design yet — the classic look is used until you save.</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {onReset && (
              <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={!dirty}>
                <Undo2 className="size-3.5" /> Reset changes
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Live preview ---------------- */}
      {!hidePreview && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Live preview</h4>
              <p className="text-xs text-muted-foreground">
                {LAYOUT_LABEL[value.layout]} layout — the same design is used for the client page and the A4 PDF.
              </p>
            </div>
          </div>
          <InvoiceDesignPreview
            design={value}
            logoUrl={logoUrl}
            businessName={businessName}
            items={previewItems}
            currency={currency}
            clientName={clientName}
            invoiceNumber={invoiceNumber}
          />
        </div>
      )}
    </div>
  );
}
