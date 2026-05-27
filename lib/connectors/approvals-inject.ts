import type { AgentStep } from "@/lib/agent/schema";

const RISKY_ACTION = /send|post|create|delete|update|append|write|publish|invite|email/i;

/** Insère une étape d'approbation humaine avant chaque action à risque. */
export function injectHumanApprovals(steps: AgentStep[]): AgentStep[] {
  const out: AgentStep[] = [];
  for (const step of steps) {
    if (step.type === "action" && RISKY_ACTION.test(step.action)) {
      out.push({
        type: "approval",
        label: `Valider avant : ${step.connector} → ${step.action}`,
        payloadTemplate: `Action : ${step.action}\nConnecteur : ${step.connector}`,
        expiresInMinutes: 120,
        outputKey: `approval_before_${out.length}`,
      });
    }
    out.push(step);
  }
  return out;
}
