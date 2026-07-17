"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, Sparkles, X } from "lucide-react";

export interface ApprovalDetails {
  id: string;
  label?: string;
  preview?: string;
  stepIndex?: number;
}

interface Props {
  open: boolean;
  approval: ApprovalDetails | null;
  onApprove: (approvalId: string, modifiedContent: string) => Promise<void>;
  onReject: (approvalId: string) => Promise<void>;
  onClose?: () => void;
  /** Active la retouche conversationnelle (« affine avec l'agent »). */
  runId?: string;
}

export function HumanApprovalModal({
  open,
  approval,
  onApprove,
  onReject,
  onClose,
  runId,
}: Props) {
  const [content, setContent] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  // Retouche conversationnelle : historique des échanges avec l'agent.
  const [instruction, setInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  const [exchanges, setExchanges] = useState<Array<{ ask: string; ok: boolean }>>([]);
  const [reviseError, setReviseError] = useState<string | null>(null);

  useEffect(() => {
    if (approval?.preview != null) {
      setContent(approval.preview);
    } else {
      setContent("");
    }
    setExchanges([]);
    setInstruction("");
    setReviseError(null);
  }, [approval?.id, approval?.preview]);

  async function refine() {
    const ask = instruction.trim();
    if (!ask || !runId || !approval || revising) return;
    setRevising(true);
    setReviseError(null);
    try {
      const res = await fetch(`/api/run/agent/${runId}/approve/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id, instruction: ask, content }),
      });
      const data = (await res.json()) as { revised?: string; error?: string };
      if (res.ok && data.revised) {
        setContent(data.revised);
        setExchanges((x) => [...x, { ask, ok: true }]);
        setInstruction("");
      } else {
        setReviseError(data.error ?? "Retouche impossible — réessaie.");
        setExchanges((x) => [...x, { ask, ok: false }]);
      }
    } catch {
      setReviseError("Retouche impossible — réessaie.");
    } finally {
      setRevising(false);
    }
  }

  if (!open || !approval) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-warning/30 bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="rounded-full bg-warning/10 p-2 text-warning">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="approval-modal-title" className="text-base font-semibold text-ink">
              Validation humaine requise
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {approval.label ?? "L'agent attend votre décision avant de continuer."}
            </p>
            {approval.stepIndex != null && (
              <p className="mt-0.5 font-mono text-xs text-ink-faint">Étape {approval.stepIndex + 1}</p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-ink-faint hover:bg-card2 hover:text-ink"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="px-5 py-4">
          <label className="text-xs font-medium text-ink-soft">
            Contenu à valider — modifiable avant envoi
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="mt-2 w-full rounded-lg border border-line bg-card2 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
            placeholder="Aperçu de l'action en attente…"
          />

          {runId && (
            <div className="mt-3 rounded-xl border border-line bg-card2 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Affine avec l&apos;agent — dis-lui ce que tu veux changer
              </p>
              {exchanges.length > 0 && (
                <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
                  {exchanges.map((e, i) => (
                    <p key={i} className={`text-[11px] ${e.ok ? "text-ink-faint" : "text-destructive"}`}>
                      {e.ok ? "✓" : "✗"} « {e.ask} »{e.ok ? " — appliqué ci-dessus" : ""}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void refine();
                    }
                  }}
                  disabled={revising}
                  placeholder="Ex. « plus court et tutoie », « ajoute les chiffres du T2 »…"
                  className="h-9 flex-1 rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void refine()}
                  disabled={revising || !instruction.trim()}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink shadow-glow-sm hover:bg-accent-hover disabled:opacity-50"
                >
                  {revising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Retoucher
                </button>
              </div>
              {reviseError && <p className="mt-1.5 text-[11px] text-destructive">{reviseError}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            disabled={acting != null}
            onClick={async () => {
              setActing("approve");
              try {
                await onApprove(approval.id, content);
              } finally {
                setActing(null);
              }
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-success/90 disabled:opacity-50"
          >
            {acting === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Valider et continuer"
            )}
          </button>
          <button
            type="button"
            disabled={acting != null}
            onClick={async () => {
              setActing("reject");
              try {
                await onReject(approval.id);
              } finally {
                setActing(null);
              }
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            {acting === "reject" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Refuser"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
