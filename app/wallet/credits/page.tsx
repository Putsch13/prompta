import { TopUp } from "@/components/wallet/TopUp";

export const dynamic = "force-dynamic";

export default function WalletCreditsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Recharger mes crédits</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Lancez des agents sans clé API personnelle — débit au coût réel + marge.
      </p>
      <div className="mt-8">
        <TopUp />
      </div>
    </div>
  );
}
