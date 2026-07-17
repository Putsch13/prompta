"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import {
  graphToPlan,
  layoutGraph,
  normalizeGraph,
  planToGraph,
  type PlanGraph,
} from "@/lib/builder/plan-graph";
import type { GeneratedAgentPlan } from "@/lib/builder/generate-agent-plan";

const SUGGESTIONS = [
  "Ajoute une relecture par Claude avant l'envoi",
  "Mets une validation humaine avant la publication",
  "Ajoute Slack en parallèle pour notifier l'équipe",
  "Ajoute une étape qui poste un récap dans Slack après la publication",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  graph: PlanGraph | null;
  onGraphChange: (graph: PlanGraph) => void;
  onChangedIds?: (ids: string[]) => void;
  modelId?: string;
  defaultModel?: string;
}

export function PlanChat({
  graph,
  onGraphChange,
  onChangedIds,
  modelId = "gpt-5.4-mini",
  defaultModel = "gpt-5.4",
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Décrivez comment modifier le plan : j'ajuste le graphe sans tout régénérer.",
        },
      ]);
    }
  }, [messages.length]);

  async function sendInstruction(instruction: string) {
    if (!graph || !instruction.trim()) return;
    setLoading(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: instruction.trim() }]);
    setInput("");

    const currentPlan = graphToPlan(graph);
    try {
      const res = await fetch("/api/builder/edit-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: currentPlan, instruction: instruction.trim(), modelId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        setLoading(false);
        return;
      }
      const newPlan = data.plan as GeneratedAgentPlan;
      const changedIds = (data.changedIds as string[]) ?? [];
      const newGraph = layoutGraph(normalizeGraph(planToGraph(newPlan, defaultModel)));
      onGraphChange(newGraph);
      onChangedIds?.(changedIds);
      setTimeout(() => onChangedIds?.([]), 3000);

      const summary =
        changedIds.length > 0
          ? `Plan mis à jour : ${changedIds.length} nœud(s) modifié(s) (${changedIds.slice(0, 3).join(", ")}${changedIds.length > 3 ? "…" : ""}).`
          : "Plan mis à jour.";
      setMessages((m) => [...m, { role: "assistant", content: summary }]);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  const disabled = !graph || loading;

  return (
    <div className="mt-4 rounded-xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <p className="text-sm font-medium text-ink">Modifier le plan par IA</p>
      </div>
      <div className="max-h-40 space-y-2 overflow-y-auto px-3 py-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-2 py-1.5 text-xs ${
              m.role === "user" ? "ml-6 bg-accent/10 text-ink" : "mr-6 bg-card2 text-ink-soft"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <Loader2 className="h-3 w-3 animate-spin" />
            Modification en cours…
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => sendInstruction(s)}
            className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft hover:border-accent disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendInstruction(input);
            }
          }}
          disabled={disabled}
          placeholder={graph ? "Ex. ajoute une étape Slack après la publication…" : "Générez d'abord un plan"}
          className="h-9 flex-1 rounded-lg border border-line px-3 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || input.trim().length < 3}
          onClick={() => sendInstruction(input)}
          className="flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
