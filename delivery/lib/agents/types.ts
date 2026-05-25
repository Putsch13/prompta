/**
 * lib/agents/types.ts
 * Types partagés par tous les agents.
 */

export type AgentSlug =
  | "prompt_factory"
  | "linkedin_publisher"
  | "seo_content"
  | "moderation"
  | "email_crm"
  | "analytics_pricing"
  | "affiliate";

export type AgentLogger = (
  level: "info" | "warn" | "error",
  message: string
) => Promise<void>;

/** Contexte passé à chaque agent au moment de son exécution. */
export type AgentContext = {
  runId: string;
  trigger: "cron" | "manual";
  /** True si on tourne en mode sandbox (réponses simulées, données isolées). */
  isSandbox: boolean;
  log: AgentLogger;
  /** Config JSON de l'agent (table agent_definitions.config). */
  config: Record<string, unknown>;
};

/** Résultat renvoyé par un agent à la fin de son run. */
export type AgentResult = {
  itemsProduced: number;
  summary: string;
};

/** Un output produit par un agent, en attente de validation. */
export type AgentOutputDraft = {
  kind: "prompt" | "linkedin_post" | "blog_article" | "email" | "price_suggestion" | "outreach";
  title: string;
  payload: Record<string, unknown>;
  qualityScore?: number;
};

/** Signature commune à tous les agents. */
export type AgentRunner = (ctx: AgentContext) => Promise<AgentResult>;
