import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, RemoveFormatting } from "lucide-react";
import { cn, sanitizeHtml } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const BUTTONS: { cmd: string; icon: typeof Bold; title: string }[] = [
  { cmd: "bold", icon: Bold, title: "Bold" },
  { cmd: "italic", icon: Italic, title: "Italic" },
  { cmd: "underline", icon: Underline, title: "Underline" },
  { cmd: "strikeThrough", icon: Strikethrough, title: "Strikethrough" },
  { cmd: "insertUnorderedList", icon: List, title: "Bullet list" },
  { cmd: "insertOrderedList", icon: ListOrdered, title: "Numbered list" },
  { cmd: "removeFormat", icon: RemoveFormatting, title: "Clear formatting" },
];

export function RichTextEditor({ value, onChange, placeholder, className, minHeight = "80px" }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      // Editing a stored description must not execute its markup either, so
      // the same allowlist sanitiser guards this assignment as the renderers.
      ref.current.innerHTML = sanitizeHtml(value || "");
    }
  }, [value]);

  const sync = () => {
    onChange(ref.current?.innerHTML || "");
  };

  const exec = (cmd: string) => {
    ref.current?.focus();
    document.execCommand(cmd);
    sync();
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/50 px-2 py-1">
        {BUTTONS.map(({ cmd, icon: Icon, title }) => (
          <button
            key={cmd}
            type="button"
            title={title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(cmd)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#fff3d4] hover:text-foreground"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={sync}
        onBlur={sync}
        className="richtext max-h-64 min-h-0 w-full overflow-y-auto px-3 py-2 text-sm text-foreground outline-none [&:empty:before]:text-muted-foreground [&:empty:before]:content-[attr(data-placeholder)]"
        style={{ minHeight }}
      />
    </div>
  );
}
