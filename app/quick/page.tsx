"use client";

/**
 * /quick — barre de commande Prompta AUTONOME (hors extension).
 *
 * Cible universelle : ouverte par le bookmarklet « Prompta partout » (qui lui
 * passe le contexte de la page par postMessage), épinglée à l'écran d'accueil
 * sur mobile (PWA), ou ouverte directement. Réutilise /api/extension/execute.
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

interface Conn {
  connectorId: string;
  usable: boolean;
}

type RunState =
  | { phase: "idle" }
  | { phase: "planning" }
  | { phase: "running"; runId: string; title: string; planned: string[]; stepsDone: number; status: string; error?: string | null }
  | { phase: "error"; message: string; missing?: string[] };

export default function QuickPage() {
  const [ctx, setCtx] = useState<PageCtx | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [explore, setExplore] = useState(true);
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [showConns, setShowConns] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);

  // Contexte compact (url/title/selection) transmis dans le hash — toujours
  // présent, y compris si la popup a été bloquée (navigation même fenêtre).
  useEffect(() => {
    if (window.location.hash.length > 1) {
      try {
        const mini = JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
        if (mini && typeof mini === "object" && mini.url) setCtx(mini as PageCtx);
      } catch {
        /* hash non-JSON : ignoré */
      }
    }
  }, []);

  // Contexte COMPLET (contenu + liens) reçu du bookmarklet par postMessage.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      // Seule la fenêtre ouvrante (la page où le bookmarklet a tourné) peut
      // pousser le contexte — un autre onglet/iframe ne peut pas l'injecter.
      if (e.source !== window.opener) return;
      if (e.data && typeof e.data === "object" && e.data.type === "prompta:ctx" && e.data.ctx?.url) {
        setCtx(e.data.ctx as PageCtx);
      }
    }
    window.addEventListener("message", onMsg);
    // Handshake « prêt » vers l'ouvreur. targetOrigin "*" : ce signal ne porte
    // aucune donnée ; l'origine de l'ouvreur (page arbitraire) est inconnue ici.
    if (window.opener) {
      try {
        window.opener.postMessage("prompta:ready", "*");
      } catch {
        /* ouvreur cross-origin sans accès : ignoré */
      }
    }
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // État de connexion + auth.
  useEffect(() => {
    fetch("/api/extension/connections")
      .then((r) => {
        setAuthed(r.ok);
        return r.ok ? r.json() : null;
      })
      .then((d) => d && setConns(d.connections ?? []))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const launch = useCallback(async () => {
    // Anti ré-entrance (le raccourci Cmd/Ctrl+Entrée court-circuite le bouton
    // désactivé) : ne pas lancer un 2e run ni fuiter l'interval du 1er.
    if (busyRef.current) return;

    const g = goal.trim();
    if (g.length < 5) {
      setState({ phase: "error", message: "Décris la mission (5 caractères minimum)." });
      return;
    }
    busyRef.current = true;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setState({ phase: "planning" });

    // Contexte : celui du bookmarklet, sinon une URL saisie (mobile).
    const page: PageCtx =
      ctx ?? (manualUrl.trim() ? { url: manualUrl.trim() } : { url: "", title: "Sans page" });

    let res: Response;
    try {
      res = await fetch("/api/extension/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: g, page: { ...page, links: explore ? page.links : undefined } }),
      });
    } catch {
      busyRef.current = false;
      setState({ phase: "error", message: "Réseau indisponible." });
      return;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      busyRef.current = false;
      if (res.status === 409 && body.missingConnectors?.length) {
        setState({ phase: "error", message: `À connecter d'abord : ${body.missingConnectors.join(", ")}.`, missing: body.missingConnectors });
      } else if (res.status === 401) {
        setState({ phase: "error", message: "Connecte-toi à Prompta, puis réessaie." });
      } else {
        setState({ phase: "error", message: body.message ?? `Erreur (${res.status}).` });
      }
      return;
    }

    const runId: string = body.runId;
    setState({ phase: "running", runId, title: body.title ?? g, planned: [], stepsDone: 0, status: "pending" });

    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/run/agent/${runId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!r) return;
      setState({
        phase: "running",
        runId,
        title: body.title ?? g,
        planned: r.planned_steps ?? [],
        stepsDone: r.steps_completed ?? 0,
        status: r.status,
        error: r.error_message,
      });
      if (["completed", "failed", "cancelled"].includes(r.status) && pollRef.current) {
        busyRef.current = false;
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
  }, [goal, ctx, manualUrl, explore]);

  const usableCount = conns?.filter((c) => c.usable).length ?? 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">P</span>
        <h1 className="flex-1 font-display text-base font-bold text-ink">Prompta — mission instantanée</h1>
        {authed && (
          <button onClick={() => setShowConns((s) => !s)} className="rounded-lg border border-line px-2 py-1 text-xs text-ink-soft">
            {usableCount} app{usableCount > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {authed === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Connecte-toi à Prompta d&apos;abord.{" "}
          <a href="/login" className="font-semibold underline">Se connecter</a>
        </div>
      )}

      {showConns && conns && (
        <div className="rounded-xl border border-line bg-card2 p-3">
          <div className="flex flex-wrap gap-1.5">
            {conns.length === 0 && <span className="text-xs text-ink-faint">Aucune app connectée.</span>}
            {conns
              .filter((c, i, a) => a.findIndex((x) => x.connectorId.replace(/[^a-z0-9]/gi, "") === c.connectorId.replace(/[^a-z0-9]/gi, "")) === i)
              .map((c) => (
                <span key={c.connectorId} className="flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs text-ink-soft">
                  <span className={`h-1.5 w-1.5 rounded-full ${c.usable ? "bg-green-500" : "bg-red-400"}`} />
                  {c.connectorId}
                </span>
              ))}
          </div>
          <a href="/dashboard/connexions" target="_blank" rel="noopener" className="mt-2 inline-block text-xs font-medium text-accent underline">
            + connecter une autre app
          </a>
        </div>
      )}

      {ctx ? (
        <div className="flex flex-wrap gap-1.5 text-xs text-ink-faint">
          <span className="rounded-full border border-line px-2 py-0.5">📄 {(ctx.title || ctx.url || "page").slice(0, 44)}</span>
          {ctx.isPdf && <span className="rounded-full border border-line px-2 py-0.5">PDF</span>}
          {ctx.selection && <span className="rounded-full border border-line px-2 py-0.5">✂️ sélection ({ctx.selection.length} car.)</span>}
        </div>
      ) : (
        <input
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="URL à analyser (optionnel) — ex. https://un-site.com/produit"
          className="h-10 rounded-lg border border-line bg-card px-3 text-sm text-ink"
        />
      )}

      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) launch(); }}
        placeholder="Ex. : Résume ce produit dans un Google Sheets sur mon Drive, puis envoie-moi le lien par email."
        className="min-h-[96px] resize-y rounded-xl border border-line bg-card p-3 text-sm text-ink outline-none focus:border-accent"
      />

      {!ctx && (
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input type="checkbox" checked={explore} onChange={(e) => setExplore(e.target.checked)} />
          Autoriser l&apos;exploration du site (suivre les liens utiles)
        </label>
      )}

      <button
        onClick={launch}
        disabled={state.phase === "planning" || state.phase === "running"}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {state.phase === "planning" ? "Création de l'agent…" : state.phase === "running" ? "Agent en cours…" : "Lancer l'agent"}
      </button>

      <div className="text-sm">
        {state.phase === "planning" && <p className="text-ink-soft">🧠 Prompta conçoit l&apos;agent…</p>}
        {state.phase === "error" && (
          <div className="text-red-600">
            {state.message}
            {state.missing && (
              <> — <a href="/dashboard/connexions" target="_blank" rel="noopener" className="underline">ouvrir Connexions</a></>
            )}
          </div>
        )}
        {state.phase === "running" && (
          <div className="space-y-1">
            <p className="font-medium text-ink">🚀 {state.title}</p>
            {state.planned.map((label, i) => (
              <div key={i} className="flex items-baseline gap-2 text-ink-soft">
                <span className={i < state.stepsDone ? "text-green-600" : ""}>
                  {i < state.stepsDone ? "✓" : i === state.stepsDone && (state.status === "running" || state.status === "pending") ? "▶" : "·"}
                </span>
                <span>{label}</span>
              </div>
            ))}
            {state.status === "awaiting_approval" && (
              <p className="text-amber-600">⏸ Validation requise — <a href="/dashboard/validations" target="_blank" rel="noopener" className="underline">valider</a></p>
            )}
            {state.status === "completed" && (
              <p className="text-green-600">✅ Terminé — <a href={`/dashboard/runs/${state.runId}`} target="_blank" rel="noopener" className="underline">voir le dossier de mission</a></p>
            )}
            {state.status === "failed" && (
              <p className="text-red-600">✗ {state.error ?? "Échec"} — <a href={`/dashboard/runs/${state.runId}`} target="_blank" rel="noopener" className="underline">détails</a></p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
