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
        <h1 className="text-xl font-bold text-[#1B1B18]">Centre de contrôle des agents</h1>
        <p className="text-sm text-[#9E9B90]">
          Active, planifie et valide tes 7 agents. Rien n&apos;est publié sans ton accord.
        </p>
      </div>

      {/* Bandeau Sandbox / Sécurité */}
      {budget && (
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: isSandbox ? "#0A66C2" : "#16A34A",
            background: isSandbox ? "#E9F0FB" : "#FAFAF7",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  background: isSandbox ? "#0A66C2" : "#16A34A",
                  color: "#fff",
                }}
              >
                {isSandbox ? "🧪 MODE SANDBOX" : "🟢 MODE LIVE"}
              </span>
              <span className="text-xs text-[#5C5A52]">
                {isSandbox
                  ? "Réponses simulées, coût API = 0 $. Aucune donnée réelle créée."
                  : "Appels API réels. Budget surveillé et débité."}
              </span>
            </div>
            <button
              onClick={() => sandboxAction("set_mode", isSandbox ? "live" : "sandbox")}
              disabled={busy === "sandbox"}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: isSandbox ? "#16A34A" : "#0A66C2" }}
            >
              {isSandbox ? "→ Passer en LIVE" : "→ Repasser en SANDBOX"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E1D8] pt-3">
            <span className="text-xs text-[#5C5A52]">
              Budget : <strong>${budget.daily_spent_usd.toFixed(2)}</strong>/${budget.daily_cap_usd}{" "}
              aujourd&apos;hui · <strong>${budget.monthly_spent_usd.toFixed(2)}</strong>/$
              {budget.monthly_cap_usd} ce mois
            </span>
            <div className="flex gap-2">
              {isSandbox && (
                <button
                  onClick={() => sandboxAction("purge")}
                  disabled={busy === "sandbox"}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#5C5A52] ring-1 ring-[#E4E1D8] disabled:opacity-50"
                >
                  🗑 Vider la sandbox
                </button>
              )}
              <button
                onClick={() => sandboxAction("toggle_pause")}
                disabled={busy === "sandbox"}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: budget.is_paused ? "#16A34A" : "#DC2626" }}
              >
                {budget.is_paused ? "▶ Réactiver les agents" : "⏸ Tout couper (coupe-circuit)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 rounded-lg border border-[#E4E1D8] bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition"
            style={{
              background: tab === t.key ? "#0A66C2" : "transparent",
              color: tab === t.key ? "#fff" : "#5C5A52",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ONGLET AGENTS ── */}
      {tab === "agents" && (
        <div className="space-y-3">
          {localDefs.map((a) => (
            <div key={a.slug} className="rounded-xl border border-[#E4E1D8] bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#1B1B18]">{a.name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: a.is_enabled ? "#DCFCE7" : "#E4E1D8",
                        color: a.is_enabled ? "#16A34A" : "#9E9B90",
                      }}
                    >
                      {a.is_enabled ? "ACTIF" : "INACTIF"}
                    </span>
                    {a.requires_review && (
                      <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#D97706]">
                        validation requise
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#9E9B90]">{a.description}</p>
                  <p className="mt-1 text-[10px] text-[#9E9B90]">
                    Max {a.max_runs_per_day} exécution(s)/jour
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    onClick={() => toggleAgent(a.slug, !a.is_enabled)}
                    disabled={busy === `toggle-${a.slug}`}
                    className="rounded-lg border border-[#E4E1D8] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {a.is_enabled ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    onClick={() => testAgent(a.slug)}
                    disabled={busy === `test-${a.slug}`}
                    className="rounded-lg border border-[#E4E1D8] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {busy === `test-${a.slug}` ? "⏳" : "Test dry-run"}
                  </button>
                  <button
                    onClick={() => runAgent(a.slug)}
                    disabled={busy === a.slug || !a.is_enabled}
                    className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
                    style={{
                      background: a.is_enabled ? "#0A66C2" : "#E4E1D8",
                      color: a.is_enabled ? "#fff" : "#9E9B90",
                    }}
                  >
                    {busy === a.slug ? "⏳ En cours…" : "▶ Lancer"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-[#9E9B90]">
            Activez/désactivez un agent, testez la config (dry-run), puis lancez manuellement.
            Si bloqué : vérifiez ANTHROPIC_API_KEY, AGENT_MODEL, mode sandbox/live et le worker.
          </p>
        </div>
      )}

      {/* ── ONGLET PLANNING ── */}
      {tab === "schedule" && (
        <div className="space-y-3">
          <p className="text-sm text-[#5C5A52]">
            Choisis quels jours et à quelles heures chaque agent tourne automatiquement.
            Le cron Render vérifie ce planning chaque heure.
          </p>
          {localDefs.map((a) => {
            const sched = schedules.find((s) => s.agent_slug === a.slug);
            return (
              <div key={a.slug} className="rounded-xl border border-[#E4E1D8] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-[#1B1B18]">{a.name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: sched?.is_enabled ? "#DCFCE7" : "#E4E1D8",
                      color: sched?.is_enabled ? "#16A34A" : "#9E9B90",
                    }}
                  >
                    {sched?.is_enabled ? "PLANIFIÉ" : "MANUEL"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => (
                    <span
                      key={i}
                      className="rounded-md px-2 py-1 text-[11px] font-medium"
                      style={{
                        background: sched?.days.includes(i) ? "#E9F0FB" : "#F4F2EE",
                        color: sched?.days.includes(i) ? "#0A66C2" : "#9E9B90",
                      }}
                    >
                      {d}
                    </span>
                  ))}
                  <span className="ml-2 text-[11px] text-[#9E9B90]">
                    à {sched?.hours.map((h) => `${h}h`).join(", ") || "—"}
                  </span>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-[#9E9B90]">
            💡 Pour modifier jours/heures : table <code>agent_schedules</code> dans Supabase,
            ou ajoute des sélecteurs ici (colonnes <code>days</code> et <code>hours</code>).
          </p>
        </div>
      )}

      {/* ── ONGLET À VALIDER ── */}
      {tab === "review" && (
        <div className="space-y-3">
          {pendingOutputs.length === 0 && (
            <div className="rounded-xl border border-[#E4E1D8] bg-white p-10 text-center text-sm text-[#9E9B90]">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-[#1B1B18] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
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
    <div className="rounded-xl border border-[#E4E1D8] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#E9F0FB] px-2 py-0.5 text-[10px] font-semibold text-[#0A66C2]">
              {output.kind}
            </span>
            {output.is_sandbox && (
              <span className="rounded-full bg-[#0A66C2] px-2 py-0.5 text-[10px] font-semibold text-white">
                🧪 sandbox
              </span>
            )}
            <span className="text-xs text-[#9E9B90]">{output.agent_slug}</span>
            {output.quality_score != null && (
              <span className="text-xs font-bold text-[#16A34A]">
                {output.quality_score}/100
              </span>
            )}
          </div>
          <div className="mt-1 text-sm font-semibold text-[#1B1B18]">{output.title}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onReview(output.id, "reject")}
            disabled={busy}
            className="rounded-lg bg-[#FEE2E2] px-3 py-1.5 text-xs font-semibold text-[#DC2626] disabled:opacity-50"
          >
            Rejeter
          </button>
          <button
            onClick={() => onReview(output.id, "approve")}
            disabled={busy}
            className="rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "⏳" : "✓ Approuver"}
          </button>
        </div>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs text-[#0A66C2] hover:underline"
      >
        {open ? "▲ Masquer le détail" : "▼ Voir le détail"}
      </button>

      {open && (
        <div className="mt-2 rounded-lg bg-[#FAFAF7] p-3 text-xs text-[#5C5A52]">
          {/* Affichage adapté au type d'output */}
          {output.kind === "prompt" && (
            <>
              <p className="mb-1">{String(p.description ?? "")}</p>
              <pre className="whitespace-pre-wrap rounded bg-[#1A1A1A] p-2 font-mono text-[11px] text-[#8BE0A4]">
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
