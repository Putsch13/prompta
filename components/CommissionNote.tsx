import { PLATFORM_COMMISSION_PERCENT, creatorNetCents } from "@/lib/stripe";

interface Props {
  priceCents: number;
  className?: string;
}

export function CommissionNote({ priceCents, className = "" }: Props) {
  const net = creatorNetCents(priceCents);
  const commission = priceCents - net;

  return (
    <div
      className={`rounded-lg border border-line bg-card2 px-3 py-2 text-xs text-ink-soft ${className}`}
    >
      Prompta prélève {PLATFORM_COMMISSION_PERCENT} % — vous touchez{" "}
      <strong className="text-ink">{(net / 100).toFixed(2)} €</strong> sur un prix de{" "}
      <strong className="text-ink">{(priceCents / 100).toFixed(2)} €</strong>
      {commission > 0 && (
        <span className="text-ink-faint"> (commission {(commission / 100).toFixed(2)} €)</span>
      )}
    </div>
  );
}
