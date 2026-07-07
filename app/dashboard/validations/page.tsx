"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, Sparkles, X, Wand2 } from "lucide-react";

interface ApprovalItem {
  id: string;
  runId: string;
  stepIndex: number;
  payload: { preview?: string; full?: string; label?: string } & Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  agentTitle: string;
  agentSlug?: string;
}

export default function ValidationsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>}>
      <ValidationsContent />
    </Suspense>
  );
}

function ValidationsContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  // Contenu éditable + instruction de correction, par approbation.
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState<Record<string, string>>({});
  const [revising, setRevising] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/approvals");
    if (res.ok) {
      const data = await res.json();
      const next: ApprovalItem[] = data.items ?? [];
      setItems(next);
      // Pré-remplit le contenu éditable avec ce que l'agent propose.
      setEdited((prev) => {
        const merged = { ...prev };
        for (const it of next) {
          // Contenu INTÉGRAL (full) — la préview 2000 car. ne sert qu'aux notifs.
          if (merged[it.id] === undefined) merged[it.id] = it.payload?.full ?? it.payload?.preview ?? "";
        }
        return merged;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, items]);

  async function decide(item: ApprovalItem, decision: "approved" | "rejected") {
    setActing(item.id);
    try {
      const res = await fetch(`/api/run/agent/${item.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: item.id,
          decision,
          ...(decision === "approved" ? { modifiedContent: edited[item.id] ?? "" } : {}),
        }),
      });
      if (res.ok) await load();
    } finally {
      setActing(null);
    }
  }

  async function askAi(item: ApprovalItem) {
    const instr = instruction[item.id]?.trim();
    if (!instr) return;
    setRevising(item.id);
    try {
      const res = await fetch(`/api/run/agent/${item.runId}/approve/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: item.id, instruction: instr, content: edited[item.id] ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.revised) {
        setEdited((prev) => ({ ...prev, [item.id]: data.revised }));
        setInstruction((prev) => ({ ...prev, [item.id]: "" }));
      }
    } finally {
      setRevising(null);
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
        Vos agents en fond s&apos;arrêtent ici quand ils ont besoin de votre feu vert. Relisez,
        modifiez si besoin (ou demandez à l&apos;IA de corriger), puis validez ou refusez.
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
          {items.map((item) => {
            const isFocus = item.id === focusId;
            return (
              <div
                key={item.id}
                ref={isFocus ? focusRef : undefined}
                className={`rounded-xl border bg-card p-4 ${isFocus ? "border-amber-400 ring-2 ring-amber-400/30" : "border-line"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{item.agentTitle}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {item.payload?.label ? `${item.payload.label} · ` : ""}Étape {item.stepIndex + 1} ·
                      expire {new Date(item.expiresAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>

                <label className="mt-3 block text-xs font-medium text-ink-soft">
                  Ce que l&apos;agent s&apos;apprête à faire — modifiable avant validation
                </label>
                <textarea
                  value={edited[item.id] ?? ""}
                  onChange={(e) => setEdited((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  rows={8}
                  className="mt-1.5 w-full rounded-lg border border-line bg-card2/40 px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={instruction[item.id] ?? ""}
                    onChange={(e) => setInstruction((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Demander à l'IA : « raccourcis », « ton plus formel »…"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-xs outline-none focus:border-accent"
                    onKeyDown={(e) => { if (e.key === "Enter") askAi(item); }}
                  />
                  <button
                    type="button"
                    disabled={revising === item.id || !(instruction[item.id]?.trim())}
                    onClick={() => askAi(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
                  >
                    {revising === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    Corriger avec l&apos;IA
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    disabled={acting === item.id}
                    onClick={() => decide(item, "approved")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {acting === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Valider et continuer
                  </button>
                  <button
                    type="button"
                    disabled={acting === item.id}
                    onClick={() => decide(item, "rejected")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" /> Refuser
                  </button>
                  <Link
                    href={`/dashboard/runs/${item.runId}`}
                    className="ml-auto inline-flex items-center gap-1.5 self-center text-xs text-ink-soft hover:text-ink hover:underline"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Voir le run complet →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
