import { useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function Pagination({
  page,
  pages,
  total,
  onChange,
  limit = 10,
  onLimitChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
  limit?: number;
  onLimitChange?: (limit: number) => void;
}) {
  const go = useCallback(
    (next: number) => {
      if (next >= 1 && next <= pages) onChange(next);
    },
    [onChange, pages],
  );

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 text-sm text-muted-foreground">
      <span>
        Showing {from} - {to} of {total}
      </span>
      <div className="flex items-center gap-3">
        {onLimitChange && (
          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select className="h-8 w-20" value={limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2">
            Page {page} of {Math.max(pages, 1)}
          </span>
          <Button variant="outline" size="icon" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
