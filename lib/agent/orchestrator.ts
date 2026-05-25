import { callModel } from "@/lib/llm/gateway";
import type { LLMProvider } from "@/lib/llm/providers";
import { AgentManifestSchema, type AgentManifest, type AgentStep } from "./schema";
import { webSearch, httpFetch, fileRead, scanOutput } from "./tools";
import { runCodeInSandbox } from "./sandbox";

export interface OrchestratorContext {
  userId: string;
  listingId: string;
  inputs: Record<string, string>;
  apiKeys: Record<string, string>;
  preferredModel?: string;
}

export interface OrchestratorResult {
  status: "completed" | "failed" | "suspended";
  stepsCompleted: number;
  output: Record<string, string>;
  error?: string;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function executeStep(
  step: AgentStep,
  vars: Record<string, string>,
  apiKeys: Record<string, string>
): Promise<string> {
  if (step.type === "llm") {
    const provider = step.model.startsWith("claude")
      ? "anthropic"
      : step.model.startsWith("gemini")
        ? "google"
        : step.model.startsWith("mistral")
          ? "mistral"
          : "openai";

    const apiKey = apiKeys[provider];
    if (!apiKey) throw new Error(`Clé ${provider} manquante`);

    const result = await callModel({
      provider: provider as LLMProvider,
      model: step.model,
      messages: [{ role: "user", content: interpolate(step.prompt, vars) }],
      apiKey,
    });

    if (scanOutput(result.content)) {
      throw new Error("Sortie interdite détectée — agent suspendu");
    }

    return result.content;
  }

  if (step.type === "tool") {
    switch (step.tool) {
      case "web_search":
        return webSearch(
          interpolate(step.params.query ?? "", vars),
          apiKeys.serper
        );
      case "http_fetch":
        return httpFetch(interpolate(step.params.url ?? "", vars));
      case "file_read":
        return fileRead(vars.file_content ?? "");
      default:
        throw new Error(`Outil non autorisé: ${step.tool}`);
    }
  }

  if (step.type === "code") {
    const code = interpolate(step.source, vars);
    const output = await runCodeInSandbox(code);
    if (scanOutput(output)) {
      throw new Error("Sortie code interdite détectée");
    }
    return output;
  }

  throw new Error("Étape inconnue");
}

export async function runAgent(
  manifestRaw: unknown,
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  const parsed = AgentManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return {
      status: "failed",
      stepsCompleted: 0,
      output: {},
      error: "Manifeste agent invalide",
    };
  }

  const manifest: AgentManifest = parsed.data;
  const vars = { ...context.inputs };
  const outputs: Record<string, string> = {};
  let stepsCompleted = 0;

  try {
    for (const step of manifest.steps) {
      if (stepsCompleted >= manifest.limits.max_steps) {
        throw new Error("Plafond max_steps atteint");
      }

      const result = await executeStep(step, vars, context.apiKeys);
      vars[`step_${stepsCompleted}_output`] = result;
      outputs[`step_${stepsCompleted}`] = result;
      stepsCompleted++;
    }

    outputs.result = vars[`step_${stepsCompleted - 1}_output`] ?? "";

    return { status: "completed", stepsCompleted, output: outputs };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    const status = message.includes("suspendu") ? "suspended" : "failed";
    return { status, stepsCompleted, output: outputs, error: message };
  }
}
