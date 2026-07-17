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
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-line bg-card2/40 p-8 text-center">
        <Bot className="mb-3 h-10 w-10 text-ink-faint" />
        <p className="text-sm text-ink-soft">L&apos;agent ouvrira ici Gmail, Sheets, Slack…</p>
        <p className="mt-1 text-xs text-ink-faint">Vue workspace — suivez les actions en direct</p>
      </div>
    );
  }

  const running = step.status === "running" || isLive;

  return (
    <div className="flex h-full min-h-[280px] flex-col overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line bg-card2 px-4 py-2.5">
        {app === "sheets" && <Sheet className="h-4 w-4 text-success" />}
        {app === "gmail" && <Mail className="h-4 w-4 text-destructive" />}
        {app === "slack" && <MessageSquare className="h-4 w-4 text-accent" />}
        {app === "web" && <Globe className="h-4 w-4 text-accent" />}
        {(app === "llm" || app === "generic") && <Bot className="h-4 w-4 text-accent" />}
        <span className="text-sm font-medium text-ink">
          {app === "sheets" && "Google Sheets"}
          {app === "gmail" && "Gmail"}
          {app === "slack" && "Slack"}
          {app === "web" && "Recherche web"}
          {app === "llm" && "Génération IA"}
          {app === "generic" && step.label}
        </span>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-warning">
            <Loader2 className="h-3 w-3 animate-spin" /> En cours…
          </span>
        )}
        {!running && step.status === "success" && (
          <span className="ml-auto text-xs text-success">Terminé</span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {app === "sheets" && (
          <div className="overflow-x-auto rounded-lg border border-success/30">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <tbody>
                {parseSheetPreview(step.output).map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? "bg-success/10 font-semibold text-success" : "border-t border-line-soft text-ink-soft"}>
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
              <p className="mt-3 animate-pulse text-xs text-success/70">
                Remplissage des cellules…
              </p>
            )}
          </div>
        )}

        {app === "gmail" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="hud-label !text-destructive">Brouillon email</p>
            <p className="mt-2 text-sm font-medium text-ink">Objet : (généré par l&apos;agent)</p>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-3 text-xs leading-relaxed text-ink-soft">
              {step.output ?? (running ? "Rédaction du message…" : "—")}
            </pre>
          </div>
        )}

        {app === "slack" && (
          <div className="space-y-2">
            <div className="rounded-lg border border-line bg-card2 p-3">
              <p className="font-mono text-[10px] font-bold text-accent"># canal-agent</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-ink">
                {step.output ?? (running ? "Envoi du message…" : "—")}
              </pre>
            </div>
          </div>
        )}

        {(app === "web" || app === "llm" || app === "generic") && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-4 text-xs leading-relaxed text-ink-soft">
            {step.output ?? (running ? "Traitement en cours…" : "En attente de sortie")}
          </pre>
        )}
      </div>
    </div>
  );
}
