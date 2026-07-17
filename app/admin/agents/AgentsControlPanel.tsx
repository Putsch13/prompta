"use client";

/**
 * app/admin/agents/AgentsControlPanel.tsx
 * ────────────────────────────────────────────────────────────
 * Interface de pilotage des agents (Client Component).
 *
 * 3 onglets :
 *  - Agents     : activer/désactiver, lancer manuellement
 *  - Planning   : choisir les jours + heures (les "soirs travaillés")
 *  - À valider  : approuver ou rejeter ce que les agents ont produit
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type AgentDef = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  requires_review: boolean;
  max_runs_per_day: number;
};

type Schedule = {
  id: string;
  agent_slug: string;
  days: number[];
  hours: number[];
  is_enabled: boolean;
};

type Output = {
  id: string;
  agent_slug: string;
  kind: string;
  title: string | null;
  payload: Record<string, unknown>;
  quality_score: number | null;
  is_sandbox: boolean;
  created_at: string;
};

type Budget = {
  daily_cap_usd: number;
  monthly_cap_usd: number;
  daily_spent_usd: number;
  monthly_spent_usd: number;
  is_paused: boolean;
  mode: "sandbox" | "live";
} | null;

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default function AgentsControlPanel({
  definitions,
  schedules,
  pendingOutputs,
  budget,
}: {
  definitions: AgentDef[];
  schedules: Schedule[];
  pendingOutputs: Output[];
  budget: Budget;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"agents" | "schedule" | "review">("agents");
  const [localDefs, setLocalDefs] = useState(definitions);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setLocalDefs(definitions);
  }, [definitions]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── Actions API ──
  const runAgent = async (slug: string) => {
    setBusy(slug);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      flash(data.ok ? `✅ ${data.summary}` : `⚠️ ${data.reason}`);
      router.refresh();
    } catch {
      flash("❌ Erreur réseau");
    } finally {
      setBusy(null);
    }
  };

  const toggleAgent = async (slug: string, enabled: boolean) => {
    setBusy(`toggle-${slug}`);
    try {
      const res = await fetch(`/api/admin/agents/${encodeURIComponent(slug)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.ok) {
        setLocalDefs((prev) =>
          prev.map((a) => (a.slug === slug ? { ...a, is_enabled: enabled } : a))
        );
        flash(`✅ Agent ${enabled ? "activé" : "désactivé"}`);
        router.refresh();
      } else {
        flash(`❌ ${data.error ?? "Échec du toggle"}`);
      }
    } catch {
      flash("❌ Erreur réseau");
    } finally {
      setBusy(null);
    }
  };

  const testAgent = async (slug: string) => {
    setBusy(`test-${slug}`);
    try {
      const res = await fetch(`/api/admin/agents/${slug}/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        flash(`✅ Test OK — ${data.reason}`);
      } else {
        const reasons = data.reasons?.join(", ") ?? data.reason ?? data.error;
        flash(`⚠️ Bloqué : ${reasons}`);
      }
    } catch {
      flash("❌ Erreur réseau");
    } finally {
      setBusy(null);
    }
  };

  const reviewOutput = async (outputId: string, action: "approve" | "reject") => {
    setBusy(outputId);
    try {
      const res = await fetch("/api/agents/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId, action }),
      });
      const data = await res.json();
      flash(data.ok ? `✅ ${data.note ?? (action === "approve" ? "Publié" : "Rejeté")}` : `❌ ${data.error}`);
      router.refresh();
    } catch {
      flash("❌ Erreur réseau");
    } finally {
      setBusy(null);
    }
  };

  // ── Actions sandbox / sécurité ──
  const sandboxAction = async (action: string, mode?: string) => {
    setBusy("sandbox");
    try {
      const res = await fetch("/api/agents/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode }),
      });
      const data = await res.json();
      flash(data.ok ? "✅ Fait" : `❌ ${data.error}`);
      router.refresh();
    } catch {
      flash("❌ Erreur réseau");
    } finally {
      setBusy(null);
    }
  };

  const isSandbox = budget?.mode === "sandbox";

  const tabs = [
    { key: "agents" as const, label: "Agents" },
    { key: "schedule" as const, label: "Planning" },
    { key: "review" as const, label: `À valider (${pendingOutputs.length})` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Centre de contrôle des agents</h1>
        <p className="text-sm text-ink-soft">
          Active, planifie et valide tes 7 agents. Rien n&apos;est publié sans ton accord.
        </p>
      </div>

      {/* Bandeau Sandbox / Sécurité */}
      {budget && (
        <div
          className={`rounded-xl border p-4 ${
            isSandbox ? "border-accent/30 bg-accent/10" : "border-success/30 bg-success/10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold text-accent-ink ${
                  isSandbox ? "bg-accent" : "bg-success"
                }`}
              >
                {isSandbox ? "🧪 MODE SANDBOX" : "🟢 MODE LIVE"}
              </span>
              <span className="text-xs text-ink-soft">
                {isSandbox
                  ? "Réponses simulées, coût API = 0 $. Aucune donnée réelle créée."
                  : "Appels API réels. Budget surveillé et débité."}
              </span>
            </div>
            <button
              onClick={() => sandboxAction("set_mode", isSandbox ? "live" : "sandbox")}
              disabled={busy === "sandbox"}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-glow-sm disabled:opacity-50 ${
                isSandbox ? "bg-success" : "bg-accent hover:bg-accent-hover"
              }`}
            >
              {isSandbox ? "→ Passer en LIVE" : "→ Repasser en SANDBOX"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-xs text-ink-soft">
              Budget : <strong>${budget.daily_spent_usd.toFixed(2)}</strong>/${budget.daily_cap_usd}{" "}
              aujourd&apos;hui · <strong>${budget.monthly_spent_usd.toFixed(2)}</strong>/$
              {budget.monthly_cap_usd} ce mois
            </span>
            <div className="flex gap-2">
              {isSandbox && (
                <button
                  onClick={() => sandboxAction("purge")}
                  disabled={busy === "sandbox"}
                  className="rounded-lg bg-card2 px-3 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line disabled:opacity-50"
                >
                  🗑 Vider la sandbox
                </button>
              )}
              <button
                onClick={() => sandboxAction("toggle_pause")}
                disabled={busy === "sandbox"}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50 ${
                  budget.is_paused ? "bg-success" : "bg-destructive"
                }`}
              >
                {budget.is_paused ? "▶ Réactiver les agents" : "⏸ Tout couper (coupe-circuit)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 rounded-lg border border-line bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-accent text-accent-ink shadow-glow-sm"
                : "bg-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ONGLET AGENTS ── */}
      {tab === "agents" && (
        <div className="space-y-3">
          {localDefs.map((a) => (
            <div key={a.slug} className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{a.name}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        a.is_enabled
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-line bg-card2 text-ink-faint"
                      }`}
                    >
                      {a.is_enabled ? "ACTIF" : "INACTIF"}
                    </span>
                    {a.requires_review && (
                      <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        validation requise
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">{a.description}</p>
                  <p className="mt-1 text-[10px] text-ink-faint">
                    Max {a.max_runs_per_day} exécution(s)/jour
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    onClick={() => toggleAgent(a.slug, !a.is_enabled)}
                    disabled={busy === `toggle-${a.slug}`}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    {a.is_enabled ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    onClick={() => testAgent(a.slug)}
                    disabled={busy === `test-${a.slug}`}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    {busy === `test-${a.slug}` ? "⏳" : "Test dry-run"}
                  </button>
                  <button
                    onClick={() => runAgent(a.slug)}
                    disabled={busy === a.slug || !a.is_enabled}
                    className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                      a.is_enabled
                        ? "bg-accent text-accent-ink shadow-glow-sm hover:bg-accent-hover"
                        : "bg-card2 text-ink-faint"
                    }`}
                  >
                    {busy === a.slug ? "⏳ En cours…" : "▶ Lancer"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-ink-faint">
            Activez/désactivez un agent, testez la config (dry-run), puis lancez manuellement.
            Si bloqué : vérifiez ANTHROPIC_API_KEY, AGENT_MODEL, mode sandbox/live et le worker.
          </p>
        </div>
      )}

      {/* ── ONGLET PLANNING ── */}
      {tab === "schedule" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Choisis quels jours et à quelles heures chaque agent tourne automatiquement.
            Le cron Render vérifie ce planning chaque heure.
          </p>
          {localDefs.map((a) => {
            const sched = schedules.find((s) => s.agent_slug === a.slug);
            return (
              <div key={a.slug} className="rounded-xl border border-line bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-ink">{a.name}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      sched?.is_enabled
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-line bg-card2 text-ink-faint"
                    }`}
                  >
                    {sched?.is_enabled ? "PLANIFIÉ" : "MANUEL"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => (
                    <span
                      key={i}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                        sched?.days.includes(i)
                          ? "border-accent/30 bg-accent/10 text-accent"
                          : "border-line bg-card2 text-ink-faint"
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                  <span className="ml-2 text-[11px] text-ink-faint">
                    à {sched?.hours.map((h) => `${h}h`).join(", ") || "—"}
                  </span>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-ink-faint">
            💡 Pour modifier jours/heures : table <code>agent_schedules</code> dans Supabase,
            ou ajoute des sélecteurs ici (colonnes <code>days</code> et <code>hours</code>).
          </p>
        </div>
      )}

      {/* ── ONGLET À VALIDER ── */}
      {tab === "review" && (
        <div className="space-y-3">
          {pendingOutputs.length === 0 && (
            <div className="rounded-xl border border-line bg-card p-10 text-center text-sm text-ink-faint">
              ✅ Rien à valider. Les agents n&apos;ont rien produit en attente.
            </div>
          )}
          {pendingOutputs.map((o) => (
            <OutputReviewCard
              key={o.id}
              output={o}
              busy={busy === o.id}
              onReview={reviewOutput}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-accent/30 bg-card2 px-4 py-2.5 text-sm font-medium text-ink shadow-glow-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

/** Carte de validation d'un output, adaptée selon son type. */
function OutputReviewCard({
  output,
  busy,
  onReview,
}: {
  output: Output;
  busy: boolean;
  onReview: (id: string, action: "approve" | "reject") => void;
}) {
  const [open, setOpen] = useState(false);
  const p = output.payload;

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              {output.kind}
            </span>
            {output.is_sandbox && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-ink">
                🧪 sandbox
              </span>
            )}
            <span className="text-xs text-ink-faint">{output.agent_slug}</span>
            {output.quality_score != null && (
              <span className="text-xs font-bold text-success">
                {output.quality_score}/100
              </span>
            )}
          </div>
          <div className="mt-1 text-sm font-semibold text-ink">{output.title}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onReview(output.id, "reject")}
            disabled={busy}
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"
          >
            Rejeter
          </button>
          <button
            onClick={() => onReview(output.id, "approve")}
            disabled={busy}
            className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? "⏳" : "✓ Approuver"}
          </button>
        </div>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs text-accent hover:underline"
      >
        {open ? "▲ Masquer le détail" : "▼ Voir le détail"}
      </button>

      {open && (
        <div className="mt-2 rounded-lg bg-card2 p-3 text-xs text-ink-soft">
          {/* Affichage adapté au type d'output */}
          {output.kind === "prompt" && (
            <>
              <p className="mb-1">{String(p.description ?? "")}</p>
              <pre className="whitespace-pre-wrap rounded border border-line bg-bg p-2 font-mono text-[11px] text-success">
                {String(p.prompt_body ?? "")}
              </pre>
              <p className="mt-1">
                {p.is_free ? "Gratuit" : `${Number(p.price_cents ?? 0) / 100}€`} ·{" "}
                {String(p.category ?? "")} · @{String(p.persona_username ?? "")}
              </p>
            </>
          )}
          {output.kind === "linkedin_post" && (
            <pre className="whitespace-pre-wrap font-sans">{String(p.full_text ?? "")}</pre>
          )}
          {output.kind === "email" && (
            <>
              <p className="font-semibold">Objet : {String(p.subject ?? "")}</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{String(p.body_text ?? "")}</pre>
            </>
          )}
          {output.kind === "blog_article" && (
            <>
              <p className="font-semibold">{String(p.title ?? "")}</p>
              <p className="italic">{String(p.meta_description ?? "")}</p>
              <p className="mt-1">{String(p.intro ?? "")}</p>
            </>
          )}
          {output.kind === "outreach" && (
            <pre className="whitespace-pre-wrap font-sans">{String(p.message ?? "")}</pre>
          )}
          {output.kind === "price_suggestion" && (
            <pre className="whitespace-pre-wrap font-sans">
              {JSON.stringify(p.suggestions ?? [], null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
