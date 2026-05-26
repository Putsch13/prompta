import { callModel } from "@/lib/llm/gateway";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { executeConnectorAction } from "@/lib/connectors/execute";
import { getUserConnection } from "@/lib/connections";
import { AgentManifestSchema, type AgentManifest, type AgentStep } from "./schema";
import { webSearch, httpFetch, fileRead, scanOutput } from "./tools";
import { logRunActivity } from "./activity-log";
import { runCodeInSandbox } from "./sandbox";

export interface StepUsage {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  tool?: string;
  connectorAction?: string;
}

export interface OrchestratorContext {
  userId: string;
  listingId: string;
  inputs: Record<string, string>;
  apiKeys: Record<string, string>;
  runId?: string;
  dryRun?: boolean;
  onProgress?: (stepsCompleted: number) => void | Promise<void>;
}

export interface OrchestratorResult {
  status: "completed" | "failed" | "suspended";
  stepsCompleted: number;
  output: Record<string, string>;
  error?: string;
  usage?: StepUsage[];
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function executeStep(
  step: AgentStep,
  vars: Record<string, string>,
  ctx: OrchestratorContext,
  maxTokens = 4096,
  stepIndex = 0
): Promise<{ content: string; usage?: StepUsage }> {
  const simulated = ctx.dryRun ?? false;

  if (step.type === "llm") {
    const resolved = resolveModelOrDefault(step.model);
    const { provider, apiModel, tokenParam } = resolved;

    const apiKey = ctx.apiKeys[provider];
    if (!apiKey) throw new Error(`Clé ${provider} manquante`);

    const result = await callModel({
      provider,
      model: apiModel,
      messages: [{ role: "user", content: interpolate(step.prompt, vars) }],
      apiKey,
      maxTokens: Math.min(maxTokens, 4096),
      tokenParam,
    });

    await logRunActivity({
      userId: ctx.userId,
      runId: ctx.runId,
      listingId: ctx.listingId,
      actionType: "llm",
      actionLabel: simulated ? `LLM (aperçu) — ${resolved.catalogId}` : `LLM — ${resolved.catalogId}`,
      simulated,
      detail: { model: apiModel, stepIndex },
    });

    if (scanOutput(result.content)) {
      throw new Error("Sortie interdite détectée — agent suspendu");
    }

    return {
      content: result.content,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: apiModel,
      },
    };
  }

  if (step.type === "tool") {
    if (simulated) {
      const preview = `[APERÇU — outil ${step.tool}]\n${interpolate(step.params.query ?? step.params.url ?? "", vars).slice(0, 500)}`;
      await logRunActivity({
        userId: ctx.userId,
        runId: ctx.runId,
        listingId: ctx.listingId,
        actionType: "tool",
        actionLabel: `Outil ${step.tool} (aperçu)`,
        simulated: true,
        detail: { tool: step.tool, stepIndex },
      });
      return { content: preview, usage: { inputTokens: 0, outputTokens: 0, tool: step.tool } };
    }

    let content: string;
    switch (step.tool) {
      case "web_search":
        content = await webSearch(
          interpolate(step.params.query ?? "", vars),
          ctx.apiKeys.serper
        );
        break;
      case "http_fetch":
        content = await httpFetch(interpolate(step.params.url ?? "", vars));
        break;
      case "file_read":
        content = await fileRead(vars.file_content ?? "");
        break;
      default:
        throw new Error(`Outil non autorisé: ${(step as AgentStep & { tool: string }).tool}`);
    }
    await logRunActivity({
      userId: ctx.userId,
      runId: ctx.runId,
      listingId: ctx.listingId,
      actionType: "tool",
      actionLabel: `Outil ${step.tool}`,
      detail: { tool: step.tool, stepIndex },
    });
    return { content, usage: { inputTokens: 0, outputTokens: 0, tool: step.tool } };
  }

  if (step.type === "action") {
    const conn = await getUserConnection(ctx.userId, step.connector);
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(step.params)) {
      params[k] = interpolate(v, vars);
    }

    const result = await executeConnectorAction(step.action, params, {
      userId: ctx.userId,
      accessToken: conn?.accessToken,
      apiKey: step.connector === "telegram" ? conn?.accessToken : undefined,
      dryRun: simulated,
    });

    await logRunActivity({
      userId: ctx.userId,
      runId: ctx.runId,
      listingId: ctx.listingId,
      actionType: "action",
      actionLabel: simulated ? `${step.action} (aperçu)` : step.action,
      simulated,
      detail: { connector: step.connector, stepIndex },
    });

    if (scanOutput(result.output)) {
      throw new Error("Sortie connecteur interdite détectée");
    }

    return {
      content: result.output,
      usage: { inputTokens: 0, outputTokens: 0, connectorAction: step.action },
    };
  }

  if (step.type === "code") {
    if (simulated) {
      const preview = `[APERÇU — code sandbox non exécuté]\n${interpolate(step.source, vars).slice(0, 300)}…`;
      await logRunActivity({
        userId: ctx.userId,
        runId: ctx.runId,
        listingId: ctx.listingId,
        actionType: "code",
        actionLabel: "Code (aperçu)",
        simulated: true,
        detail: { stepIndex },
      });
      return { content: preview };
    }
    const code = interpolate(step.source, vars);
    const output = await runCodeInSandbox(code);
    if (scanOutput(output)) {
      throw new Error("Sortie code interdite détectée");
    }
    return { content: output };
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
  let latestStepsCompleted = 0;

  const run = async (): Promise<OrchestratorResult> => {
    const vars = { ...context.inputs };
    const outputs: Record<string, string> = {};
    const usageLog: StepUsage[] = [];
    let stepsCompleted = 0;
    let tokensUsed = 0;
    let toolCalls = 0;
    let totalOutputBytes = 0;
    const seenHashes = new Set<string>();

    const maxToolCalls = manifest.limits.max_tool_calls ?? 5;
    const maxOutputBytes = manifest.limits.max_output_bytes ?? 51200;

    try {
      for (const step of manifest.steps) {
        if (stepsCompleted >= manifest.limits.max_steps) {
          throw new Error("Plafond max_steps atteint");
        }

        const { content, usage } = await executeStep(
          step,
          vars,
          context,
          manifest.limits.max_tokens,
          stepsCompleted
        );

        if (step.type === "tool" || step.type === "action") {
          toolCalls++;
          if (toolCalls > maxToolCalls) throw new Error("Plafond max_tool_calls atteint");
        }

        if (step.type === "llm" && usage) {
          tokensUsed += usage.inputTokens + usage.outputTokens;
          if (tokensUsed > manifest.limits.max_tokens) {
            throw new Error("Plafond max_tokens atteint");
          }
          usageLog.push(usage);
        } else if (usage) {
          usageLog.push(usage);
        }

        totalOutputBytes += content.length;
        if (totalOutputBytes > maxOutputBytes) {
          throw new Error("Plafond max_output_bytes atteint");
        }

        const hash = `${step.type}:${content.slice(0, 100)}`;
        if (seenHashes.has(hash)) throw new Error("Boucle détectée — run arrêté");
        seenHashes.add(hash);

        vars[`step_${stepsCompleted}_output`] = content;
        outputs[`step_${stepsCompleted}`] = content;
        stepsCompleted++;
        latestStepsCompleted = stepsCompleted;
        if (context.onProgress) {
          await context.onProgress(stepsCompleted);
        }
      }

      outputs.result = vars[`step_${stepsCompleted - 1}_output`] ?? "";

      return { status: "completed", stepsCompleted, output: outputs, usage: usageLog };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      const status = message.includes("suspendu") ? "suspended" : "failed";
      return { status, stepsCompleted, output: outputs, error: message, usage: usageLog };
    }
  };

  const timeoutMs = manifest.limits.timeout_ms ?? 60000;
  const timeout = new Promise<OrchestratorResult>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout agent dépassé")), timeoutMs)
  );

  try {
    return await Promise.race([run(), timeout]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Timeout";
    return {
      status: "failed",
      stepsCompleted: latestStepsCompleted,
      output: {},
      error: message,
    };
  }
}
