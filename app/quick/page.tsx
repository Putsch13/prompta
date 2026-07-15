"use client";

/**
 * /quick — assistant Prompta AUTONOME (hors extension), en mode CHAT.
 *
 * Ouvert par le bookmarklet « Prompta partout » (contexte de page par
 * postMessage/hash), épinglé à l'écran d'accueil sur mobile (PWA), ou en direct.
 * Fil de conversation : l'historique est cliquable (réutiliser/modifier), les
 * questions simples répondent inline, les missions montrent l'agent en live.
 *
 * Limite navigateur assumée : une page web ne peut pas lister les AUTRES onglets
 * — seule l'extension le peut. On le dit clairement au lieu de faire semblant.
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface PageCtx {
  url?: string;
  title?: string;
  selection?: string;
  content?: string;
  links?: string[];
  isPdf?: boolean;
}

interface Conn { connectorId: string; usable: boolean }
interface Model { id: string; label: string; provider: string; usable: boolean }
interface HistoryItem {
  runId: string;
  goal: string;
  title: string;
  model: string | null;
  answer: string | null;
  error: string | null;
  status: string;
  createdAt: string;
}

/** Réponse texte d'une mission simple : clé "reponse" sinon le dernier output. */
function extractAnswer(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (typeof o.reponse === "string") return o.reponse;
  if (typeof o.result === "string") return o.result;
  const vals = Object.entries(o).filter(([k, v]) => !k.startsWith("__") && !k.endsWith("_output") && typeof v === "string");
  return vals.length ? (vals[vals.length - 1][1] as string) : null;
}

/** Run en cours de suivi. */
interface Live {
  runId: string;
  goal: string;
  model: string | null;
  title: string;
  planned: string[];
  stepsDone: number;
  status: string;
  error?: string | null;
  answer?: string | null;
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-500",
  failed: "bg-rose-400",
  awaiting_approval: "bg-[#7c6cff]",
  running: "bg-amber-400",
  pending: "bg-amber-400",
};

export default function QuickPage() {
  const [ctx, setCtx] = useState<PageCtx | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [explore, setExplore] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState<string>("");
  const [conns, setConns] = useState<Conn[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; missing?: string[] } | null>(null);
  const [showContext, setShowContext] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Contexte compact via hash (survit au blocage de popup).
  useEffect(() => {
    if (window.location.hash.length > 1) {
      try {
        const mini = JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
        if (mini && typeof mini === "object" && mini.url) setCtx(mini as PageCtx);
      } catch { /* hash non-JSON */ }
    }
  }, []);

  // Contexte complet par postMessage (bookmarklet).
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!window.opener || e.source !== window.opener) return;
      if (e.data && typeof e.data === "object" && e.data.type === "prompta:ctx" && e.data.ctx?.url) setCtx(e.data.ctx as PageCtx);
    }
    window.addEventListener("message", onMsg);
    if (window.opener) { try { window.opener.postMessage("prompta:ready", "*"); } catch { /* cross-origin */ } }
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    fetch("/api/extension/connections")
      .then((r) => { setAuthed(r.ok); return r.ok ? r.json() : null; })
      .then((d) => d && setConns(d.connections ?? []))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    fetch("/api/extension/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const ms: Model[] = d?.models ?? [];
        setModels(ms);
        const saved = typeof localStorage !== "undefined" ? localStorage.getItem("prompta_model") : null;
        setModel(ms.find((m) => m.id === saved && m.usable)?.id ?? ms.find((m) => m.usable)?.id ?? "");
      })
      .catch(() => undefined);
  }, []);

  const loadHistory = useCallback(() => {
    fetch("/api/extension/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHistory(d.items ?? []))
      .catch(() => undefined);
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Auto-scroll vers le bas quand le fil change.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [history, live]);

  const usableCount = conns.filter((c) => c.usable).length;

  const launch = useCallback(async () => {
    if (busyRef.current) return;
    const g = goal.trim();
    if (g.length < 3) return;
    busyRef.current = true; setBusy(true); setError(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    const page: PageCtx = ctx ?? (manualUrl.trim() ? { url: manualUrl.trim() } : { url: "" });
    setLive({ runId: "…", goal: g, model, title: g, planned: [], stepsDone: 0, status: "pending" });
    setGoal("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    let res: Response;
    try {
      res = await fetch("/api/extension/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: g, page: { ...page, links: explore ? page.links : undefined }, modelId: model || undefined }),
      });
    } catch {
      busyRef.current = false; setBusy(false); setLive(null);
      setError({ message: "Réseau indisponible." });
      return;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      busyRef.current = false; setBusy(false); setLive(null);
      if (res.status === 409 && body.missingConnectors?.length) setError({ message: `À connecter d'abord : ${body.missingConnectors.join(", ")}.`, missing: body.missingConnectors });
      else if (res.status === 401) setError({ message: "Connecte-toi à Prompta, puis réessaie." });
      else setError({ message: body.message ?? `Erreur (${res.status}).` });
      return;
    }

    const runId: string = body.runId;
    setLive((l) => l && { ...l, runId, title: body.title ?? g, status: "running" });

    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/run/agent/${runId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!r) return;
      setLive((l) => l && { ...l, planned: r.planned_steps ?? [], stepsDone: r.steps_completed ?? 0, status: r.status, error: r.error_message, answer: extractAnswer(r.output) });
      if (["completed", "failed", "cancelled"].includes(r.status) && pollRef.current) {
        clearInterval(pollRef.current); pollRef.current = null;
        busyRef.current = false; setBusy(false);
        loadHistory();
        setTimeout(() => setLive(null), 400); // le run rejoint l'historique
      }
    }, 2500);
  }, [goal, ctx, manualUrl, explore, model, loadHistory]);

  function reuse(text: string) {
    setGoal(text);
    inputRef.current?.focus();
    if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = Math.min(160, inputRef.current.scrollHeight) + "px"; }
  }

  // Fil = historique chronologique + run en cours (si pas encore dans l'historique).
  const thread = [...history].reverse();
  const liveShown = live && !history.some((h) => h.runId === live.runId) ? live : null;

  return (
    <div className="flex h-screen flex-col bg-[#0f1420] text-[#f3f5fb]">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-[#2a3350] px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7c6cff] text-sm font-bold text-white">P</span>
        <span className="flex-1 font-display text-sm font-bold">Prompta <span className="font-normal text-[#6b7595]">· assistant</span></span>
        {models.length > 0 && (
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value); try { localStorage.setItem("prompta_model", e.target.value); } catch { /* quota */ } }}
            title="Modèle qui répond"
            className="max-w-[120px] rounded-lg border border-[#2a3350] bg-[#161d2e] px-2 py-1 text-xs"
          >
            {!models.some((m) => m.usable) && <option value="">Modèle par défaut</option>}
            {models.map((m) => <option key={m.id} value={m.id} disabled={!m.usable}>{m.label}{m.usable ? "" : " (clé requise)"}</option>)}
          </select>
        )}
        {authed && (
          <a href="/dashboard/connexions" target="_blank" rel="noopener" title="Apps connectées"
             className="rounded-lg border border-[#2a3350] px-2 py-1 text-xs text-[#aab3cc] hover:border-[#7c6cff]">
            🔌 {usableCount}
          </a>
        )}
      </header>

      {/* Fil de conversation */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {authed === false && (
            <div className="rounded-xl border border-[#3a3320] bg-[#1c180a] p-4 text-sm text-[#fbbf24]">
              Connecte-toi à Prompta d&apos;abord. <a href="/login" className="font-semibold underline">Se connecter</a>
            </div>
          )}

          {thread.length === 0 && !liveShown && authed !== false && (
            <div className="mt-10 text-center text-[#6b7595]">
              <p className="text-lg font-medium text-[#aab3cc]">Ton assistant du quotidien</p>
              <p className="mt-1 text-sm">Pose une question simple, ou confie-lui une vraie mission sur tes apps.</p>
            </div>
          )}

          {thread.map((h) => (
            <Message key={h.runId} goal={h.goal || h.title} model={h.model} status={h.status} answer={h.answer}
                     runId={h.runId} planned={[]} stepsDone={0} error={h.error} onReuse={() => reuse(h.goal || h.title)} />
          ))}

          {liveShown && (
            <Message goal={liveShown.goal} model={liveShown.model} status={liveShown.status} answer={liveShown.answer ?? null}
                     runId={liveShown.runId} planned={liveShown.planned} stepsDone={liveShown.stepsDone} error={liveShown.error}
                     onReuse={() => reuse(liveShown.goal)} live />
          )}

          {error && (
            <div className="rounded-xl border border-[#3a2226] bg-[#1c1012] p-3 text-sm text-[#f87171]">
              {error.message}
              {error.missing && <> — <a href="/dashboard/connexions" target="_blank" rel="noopener" className="underline">ouvrir Connexions</a></>}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-[#2a3350] bg-[#131a29] px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {/* Ce que je vois */}
          <button onClick={() => setShowContext((s) => !s)} className="mb-2 flex items-center gap-1.5 text-xs text-[#aab3cc]">
            <span className={`transition-transform ${showContext ? "rotate-90" : ""}`}>▸</span>
            👁 Ce que je vois
            {ctx && <span className="rounded-full border border-[#2a3350] px-2 py-0.5 text-[#6b7595]">📄 {(ctx.title || ctx.url || "cette page").slice(0, 32)}</span>}
          </button>
          {showContext && (
            <div className="mb-2 space-y-2 rounded-xl border border-[#2a3350] bg-[#161d2e] p-3 text-xs text-[#aab3cc]">
              {ctx ? (
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-[#2a3350] px-2 py-0.5">📄 {(ctx.title || ctx.url || "cette page").slice(0, 48)}</span>
                  {ctx.isPdf && <span className="rounded-full border border-[#2a3350] px-2 py-0.5">PDF</span>}
                  {ctx.selection && <span className="rounded-full border border-[#2a3350] px-2 py-0.5">✂️ sélection</span>}
                </div>
              ) : (
                <input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="Coller une URL à analyser (optionnel)"
                       className="h-9 w-full rounded-lg border border-[#2a3350] bg-[#0f1420] px-3 text-[#f3f5fb]" />
              )}
              <p className="text-[#6b7595]">
                Depuis une page web je ne vois que cette page. Pour que je voie <strong>tous tes onglets ouverts</strong>,{" "}
                <a href="/dashboard/ia-quotidien" target="_blank" rel="noopener" className="text-[#a99bff] underline">installe l&apos;extension</a>.
                Les logiciels/PDF ouverts hors navigateur ne sont pas accessibles.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={explore} onChange={(e) => setExplore(e.target.checked)} />
                Autoriser l&apos;exploration des liens de la page
              </label>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-[#2a3350] bg-[#161d2e] p-2 focus-within:border-[#7c6cff]">
            <textarea
              ref={inputRef}
              value={goal}
              onChange={(e) => { setGoal(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); launch(); } }}
              rows={1}
              placeholder="Demande simple ou grosse mission…  (Entrée pour envoyer)"
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[#f3f5fb] outline-none"
            />
            <button
              onClick={launch}
              disabled={busy || goal.trim().length < 3}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7c6cff] text-white disabled:opacity-40"
              title="Envoyer"
            >
              {busy ? "…" : "↑"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Une entrée du fil : la demande + la réponse (simple) ou la mission (agent). */
function Message(props: {
  goal: string;
  model: string | null;
  status: string;
  answer: string | null;
  runId: string;
  planned: string[];
  stepsDone: number;
  error?: string | null;
  live?: boolean;
  onReuse: () => void;
}) {
  const { goal, model, status, answer, runId, planned, stepsDone, error, live, onReuse } = props;
  const isAgent = planned.length > 0 || (!answer && status !== "completed");
  return (
    <div className="flex flex-col gap-2">
      {/* Demande (cliquable pour réutiliser) */}
      <button onClick={onReuse} title="Réutiliser cette demande"
              className="group ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#7c6cff] px-3.5 py-2 text-left text-sm text-white">
        {goal}
        <span className="ml-2 opacity-0 transition-opacity group-hover:opacity-70">↺</span>
      </button>

      {/* Réponse / mission */}
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[#2a3350] bg-[#161d2e] px-3.5 py-2.5 text-sm">
        {answer && <div className="whitespace-pre-wrap text-[#f3f5fb]">{answer.slice(0, 8000)}</div>}

        {isAgent && (planned.length > 0) && (
          <div className="mt-1 space-y-0.5">
            {planned.map((label, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[#aab3cc]">
                <span className={i < stepsDone ? "text-emerald-600" : "text-[#6b7595]"}>
                  {i < stepsDone ? "✓" : i === stepsDone && (status === "running" || status === "pending") ? "▶" : "·"}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {isAgent && planned.length === 0 && (status === "running" || status === "pending") && (
          <div className="text-[#aab3cc]">🧠 Prompta conçoit l&apos;agent…</div>
        )}

        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-ink-faint"} ${live && !["completed", "failed"].includes(status) ? "animate-pulse" : ""}`} />
          <span className="text-[#6b7595]">
            {status === "completed" ? "terminé" : status === "failed" ? "échec" : status === "awaiting_approval" ? "à valider" : status === "running" ? "en cours" : "en file"}
          </span>
          {model && <span className="text-[#6b7595]">· {model}</span>}
          {status === "awaiting_approval" && <a href="/dashboard/validations" target="_blank" rel="noopener" className="ml-auto text-[#a99bff] underline">valider</a>}
          {status === "completed" && runId !== "…" && <a href={`/dashboard/runs/${runId}`} target="_blank" rel="noopener" className="ml-auto text-[#a99bff] underline">dossier ↗</a>}
          {status === "failed" && runId !== "…" && <a href={`/dashboard/runs/${runId}`} target="_blank" rel="noopener" className="ml-auto text-[#a99bff] underline">dossier ↗</a>}
        </div>
        {status === "failed" && error && <div className="mt-1 text-xs text-rose-600">{error.slice(0, 140)}</div>}
      </div>
    </div>
  );
}
