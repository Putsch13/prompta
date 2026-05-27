"use client";

import { Loader2, Mail, Sheet, MessageSquare, Globe, Bot } from "lucide-react";

interface StepLike {
  index: number;
  type: string;
  label: string;
  status: string;
  output: string | null;
  actionSlug?: string | null;
}

interface Props {
  step: StepLike | null;
  isLive?: boolean;
}

function detectApp(step: StepLike | null): "sheets" | "gmail" | "slack" | "web" | "llm" | "generic" {
  if (!step) return "generic";
  const slug = (step.actionSlug ?? step.label ?? "").toLowerCase();
  if (slug.includes("sheet") || slug.includes("spreadsheet") || slug.includes("googlesheets")) return "sheets";
  if (slug.includes("gmail") || slug.includes("mail")) return "gmail";
  if (slug.includes("slack")) return "slack";
  if (step.type === "tool" && slug.includes("web")) return "web";
  if (step.type === "llm") return "llm";
  return "generic";
}

function parseSheetPreview(output: string | null): string[][] {
  if (!output) return [["…", "…", "…"]];
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed) && parsed.every((r) => Array.isArray(r))) {
      return parsed.slice(0, 8).map((row) => row.map(String));
    }
  } catch {
    // fall through
  }
  const lines = output.split("\n").filter(Boolean).slice(0, 6);
  return lines.map((line) => line.split(/[\t|,;]/).map((c) => c.trim()).slice(0, 5));
}

export function ActionWorkspacePanel({ step, isLive = false }: Props) {
  const app = detectApp(step);

  if (!step) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
        <Bot className="mb-3 h-10 w-10 text-white/30" />
        <p className="text-sm text-white/50">L&apos;agent ouvrira ici Gmail, Sheets, Slack…</p>
        <p className="mt-1 text-xs text-white/30">Vue workspace — suivez les actions en direct</p>
      </div>
    );
  }

  const running = step.status === "running" || isLive;

  return (
    <div className="flex h-full min-h-[280px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111820]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        {app === "sheets" && <Sheet className="h-4 w-4 text-emerald-400" />}
        {app === "gmail" && <Mail className="h-4 w-4 text-red-400" />}
        {app === "slack" && <MessageSquare className="h-4 w-4 text-purple-400" />}
        {app === "web" && <Globe className="h-4 w-4 text-sky-400" />}
        {(app === "llm" || app === "generic") && <Bot className="h-4 w-4 text-sky-400" />}
        <span className="text-sm font-medium text-white/90">
          {app === "sheets" && "Google Sheets"}
          {app === "gmail" && "Gmail"}
          {app === "slack" && "Slack"}
          {app === "web" && "Recherche web"}
          {app === "llm" && "Génération IA"}
          {app === "generic" && step.label}
        </span>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" /> En cours…
          </span>
        )}
        {!running && step.status === "success" && (
          <span className="ml-auto text-xs text-emerald-400">Terminé</span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {app === "sheets" && (
          <div className="overflow-x-auto rounded-lg border border-emerald-500/20">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <tbody>
                {parseSheetPreview(step.output).map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? "bg-emerald-500/15 font-semibold text-emerald-100" : "border-t border-white/5 text-white/75"}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 whitespace-nowrap max-w-[180px] truncate">
                        {cell || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {running && (
              <p className="mt-3 animate-pulse text-xs text-emerald-300/70">
                Remplissage des cellules…
              </p>
            )}
          </div>
        )}

        {app === "gmail" && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-red-300/80">Brouillon email</p>
            <p className="mt-2 text-sm font-medium text-white/90">Objet : (généré par l&apos;agent)</p>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-3 text-xs leading-relaxed text-white/75">
              {step.output ?? (running ? "Rédaction du message…" : "—")}
            </pre>
          </div>
        )}

        {app === "slack" && (
          <div className="space-y-2">
            <div className="rounded-lg bg-[#1a1d21] p-3">
              <p className="text-[10px] font-bold text-purple-300"># canal-agent</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-white/85">
                {step.output ?? (running ? "Envoi du message…" : "—")}
              </pre>
            </div>
          </div>
        )}

        {(app === "web" || app === "llm" || app === "generic") && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-4 text-xs leading-relaxed text-white/80">
            {step.output ?? (running ? "Traitement en cours…" : "En attente de sortie")}
          </pre>
        )}
      </div>
    </div>
  );
}
