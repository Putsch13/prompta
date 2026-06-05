"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, X } from "lucide-react";

interface ApprovalItem {
  id: string;
  runId: string;
  stepIndex: number;
  payload: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  agentTitle: string;
  agentSlug?: string;
}

export default function ValidationsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/approvals");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(item: ApprovalItem, decision: "approved" | "rejected") {
    setActing(item.id);
    try {
      const res = await fetch(`/api/run/agent/${item.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: item.id, decision }),
      });
      if (res.ok) await load();
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Validations en attente</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Approuvez ou rejetez les actions qui nécessitent votre validation humaine.
      </p>

      {items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line py-12 text-center">
          <p className="text-sm text-ink-soft">Aucune validation en attente.</p>
          <Link href="/dashboard/runs" className="mt-3 inline-block text-sm text-accent hover:underline">
            Voir l&apos;historique des runs →
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{item.agentTitle}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Étape {item.stepIndex + 1} · expire{" "}
                    {new Date(item.expiresAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={acting === item.id}
                    onClick={() => decide(item, "approved")}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {acting === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Approuver
                  </button>
                  <button
                    type="button"
                    disabled={acting === item.id}
                    onClick={() => decide(item, "rejected")}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" /> Rejeter
                  </button>
                </div>
              </div>
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-card2 p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(item.payload, null, 2)}
              </pre>
              <Link
                href={`/dashboard/runs?id=${item.runId}`}
                className="mt-2 inline-block text-xs text-accent hover:underline"
              >
                Voir le run →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
