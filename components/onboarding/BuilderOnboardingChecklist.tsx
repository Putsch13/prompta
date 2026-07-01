import Link from "next/link";
import { Check, Circle, CreditCard, Plus, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface Props {
  userId: string;
  kycComplete: boolean;
}

export async function BuilderOnboardingChecklist({ userId, kycComplete }: Props) {
  const supabase = await createClient();

  const { data: userListings } = await supabase
    .from("listings")
    .select("id")
    .eq("creator_id", userId);

  const ids = userListings?.map((l) => l.id) ?? [];

  const [{ count: listingCount }, { count: purchaseCount }] = await Promise.all([
    Promise.resolve({ count: ids.length }),
    supabase
      .from("purchases")
      .select("*", { count: "exact", head: true })
      .in("listing_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "completed"),
  ]);

  const steps = [
    {
      id: "stripe",
      label: "Compléter Stripe",
      done: kycComplete,
      href: "/dashboard/payouts",
      icon: CreditCard,
    },
    {
      id: "publish",
      label: "Publier son 1er contenu",
      done: (listingCount ?? 0) > 0,
      href: "/dashboard/new",
      icon: Plus,
    },
    {
      id: "sale",
      label: "Recevoir une 1re vente",
      done: (purchaseCount ?? 0) > 0,
      href: "/dashboard/payouts",
      icon: DollarSign,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <div className="mt-8 rounded-xl border border-line bg-card p-6">
      <h2 className="font-display text-lg font-semibold text-ink">Parcours builder</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {completed}/{steps.length} étapes
      </p>
      <ul className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.id}>
            <Link href={step.href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-card2">
              {step.done ? (
                <Check className="h-5 w-5 text-success" />
              ) : (
                <Circle className="h-5 w-5 text-ink-faint" />
              )}
              <step.icon className="h-4 w-4 text-accent" />
              <span className={`text-sm ${step.done ? "text-ink-soft line-through" : "text-ink"}`}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
