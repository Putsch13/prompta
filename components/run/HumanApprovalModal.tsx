"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";

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
}

export function HumanApprovalModal({
  open,
  approval,
  onApprove,
  onReject,
  onClose,
}: Props) {
  const [content, setContent] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    if (approval?.preview != null) {
      setContent(approval.preview);
    } else {
      setContent("");
    }
  }, [approval?.id, approval?.preview]);

  if (!open || !approval) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/40 bg-slate-900 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <div className="rounded-full bg-amber-500/20 p-2 text-amber-300">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="approval-modal-title" className="text-base font-semibold text-white">
              Validation humaine requise
            </h2>
            <p className="mt-1 text-sm text-white/70">
              {approval.label ?? "L'agent attend votre décision avant de continuer."}
            </p>
            {approval.stepIndex != null && (
              <p className="mt-0.5 text-xs text-white/40">Étape {approval.stepIndex + 1}</p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="px-5 py-4">
          <label className="text-xs font-medium text-white/60">
            Contenu à valider — modifiable avant envoi
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-white/30"
            placeholder="Aperçu de l'action en attente…"
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-4">
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
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 disabled:opacity-50"
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
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-200 disabled:opacity-50"
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
