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
  stepsCompleted?: number;
  instant?: boolean;
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

/** Run en cours de suivi (mission) ou réponse instantanée en streaming. */
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
  approvalId?: string | null;
  /** Tac au tac streamé (pas de run agent). */
  instant?: boolean;
  /** Petit message vert en tête de carte (ex : « ✓ Gmail connecté — je reprends »). */
  notice?: string | null;
}

/** Mission mémorisée en attente d'une connexion d'app (reprise automatique). */
interface PendingConnect {
  goal: string;
  page: PageCtx;
  missing: string[];
  startedAt: number;
  expired: boolean;
}

const CONNECT_POLL_MS = 5000;
const CONNECT_MAX_MS = 10 * 60 * 1000;
const SSE_WATCHDOG_MS = 90_000;
const connKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const slugLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_DOT: Record<string, string> = {
  completed: "bg-success",
  failed: "bg-destructive",
  awaiting_approval: "bg-accent",
  running: "bg-warning",
  pending: "bg-warning",
  streaming: "bg-warning",
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
  const [clarify, setClarify] = useState<{ goal: string; questions: string[] } | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(null);
  const [approval, setApproval] = useState<{ id: string; label?: string; kind?: string; question?: string } | null>(null);
  const [approvalText, setApprovalText] = useState("");
  const [approvalErr, setApprovalErr] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  /** Frontière « nouvelle conversation » : le fil et l'historique envoyé au cerveau repartent d'ici. */
  const [convoStart, setConvoStart] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const approvalSeenRef = useRef<string | null>(null); // approval déjà chargé ou décidé

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

  // Auto-scroll vers le bas quand le fil change — SEULEMENT si l'utilisateur y
  // est déjà (sinon chaque tick de poll le ramène en bas pendant qu'il lit).
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [history, live]);

  const usableCount = conns.filter((c) => c.usable).length;

  /** Charge la demande de validation du run (carte in-feed éditable). */
  const fetchApproval = useCallback(async (runId: string, approvalId: string | null) => {
    const key = approvalId ?? runId;
    if (approvalSeenRef.current === key) return;
    approvalSeenRef.current = key;
    try {
      const d = await fetch("/api/approvals").then((x) => (x.ok ? x.json() : null));
      const item = (d?.items ?? []).find(
        (a: { id: string; runId: string }) => (approvalId ? a.id === approvalId : a.runId === runId),
      );
      if (!item) { approvalSeenRef.current = null; return; }
      const p = (item.payload ?? {}) as { label?: string; preview?: string; full?: string; kind?: string };
      setApproval({ id: item.id, label: p.label, kind: p.kind, question: p.preview || p.label });
      setApprovalText(p.kind === "question" ? "" : p.full || p.preview || "");
      setApprovalErr(null);
    } catch { approvalSeenRef.current = null; }
  }, []);

  /**
   * Historique conversationnel (échanges + résultats de missions, échecs
   * compris) : « tu as oublié… » est compris comme la suite de la précédente.
   */
  const buildConvoHistory = useCallback(() => {
    const hist: { role: "user" | "assistant"; content: string }[] = [];
    for (const h of [...history].reverse().filter((x) => !convoStart || Date.parse(x.createdAt) >= convoStart).slice(-8)) {
      if (!h.goal) continue;
      hist.push({ role: "user", content: h.goal.slice(0, 1500) });
      if (h.status === "completed" && h.answer) {
        hist.push({ role: "assistant", content: h.answer.slice(0, 1500) });
      } else {
        const err = h.error ? ` — ${h.error.slice(0, 250)}` : "";
        hist.push({ role: "assistant", content: `[Mission « ${(h.title || h.goal).slice(0, 90)} » — statut : ${h.status}${err}]` });
      }
    }
    return hist.slice(-8);
  }, [history, convoStart]);

  /** Pipeline MISSION : plan agent → run live → validations humaines. */
  const launchMission = useCallback(async (g: string, page: PageCtx, notice?: string) => {
    setApproval(null); setApprovalErr(null); approvalSeenRef.current = null;
    setLive({ runId: "…", goal: g, model, title: g, planned: [], stepsDone: 0, status: "pending", notice: notice ?? null });

    let res: Response;
    try {
      res = await fetch("/api/extension/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // client:"quick" = pas d'exécuteur de pilotage navigateur ici : le
        // serveur interdit les étapes browser (sinon timeout 60 s garanti).
        body: JSON.stringify({ goal: g, page: { ...page, links: explore ? page.links : undefined }, modelId: model || undefined, history: buildConvoHistory(), client: "quick" }),
      });
    } catch {
      busyRef.current = false; setBusy(false); setLive(null);
      setError({ message: "Réseau indisponible." });
      return;
    }

    const body = await res.json().catch(() => ({}));
    // L'agent demande des précisions : on affiche les questions, la prochaine
    // réponse de l'utilisateur sera recollée à l'ordre initial.
    if (res.ok && Array.isArray(body.clarify) && body.clarify.length > 0) {
      busyRef.current = false; setBusy(false); setLive(null);
      setClarify({ goal: g, questions: body.clarify });
      inputRef.current?.focus();
      return;
    }
    if (!res.ok) {
      busyRef.current = false; setBusy(false); setLive(null);
      if (res.status === 409 && body.missingConnectors?.length) {
        // Mission MÉMORISÉE : carte « Connexion requise » avec un bouton OAuth
        // par app + reprise AUTOMATIQUE dès que tout est connecté (poll 5 s).
        setPendingConnect({ goal: g, page, missing: body.missingConnectors as string[], startedAt: Date.now(), expired: false });
      }
      else if (res.status === 401) setError({ message: "Connecte-toi à Prompta, puis réessaie." });
      else setError({ message: body.message ?? `Erreur (${res.status}).` });
      return;
    }

    const runId: string = body.runId;
    // `notice` : ce que le plan ne fait pas alors que l'ordre le suggérait
    // (récurrence). Ne pas écraser un notice client déjà posé (reprise OAuth).
    setLive((l) => l && {
      ...l,
      runId,
      title: body.title ?? g,
      status: "running",
      notice: l.notice ?? body.notice ?? null,
    });

    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/run/agent/${runId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!r) return;
      setLive((l) => l && { ...l, planned: r.planned_steps ?? [], stepsDone: r.steps_completed ?? 0, status: r.status, error: r.error_message, answer: extractAnswer(r.output), approvalId: r.approval_id ?? null });
      // awaiting_approval : on débloque le composer et on affiche la carte de
      // validation ICI (contenu éditable) — le poll CONTINUE jusqu'au terme.
      if (r.status === "awaiting_approval") {
        if (busyRef.current) { busyRef.current = false; setBusy(false); }
        fetchApproval(runId, r.approval_id ?? null);
      }
      if (["completed", "failed", "cancelled"].includes(r.status) && pollRef.current) {
        clearInterval(pollRef.current); pollRef.current = null;
        busyRef.current = false; setBusy(false);
        setApproval(null); setApprovalErr(null); approvalSeenRef.current = null;
        loadHistory();
        setTimeout(() => setLive(null), 400); // le run rejoint l'historique
      }
    }, 2500);
  }, [explore, model, loadHistory, fetchApproval, buildConvoHistory]);

  /** Décision de validation envoyée depuis la carte in-feed. */
  const decideApproval = useCallback(async (decision: "approved" | "rejected" | "skipped") => {
    if (!approval || !live || live.runId === "…" || live.runId === "instant") return;
    setDeciding(true); setApprovalErr(null);
    try {
      const res = await fetch(`/api/run/agent/${live.runId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id, decision, modifiedContent: decision === "approved" ? approvalText : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setApprovalErr(body.error ?? `Erreur (${res.status}).`); return; }
      setApproval(null);
      setLive((l) => l && { ...l, status: "running" }); // optimiste — le poll (toujours actif) corrige
    } catch {
      setApprovalErr("Réseau indisponible — réessaie.");
    } finally { setDeciding(false); }
  }, [approval, approvalText, live]);

  // Poll des connexions (5 s) tant qu'une mission attend une app : dès que tous
  // les connecteurs manquants sont utilisables, la mission repart TOUTE SEULE.
  useEffect(() => {
    if (!pendingConnect || pendingConnect.expired) return;
    const t = setInterval(async () => {
      if (Date.now() - pendingConnect.startedAt > CONNECT_MAX_MS) {
        // Timeout : on garde la mission, reprise MANUELLE via « Reprendre ».
        setPendingConnect((p) => p && { ...p, expired: true });
        return;
      }
      try {
        const d = await fetch("/api/extension/connections").then((x) => (x.ok ? x.json() : null));
        if (!d) return;
        const usable = new Set<string>(
          ((d.connections ?? []) as Conn[]).filter((c) => c.usable).map((c) => connKey(c.connectorId)),
        );
        const still = pendingConnect.missing.filter((s) => !usable.has(connKey(s)));
        if (still.length) return;
        const { goal: g, page, missing } = pendingConnect;
        setPendingConnect(null);
        busyRef.current = true; setBusy(true);
        launchMission(g, page, `✓ ${missing.map(slugLabel).join(", ")} connecté — je reprends la mission`);
      } catch { /* réseau — tick suivant */ }
    }, CONNECT_POLL_MS);
    return () => clearInterval(t);
  }, [pendingConnect, launchMission]);

  const launch = useCallback(async () => {
    if (busyRef.current) return;
    let g = goal.trim();
    if (g.length < 2) return;
    busyRef.current = true; setBusy(true); setError(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setGoal("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    // Nouvelle demande explicite : la mission en attente de connexion et la
    // validation en cours sont abandonnées (le fil suit UNE chose à la fois).
    setPendingConnect(null);
    setApproval(null); setApprovalErr(null); approvalSeenRef.current = null;

    const page: PageCtx = ctx ?? (manualUrl.trim() ? { url: manualUrl.trim() } : { url: "" });

    // Réponse à une demande de précisions : c'est une mission — direct au pipeline.
    if (clarify) {
      g = `${clarify.goal}\n\nQuestions posées : ${clarify.questions.join(" | ")}\nRéponses de l'utilisateur : ${g}`;
      setClarify(null);
      await launchMission(g, page);
      return;
    }

    // TAC AU TAC streamé d'abord ; le modèle bascule lui-même en mission.
    setLive({ runId: "instant", goal: g, model, title: g, planned: [], stepsDone: 0, status: "streaming", answer: "", instant: true });
    // Watchdog : aucun événement reçu pendant 90 s → coupure propre (fini le
    // « streaming » infini quand le serveur s'est tu sans fermer le flux).
    const aborter = new AbortController();
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let expired = false;
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => { expired = true; aborter.abort(); }, SSE_WATCHDOG_MS);
    };
    try {
      armWatchdog();
      const res = await fetch("/api/extension/instant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: aborter.signal,
        body: JSON.stringify({
          goal: g,
          page: { url: page.url, title: page.title, selection: page.selection, content: page.content, isPdf: page.isPdf },
          modelId: model || undefined,
          history: [...history].reverse().slice(-3).flatMap((h) =>
            h.goal && h.answer ? [{ role: "user" as const, content: h.goal }, { role: "assistant" as const, content: h.answer }] : [],
          ),
        }),
      });
      if (!res.ok || !res.body) {
        if (watchdog) clearTimeout(watchdog);
        const body = await res.json().catch(() => ({}));
        busyRef.current = false; setBusy(false); setLive(null);
        setError({ message: body.message ?? (res.status === 401 ? "Connecte-toi à Prompta, puis réessaie." : `Erreur (${res.status}).`) });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let mission = false;
      let failed: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        armWatchdog();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          let evt: { delta?: string; mission?: boolean; done?: boolean; error?: string };
          try { evt = JSON.parse(t.slice(5).trim()); } catch { continue; }
          if (evt.delta) setLive((l) => l && { ...l, answer: (l.answer ?? "") + evt.delta });
          else if (evt.mission) { mission = true; }
          else if (evt.error) { failed = evt.error; }
        }
        if (mission || failed) break;
      }
      if (watchdog) clearTimeout(watchdog);
      if (mission) { await launchMission(g, page); return; }
      busyRef.current = false; setBusy(false);
      if (failed) { setLive(null); setError({ message: failed }); return; }
      setLive((l) => l && { ...l, status: "completed" });
      loadHistory(); // la réponse instantanée est persistée côté serveur
    } catch {
      if (watchdog) clearTimeout(watchdog);
      busyRef.current = false; setBusy(false); setLive(null);
      setError({ message: expired ? "La réponse a expiré — réessaie." : "Réseau indisponible." });
    }
  }, [goal, ctx, manualUrl, model, clarify, history, launchMission, loadHistory]);

  /** ✚ Nouvelle conversation : frontière nette — le cerveau ne reçoit plus l'historique d'avant. */
  function newConversation() {
    setConvoStart(Date.now());
    setClarify(null); setPendingConnect(null); setError(null);
    setApproval(null); setApprovalErr(null); approvalSeenRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setLive(null); busyRef.current = false; setBusy(false);
    inputRef.current?.focus();
  }

  function reuse(text: string) {
    setGoal(text);
    inputRef.current?.focus();
    if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = Math.min(160, inputRef.current.scrollHeight) + "px"; }
  }

  async function cancelLive() {
    const runId = live?.runId;
    if (!runId || runId === "…") return;
    try { await fetch(`/api/run/agent/${runId}/cancel`, { method: "POST" }); } catch { /* best-effort */ }
  }

  // Fil = historique chronologique + run en cours (si pas encore dans l'historique).
  const thread = [...history].reverse().filter((h) => !convoStart || Date.parse(h.createdAt) >= convoStart);
  const liveShown =
    live &&
    !history.some(
      (h) =>
        h.runId === live.runId ||
        // Réponse instantanée terminée déjà persistée côté serveur : ne pas doubler.
        (live.instant && live.status === "completed" && h.goal === live.goal && !!h.answer),
    )
      ? live
      : null;

  return (
    <div className="flex h-screen flex-col bg-bg text-ink">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink shadow-glow-sm">P</span>
        <span className="flex-1 font-display text-sm font-bold">Prompta <span className="font-normal text-ink-faint">· assistant</span></span>
        <button
          type="button"
          onClick={newConversation}
          title="Nouvelle conversation"
          className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-card2 px-2.5 font-mono text-xs text-ink-soft transition-colors hover:border-accent/50 hover:text-ink"
        >
          ✚ <span className="hidden sm:inline">Nouvelle</span>
        </button>
        {models.length > 0 && (
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value); try { localStorage.setItem("prompta_model", e.target.value); } catch { /* quota */ } }}
            title="Modèle qui répond"
            className="max-w-[120px] rounded-lg border border-line bg-card2 px-2 py-1 text-xs"
          >
            {!models.some((m) => m.usable) && <option value="">Modèle par défaut</option>}
            {models.map((m) => <option key={m.id} value={m.id} disabled={!m.usable}>{m.label}{m.usable ? "" : " (clé requise)"}</option>)}
          </select>
        )}
        {authed && (
          <a href="/dashboard/connexions" target="_blank" rel="noopener" title="Apps connectées"
             className="rounded-lg border border-line px-2 py-1 text-xs text-ink-soft hover:border-accent">
            🔌 {usableCount}
          </a>
        )}
      </header>

      {/* Fil de conversation */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {authed === false && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              Connecte-toi à Prompta d&apos;abord. <a href="/login" className="font-semibold underline">Se connecter</a>
            </div>
          )}

          {thread.length === 0 && !liveShown && authed !== false && (
            <div className="mt-10 text-center text-ink-faint">
              <p className="text-lg font-medium text-ink-soft">Ton assistant du quotidien</p>
              <p className="mt-1 text-sm">Pose une question simple, ou confie-lui une vraie mission sur tes apps.</p>
              <div className="mt-4 flex flex-col items-center gap-2">
                {["Résume cette page en 5 points", "Rédige un email pro à partir de ce texte", "Crée un Sheet à partir de ces données"].map((s) => (
                  <button key={s} onClick={() => reuse(s)}
                          className="rounded-full border border-line bg-card2 px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-accent hover:text-ink">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((h) => (
            <Message key={h.runId} goal={h.goal || h.title} model={h.model} status={h.status} answer={h.answer}
                     runId={h.runId} planned={[]} stepsDone={0} error={h.error} onReuse={() => reuse(h.goal || h.title)} />
          ))}

          {liveShown && (
            <Message goal={liveShown.goal} model={liveShown.model} status={liveShown.status} answer={liveShown.answer ?? null}
                     runId={liveShown.runId} planned={liveShown.planned} stepsDone={liveShown.stepsDone} error={liveShown.error}
                     approvalId={liveShown.approvalId} notice={liveShown.notice} onCancel={() => cancelLive()}
                     onReuse={() => reuse(liveShown.goal)} live />
          )}

          {/* Validation DANS le fil : contenu proposé éditable + décision ici même. */}
          {liveShown && liveShown.status === "awaiting_approval" && approval && (
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-accent/50 bg-card2 px-3.5 py-3 text-sm">
              {approval.kind === "question" ? (
                <>
                  <p className="font-semibold text-accent">💬 Prompta a besoin d&apos;une précision</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink">{approval.question}</p>
                </>
              ) : (
                <p className="font-semibold text-ink">✋ Validation requise{approval.label ? ` — ${approval.label}` : ""}</p>
              )}
              <textarea
                value={approvalText}
                onChange={(e) => setApprovalText(e.target.value)}
                placeholder={approval.kind === "question" ? "Ta réponse…" : undefined}
                className={`mt-2 w-full resize-y rounded-lg border border-line bg-bg p-2 text-xs leading-relaxed text-ink outline-none focus:border-accent ${approval.kind === "question" ? "min-h-[56px]" : "min-h-[90px]"}`}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => decideApproval("rejected")} disabled={deciding}
                        className="rounded-lg border border-destructive/50 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50">
                  {approval.kind === "question" ? "Annuler la mission" : "Refuser"}
                </button>
                {approval.kind !== "question" && (
                  /* Refuser tue la mission entière : « Passer » saute cette
                     seule écriture et laisse les étapes suivantes se faire. */
                  <button onClick={() => decideApproval("skipped")} disabled={deciding}
                          title="Ne pas faire cette action, mais continuer la mission"
                          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink disabled:opacity-50">
                    Passer
                  </button>
                )}
                <button onClick={() => decideApproval("approved")} disabled={deciding || (approval.kind === "question" && !approvalText.trim())}
                        className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-ink shadow-glow-sm transition-colors hover:bg-accent-hover disabled:opacity-50">
                  {approval.kind === "question" ? "Répondre ↵" : "Valider"}
                </button>
              </div>
              {approvalErr && <p className="mt-1.5 text-xs text-destructive">{approvalErr}</p>}
            </div>
          )}

          {/* Connexion manquante : mission mémorisée, OAuth en un clic, reprise auto. */}
          {pendingConnect && (
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-accent/40 bg-card2 px-3.5 py-3 text-sm">
              <p className="font-semibold text-ink">Connexion requise</p>
              <p className="mt-1 text-xs text-ink-soft">Cette mission a besoin de : {pendingConnect.missing.join(", ")}.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pendingConnect.missing.map((slug) => (
                  <button key={slug}
                          onClick={() => window.open(`/api/connectors/${encodeURIComponent(slug)}/connect?returnUrl=${encodeURIComponent(`${window.location.origin}/dashboard/connexions?connected=${slug}`)}`, "_blank")}
                          className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent-hover transition-colors hover:bg-accent/10">
                    🔌 Connecter {slugLabel(slug)}
                  </button>
                ))}
              </div>
              {pendingConnect.expired ? (
                <button onClick={() => { const { goal: g, page } = pendingConnect; setPendingConnect(null); busyRef.current = true; setBusy(true); launchMission(g, page); }}
                        className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-accent hover:text-ink">
                  ↻ Reprendre la mission
                </button>
              ) : (
                <p className="mt-2 text-xs text-ink-faint">⏳ Je surveille tes connexions — la mission repartira toute seule.</p>
              )}
            </div>
          )}

          {clarify && (
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-accent/40 bg-card2 px-3.5 py-2.5 text-sm">
              <p className="mb-1.5 font-medium text-ink">Quelques précisions pour bien faire :</p>
              <ul className="list-disc space-y-1 pl-4 text-ink-soft">
                {clarify.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">Réponds ci-dessous, je m&apos;occupe du reste.</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
              {error.missing && <> — <a href="/dashboard/connexions" target="_blank" rel="noopener" className="underline">ouvrir Connexions</a></>}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-line bg-card px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {/* Ce que je vois */}
          <button onClick={() => setShowContext((s) => !s)} className="mb-2 flex items-center gap-1.5 text-xs text-ink-soft">
            <span className={`transition-transform ${showContext ? "rotate-90" : ""}`}>▸</span>
            👁 Ce que je vois
            {ctx && <span className="rounded-full border border-line px-2 py-0.5 text-ink-faint">📄 {(ctx.title || ctx.url || "cette page").slice(0, 32)}</span>}
          </button>
          {showContext && (
            <div className="mb-2 space-y-2 rounded-xl border border-line bg-card2 p-3 text-xs text-ink-soft">
              {ctx ? (
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-line px-2 py-0.5">📄 {(ctx.title || ctx.url || "cette page").slice(0, 48)}</span>
                  {ctx.isPdf && <span className="rounded-full border border-line px-2 py-0.5">PDF</span>}
                  {ctx.selection && <span className="rounded-full border border-line px-2 py-0.5">✂️ sélection</span>}
                </div>
              ) : (
                <input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="Coller une URL à analyser (optionnel)"
                       className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-ink" />
              )}
              <p className="text-ink-faint">
                Depuis une page web je ne vois que cette page. Pour que je voie <strong>tous tes onglets ouverts</strong>,{" "}
                <a href="/prompta-partout" target="_blank" rel="noopener" className="text-accent-hover underline">installe l&apos;extension</a>.
                Les logiciels/PDF ouverts hors navigateur ne sont pas accessibles.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={explore} onChange={(e) => setExplore(e.target.checked)} />
                Autoriser l&apos;exploration des liens de la page
              </label>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-line bg-card2 p-2 focus-within:border-accent">
            <textarea
              ref={inputRef}
              value={goal}
              onChange={(e) => { setGoal(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); launch(); } }}
              rows={1}
              placeholder={clarify ? "Ta réponse aux précisions…  (Entrée)" : "Demande simple ou grosse mission…  (Entrée pour envoyer)"}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none"
            />
            <button
              onClick={launch}
              disabled={busy || goal.trim().length < 2}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
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
  approvalId?: string | null;
  notice?: string | null;
  live?: boolean;
  onReuse: () => void;
  onCancel?: () => void;
}) {
  const { goal, model, status, answer, runId, planned, stepsDone, error, approvalId, notice, live, onReuse, onCancel } = props;
  const isAgent = status !== "streaming" && (planned.length > 0 || (!answer && status !== "completed"));
  return (
    <div className="flex flex-col gap-2">
      {/* Demande (cliquable pour réutiliser) */}
      <button onClick={onReuse} title="Réutiliser cette demande"
              className="group ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-left text-sm text-accent-ink">
        {goal}
        <span className="ml-2 opacity-0 transition-opacity group-hover:opacity-70">↺</span>
      </button>

      {/* Réponse / mission */}
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-card2 px-3.5 py-2.5 text-sm">
        {notice && <div className="mb-1.5 text-xs text-success">{notice}</div>}
        {answer && (
          <div className="whitespace-pre-wrap text-ink">
            {answer.slice(0, 12000)}
            {status === "streaming" && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-accent align-middle" />}
          </div>
        )}
        {status === "streaming" && !answer && <div className="animate-pulse text-ink-soft">Prompta réfléchit…</div>}

        {/* Arborescence du plan : nœuds en cascade, halo pulsant sur l'étape
            active, ✓ à l'accomplissement — même langage visuel que l'extension. */}
        {isAgent && (planned.length > 0) && (
          <div className={`ptree mt-1 ${status === "running" || status === "pending" ? "run" : ""}`}>
            {planned.map((label, i) => {
              const runLive = status === "running" || status === "pending";
              const cls = i < stepsDone ? "done" : i === stepsDone && runLive ? "act" : "";
              return (
                <div key={i} className={`pnode ${cls}`}
                     style={cls === "done" ? undefined : { animationDelay: `${Math.min(i * 80, 640)}ms` }}>
                  <span className="knot">{i < stepsDone ? "✓" : i + 1}</span>
                  <span className="lbl">{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Phase conception : le « cerveau » se construit — nœuds fantômes,
            étincelle qui parcourt la colonne, en attendant le plan. */}
        {isAgent && planned.length === 0 && (status === "running" || status === "pending") && (
          <>
            <div className="flex items-center gap-2 text-ink-soft">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full"
                    style={{ background: "conic-gradient(from 0deg, #38BDF8, #1E7FC2, #38BDF8)" }} />
              Je conçois le plan…
            </div>
            <div className="pbrain mt-1.5" aria-hidden="true">
              <svg viewBox="0 0 220 112" xmlns="http://www.w3.org/2000/svg">
                {([
                  ["M16,88 L52,28", 0.05], ["M16,88 L96,66", 0.2], ["M52,28 L96,66", 0.35],
                  ["M52,28 L140,24", 0.5], ["M96,66 L140,24", 0.65], ["M96,66 L178,76", 0.8],
                  ["M140,24 L178,76", 0.95], ["M140,24 L206,44", 1.1], ["M178,76 L206,44", 1.25],
                ] as const).map(([d, delay]) => (
                  <path key={d} className="pe" pathLength={1} d={d} style={{ animationDelay: `${delay}s` }} />
                ))}
                {([
                  [16, 88, 0.02], [52, 28, 0.3], [140, 24, 0.8], [178, 76, 1.05], [206, 44, 1.3],
                ] as const).map(([cx, cy, delay]) => (
                  <circle key={`${cx}-${cy}`} className="pn" cx={cx} cy={cy} r={3} style={{ animationDelay: `${delay}s` }} />
                ))}
                <circle className="pn core" cx={96} cy={66} r={4.5} style={{ animationDelay: ".55s" }} />
                <circle className="ring" cx={96} cy={66} r={9.5} />
                <circle className="sp s1" r={1.7}><animateMotion dur="2.1s" begin="1.3s" repeatCount="indefinite" path="M16,88 L52,28 L96,66" /></circle>
                <circle className="sp s2" r={1.7}><animateMotion dur="2.6s" begin="1.7s" repeatCount="indefinite" path="M96,66 L140,24 L206,44" /></circle>
                <circle className="sp s3" r={1.4}><animateMotion dur="3.1s" begin="2.1s" repeatCount="indefinite" path="M52,28 L96,66 L178,76" /></circle>
              </svg>
              <span className="scan" />
            </div>
          </>
        )}

        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-ink-faint"} ${live && !["completed", "failed"].includes(status) ? "animate-pulse" : ""}`} />
          <span className="text-ink-faint">
            {status === "completed" ? "terminé" : status === "failed" ? "échec" : status === "awaiting_approval" ? "à valider" : status === "running" ? "en cours" : status === "streaming" ? "répond…" : "en file"}
          </span>
          {model && <span className="text-ink-faint">· {model}</span>}
          {status === "awaiting_approval" && (
            <a href={approvalId ? `/dashboard/validations?focus=${approvalId}` : "/dashboard/validations"}
               target="_blank" rel="noopener" className="ml-auto text-accent-hover underline">{live ? "ouvrir dans le dashboard ↗" : "valider"}</a>
          )}
          {status === "completed" && runId !== "…" && runId !== "instant" && <a href={`/dashboard/runs/${runId}`} target="_blank" rel="noopener" className="ml-auto text-accent-hover underline">dossier ↗</a>}
          {status === "failed" && runId !== "…" && runId !== "instant" && <a href={`/dashboard/runs/${runId}`} target="_blank" rel="noopener" className="ml-auto text-accent-hover underline">dossier ↗</a>}
          {live && onCancel && runId !== "…" && (status === "running" || status === "pending") && (
            <button onClick={onCancel} title="Arrêter la mission"
                    className="ml-auto rounded-md border border-line px-2 py-0.5 text-[10px] text-ink-soft hover:border-destructive hover:text-destructive">
              ■ stop
            </button>
          )}
        </div>
        {status === "failed" && error && <div className="mt-1 text-xs text-destructive">{error.slice(0, 140)}</div>}
      </div>
    </div>
  );
}
