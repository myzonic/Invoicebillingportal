import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders an exact A4 / Letter page and scales it down only when the available
 * viewport is narrower. The document itself keeps its physical dimensions, so
 * the live view, print output and downloaded PDF stay identical; phones just
 * get a zoomed-out view instead of a broken horizontal scroll.
 */
export function FitInvoicePage({
  widthMm,
  children,
  className,
}: {
  widthMm: number;
  children: ReactNode;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return;

    const update = () => {
      const available = viewport.clientWidth;
      const natural = page.offsetWidth;
      const next = available > 0 && natural > 0 ? Math.min(1, available / natural) : 1;
      setScale((current) => (Math.abs(current - next) < 0.001 ? current : next));
      setHeight(page.offsetHeight * next);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(page);
    return () => observer.disconnect();
  }, [widthMm]);

  return (
    <div ref={viewportRef} className={cn("w-full", className)} style={height ? { height } : undefined}>
      <div
        ref={pageRef}
        className="origin-top-left"
        style={{ width: `${widthMm}mm`, flexShrink: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
