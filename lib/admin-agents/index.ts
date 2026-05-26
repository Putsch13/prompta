/**
 * agents/index.ts
 * Registre central — relie chaque slug à son implémentation.
 */

import type { AgentRunner } from "@/lib/agents/types";
import { runPromptFactory } from "./prompt-factory";
import { runLinkedinPublisher } from "./linkedin-publisher";
import { runSeoContent } from "./seo-content";
import { runModeration } from "./moderation";
import { runEmailCrm } from "./email-crm";
import { runAnalyticsPricing } from "./analytics-pricing";
import { runAffiliate } from "./affiliate";

export const AGENT_REGISTRY: Record<string, AgentRunner> = {
  prompt_factory: runPromptFactory,
  linkedin_publisher: runLinkedinPublisher,
  seo_content: runSeoContent,
  moderation: runModeration,
  email_crm: runEmailCrm,
  analytics_pricing: runAnalyticsPricing,
  affiliate: runAffiliate,
};
