/**
 * lib/agents/anthropic.ts
 * ────────────────────────────────────────────────────────────
 * Wrapper unique vers l'API Claude. TOUS les agents passent par ici.
 *
 * Deux modes (table agent_budget.mode) :
 *  - 'sandbox' : AUCUN appel API réel. Réponses simulées, coût = 0.
 *                Sert à tester toute la chaîne sans dépenser.
 *  - 'live'    : appels réels, budget vérifié et débité.
 */

import { checkBudget, recordSpend, estimateCost, getBudget } from "./budget";
import { parseLlmJson } from "@/lib/llm/json";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AGENT_MODEL || "claude-sonnet-4-6";

export type ClaudeResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  sandbox: boolean;
};

export class BudgetBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "BudgetBlockedError";
  }
}

type CallOptions = {
  system?: string;
  prompt: string;
  maxTokens?: number;
  projectedCost?: number;
  /**
   * Réponse JSON simulée renvoyée en mode sandbox.
   * Chaque agent fournit un exemple réaliste de ce qu'il attend.
   */
  sandboxSample?: unknown;
};

/**
 * Appelle Claude — ou simule la réponse en mode sandbox.
 * Lève BudgetBlockedError si le plafond est atteint (live uniquement).
 */
export async function callClaude(opts: CallOptions): Promise<ClaudeResult> {
  const budget = await getBudget();

  // ── MODE SANDBOX : aucune dépense, réponse simulée ──
  if (budget.mode === "sandbox") {
    const fake =
      opts.sandboxSample !== undefined
        ? JSON.stringify(opts.sandboxSample)
        : "[sandbox] Réponse simulée — aucun appel API effectué.";
    await new Promise((r) => setTimeout(r, 150)); // imite la latence
    return { text: fake, inputTokens: 0, outputTokens: 0, costUsd: 0, sandbox: true };
  }

  // ── MODE LIVE : appel réel, budget contrôlé ──
  const projected = opts.projectedCost ?? estimateCost(800, opts.maxTokens ?? 1000);

  const check = await checkBudget(projected);
  if (!check.allowed) {
    throw new BudgetBlockedError(check.reason);
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Anthropic API: ${data.error.message ?? "erreur inconnue"}`);
  }

  const text: string = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  const costUsd = await recordSpend(inputTokens, outputTokens);

  return { text, inputTokens, outputTokens, costUsd, sandbox: false };
}

/** Variante : force une réponse JSON et la parse proprement. */
export async function callClaudeJSON<T = unknown>(
  opts: CallOptions
): Promise<{ data: T; meta: ClaudeResult }> {
  const meta = await callClaude(opts);
  const data = parseLlmJson<T>(meta.text);
  if (data === null) {
    throw new Error("Réponse JSON invalide du modèle.");
  }
  return { data, meta };
}
