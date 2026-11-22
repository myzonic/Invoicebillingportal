import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import AssetImage from "@/components/AssetImage";
import type { PaymentBrandIdentity } from "@/types";
import { money, rgba, shade } from "@/lib/utils";

interface VerifiedInvoice {
  number?: string | null;
  total?: number | string | null;
  currency?: string | null;
  paymentState?: string | null;
  pendingPayment?: boolean;
  status?: string | null;
}

interface Props {
  variant: "success" | "cancel";
  /** Identity detected from the current payment hostname. Never a portal default. */
  brand: PaymentBrandIdentity;
  /** Verified invoice data returned by the backend, not the redirect URL. */
  invoice?: VerifiedInvoice | null;
  /** True while a successful payment is still being confirmed by the backend. */
  verifying: boolean;
  pdfHref?: string | null;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return 0;
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Picks a readable foreground for a brand color while keeping brand ink first. */
function onSurface(color: string, surface: string, fallback: string): string {
  return contrast(color, surface) >= 4.5 ? color : fallback;
}

/** Picks the better of white and the brand ink for text on a colored button. */
function buttonText(background: string, ink: string): string {
  return contrast("#ffffff", background) >= contrast(ink, background) ? "#ffffff" : ink;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

/**
 * Reusable, brand-agnostic payment result screen. Every visible color comes
 * from the host-detected brand identity passed in by the route container.
 */
export default function PaymentSuccessScreen({ variant, brand, invoice, verifying, pdfHref }: Props) {
  const colors = brand.colors;
  const displayName = brand.businessName || brand.name;
  const paid = invoice?.paymentState === "COMPLETED" || invoice?.status === "PAID";
  const processing = invoice?.paymentState === "PROCESSING" || invoice?.pendingPayment === true;
  const showSuccess = variant === "success" && paid;
  const showPending = variant === "success" && !paid && (verifying || processing);
  const confirmedAmount = paid && invoice ? money(invoice.total, invoice.currency || brand.currency) : null;

  const StatusIcon = showPending ? Loader2 : showSuccess ? CheckCircle2 : XCircle;
  const statusColor = showPending ? colors.secondary : showSuccess ? colors.accent : "#dc2626";

  // The card is white, while the outer surface uses the brand background.
  // Keep every readable choice inside the detected brand's own palette.
  const cardText = onSurface(colors.text, "#ffffff", colors.primary);
  const cardMuted = onSurface(colors.secondary, "#ffffff", colors.primary);
  const emphasis = onSurface(colors.accent, "#ffffff", colors.primary);
  const statusInk = onSurface(statusColor, "#ffffff", colors.primary);
  const buttonInk = buttonText(colors.button, colors.primary);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-6"
      style={{
        background: `linear-gradient(135deg, ${colors.background} 0%, ${shade(colors.supporting, 0.45)} 100%)`,
        color: colors.text,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse_at_top_right,${rgba(colors.accent, 0.16)},transparent 55%),radial-gradient(ellipse_at_bottom_left,${rgba(colors.secondary, 0.12)},transparent 55%)`,
        }}
      />
      <main
        className="relative w-full max-w-md rounded-3xl border px-6 py-9 text-center shadow-xl sm:px-8"
        style={{
          background: "#ffffff",
          color: cardText,
          borderColor: rgba(colors.accent, 0.35),
          boxShadow: `0 28px 70px -34px ${rgba(colors.primary, 0.55)}`,
        }}
      >
        {/* Logo sits directly on the surface: no box, card, border or tinted frame. */}
        <div className="mb-6 flex min-h-16 items-center justify-center">
          {brand.logoUrl ? (
            <AssetImage
              src={brand.logoUrl}
              alt={`${displayName} logo`}
              className="block h-auto max-h-16 w-auto max-w-[220px] object-contain"
              fallback={
                <span className="text-sm font-bold tracking-wide" style={{ color: colors.primary }}>
                  {initials(displayName)}
                </span>
              }
            />
          ) : (
            <span className="text-sm font-bold tracking-wide" style={{ color: colors.primary }}>
              {initials(displayName)}
            </span>
          )}
        </div>

        <p className="mb-5 text-sm font-semibold tracking-wide" style={{ color: cardMuted }}>
          {displayName}
        </p>

        <div
          className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full"
          style={{ background: rgba(statusInk, 0.14), color: statusInk }}
        >
          <StatusIcon className={`size-8 ${showPending ? "animate-spin" : ""}`} aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold" style={{ color: colors.primary }}>
          {showPending
            ? "Confirming your payment"
            : showSuccess
              ? "Payment successful"
              : variant === "cancel"
                ? "Payment cancelled"
                : "Payment not confirmed"}
        </h1>

        {showPending ? (
          <p className="mt-3 text-sm" style={{ color: cardText }}>
            We are checking the payment with Square. This page will update automatically.
          </p>
        ) : showSuccess ? (
          <>
            {confirmedAmount && (
              <p className="mt-3 text-3xl font-extrabold" style={{ color: emphasis }}>
                {confirmedAmount}
              </p>
            )}
            {invoice?.number && (
              <p className="mt-2 text-xs font-medium" style={{ color: cardMuted }}>
                Invoice {invoice.number}
              </p>
            )}
            <p className="mt-4 text-sm" style={{ color: cardText }}>
              Thank you! Your payment has been received. A receipt is on its way to your email.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm" style={{ color: cardText }}>
            {variant === "cancel"
              ? "You cancelled the payment. No charge was made. You can try again at any time."
              : "We could not verify a completed payment for this invoice. Please check your payment status or contact support."}
          </p>
        )}

        {brand.pdfFooter && (
          <p className="mt-5 whitespace-pre-line text-xs" style={{ color: cardMuted }}>
            {brand.pdfFooter}
          </p>
        )}

        {showSuccess && pdfHref && (
          <a
            href={pdfHref}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: colors.button, color: buttonInk }}
          >
            <Download className="size-4" aria-hidden="true" /> Download Invoice PDF
          </a>
        )}
      </main>
    </div>
  );
}
