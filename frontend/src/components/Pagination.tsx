import { useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const go = useCallback(
    (next: number) => {
      if (next >= 1 && next <= pages) onChange(next);
    },
    [onChange, pages],
  );

  return (
    <div className="flex items-center justify-between gap-4 pt-4 text-sm text-muted-foreground">
      <span>
        Showing {total === 0 ? 0 : (page - 1) * 10 + 1} - {Math.min(page * 10, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={() => go(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2">
          Page {page} of {Math.max(pages, 1)}
        </span>
        <Button variant="outline" size="icon" onClick={() => go(page + 1)} disabled={page >= pages}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
