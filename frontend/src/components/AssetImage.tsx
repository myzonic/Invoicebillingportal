import { useEffect, useState, type ReactNode } from "react";
import { assetUrl } from "@/lib/assets";

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}

/** Renders a resolved upload URL and swaps to a neutral fallback if it fails. */
export default function AssetImage({ src, alt = "", className, fallback }: Props) {
  const [failed, setFailed] = useState(false);
  const url = assetUrl(src);

  useEffect(() => setFailed(false), [src]);

  if (!url || failed) return <>{fallback}</>;
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
