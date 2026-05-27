"use client";

import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Code,
  GitBranch,
  MessageSquare,
  Search,
  Shield,
  Zap,
} from "lucide-react";
import type { AgentStep } from "@/lib/agent/schema";

interface Props {
  steps: AgentStep[];
  provisioningMode?: string;
  confirmed?: boolean;
  onConfirm?: () => void;
}

function stepIcon(step: AgentStep) {
  switch (step.type) {
    case "llm":
      return MessageSquare;
    case "tool":
      return Search;
    case "action":
      return Zap;
    case "code":
      return Code;
    case "approval":
      return Shield;
    case "condition":
      return GitBranch;
    case "retrieve":
      return Bot;
    default:
      return Bot;
  }
}

function describeStep(step: AgentStep, index: number): string {
  switch (step.type) {
    case "llm":
      return `Génération IA — ${step.model}`;
    case "tool":
      return `Outil ${step.tool}`;
    case "action":
      return `${step.connector} → ${step.action}`;
    case "code":
      return "Exécution code Python";
    case "approval":
      return step.label ?? "Validation humaine";
    case "condition":
      return `Condition : ${step.expression.slice(0, 60)}`;
    case "retrieve":
      return `Lecture ${step.source}`;
    default:
      return `Étape ${index + 1}`;
  }
}

function stepBadge(step: AgentStep): string {
  switch (step.type) {
    case "llm":
      return "IA";
    case "tool":
      return "OUTIL";
    case "action":
      return "ACTION";
    case "code":
      return "CODE";
    case "approval":
      return "VALIDATION";
    case "condition":
      return "SI/SINON";
    case "retrieve":
      return "DONNÉES";
    default:
      return "ÉTAPE";
  }
}

export function AgentFlowPreview({
  steps,
  provisioningMode = "manual",
  confirmed = false,
  onConfirm,
}: Props) {
  if (steps.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-card2 p-6 text-center text-sm text-ink-soft">
        Ajoutez des étapes à l&apos;étape « Contenu » pour voir l&apos;arborescence.
      </p>
    );
  }

  const connectors = new Set<string>();
  const tools = new Set<string>();
  for (const s of steps) {
    if (s.type === "action") connectors.add(s.connector);
    if (s.type === "tool") tools.add(s.tool);
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">Arborescence de l&apos;agent</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {steps.length} étape(s)
            {connectors.size > 0 && ` · ${connectors.size} connecteur(s)`}
            {tools.size > 0 && ` · ${tools.size} outil(s)`}
            {provisioningMode !== "manual" && ` · provisioning ${provisioningMode}`}
          </p>
        </div>
        {onConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              confirmed
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-accent text-white hover:bg-accent/90"
            }`}
          >
            {confirmed ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Arborescence validée
              </>
            ) : (
              "Valider l'arborescence"
            )}
          </button>
        )}
      </div>

      <ol className="mt-6 space-y-0">
        {steps.map((step, i) => {
          const Icon = stepIcon(step);
          const isLast = i === steps.length - 1;
          return (
            <li key={i} className="relative flex gap-4 pb-6">
              {!isLast && (
                <span
                  className="absolute left-[19px] top-10 h-[calc(100%-16px)] w-px bg-line"
                  aria-hidden
                />
              )}
              <div
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                  step.type === "approval"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-accent/30 bg-accent/5 text-accent"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 rounded-xl border border-line bg-card2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-ink-faint">#{i + 1}</span>
                  <span className="rounded bg-line/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                    {stepBadge(step)}
                  </span>
                  {step.type === "approval" && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      Humain requis
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-ink">{describeStep(step, i)}</p>
                {step.type === "llm" && (
                  <p className="mt-2 line-clamp-2 text-xs text-ink-soft">{step.prompt}</p>
                )}
                {step.type === "action" && Object.keys(step.params).length > 0 && (
                  <p className="mt-2 font-mono text-[10px] text-ink-faint">
                    {Object.entries(step.params)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
              {!isLast && (
                <ChevronRight className="absolute -bottom-1 left-3 h-4 w-4 text-ink-faint" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
