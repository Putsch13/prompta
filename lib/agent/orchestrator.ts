import { callModel } from "@/lib/llm/gateway";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { executeConnectorAction } from "@/lib/connectors/execute";
import { getUserConnection } from "@/lib/connections";
import { AgentManifestSchema, type AgentManifest, type AgentStep, type BaseAgentStep, type ParallelStep } from "./schema";
import { webSearch, httpFetch, fileRead, scanOutput } from "./tools";
import { logRunActivity } from "./activity-log";
import { runCodeInSandbox } from "./sandbox";
import { evaluateCondition } from "./condition";
import { createPendingApproval } from "./approvals";
import { getRelevantMemories, saveRunMemory } from "./memory";
import { retrieveFromSource } from "@/lib/data-sources/retrieve";
import { getUserPrivileges, UNRESTRICTED_LIMITS } from "@/lib/auth/privileges";
import { ensureAutoResources } from "@/lib/provisioning/ensure-resources";
import { resolveDocumentFromInputs } from "@/lib/documents/user-documents";
import {
  logStepStarted,
  logStepSuccess,
  logStepFailed,
  logStepSkipped,
  updateStepInput,
} from "./step-logger";

export interface StepUsage {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  tool?: string;
  connectorAction?: string;
}

export interface StepTraceEntry {
  stepIndex: number;
  stepType: string;
  label: string;
  status: "success" | "failed" | "skipped" | "running";
  outputPreview?: string;
  durationMs?: number;
  model?: string;
  actionSlug?: string;
}

export interface OrchestratorContext {
  userId: string;
  listingId: string;
  inputs: Record<string, string>;
  apiKeys: Record<string, string>;
  runId?: string;
  dryRun?: boolean;
  /** Builder / test : auto-approuve les étapes validation humaine */
  demoMode?: boolean;
  onProgress?: (stepsCompleted: number) => void | Promise<void>;
}

export interface OrchestratorResult {
  status: "completed" | "failed" | "suspended" | "awaiting_approval";
  stepsCompleted: number;
  output: Record<string, string>;
  error?: string;
  usage?: StepUsage[];
  stepTrace?: StepTraceEntry[];
  approvalId?: string;
}

function resolveJsonPath(obj: string, path: string): string {
  try {
    let current: unknown = JSON.parse(obj);
    for (const segment of path.split(".")) {
      if (current == null || typeof current !== "object") return obj;
      current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === "string" ? current : JSON.stringify(current);
  } catch {
    return obj;
  }
}

/**
 * Interpolate {{key}} and {{key.path.to.field}} references.
 * - Simple: {{my_var}} → vars["my_var"]
 * - JSON path: {{step_0_output.data.name}} → JSON parse step_0_output then access data.name
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, expr: string) => {
    const dotIdx = expr.indexOf(".");
    if (dotIdx === -1) {
      return vars[expr] ?? match;
    }
    const baseKey = expr.slice(0, dotIdx);
    const path = expr.slice(dotIdx + 1);
    const baseVal = vars[baseKey];
    if (baseVal === undefined) return match;
    return resolveJsonPath(baseVal, path);
  });
}

function extractErrorCode(err: unknown): string {
  if (!(err instanceof Error)) return "unknown";
  const msg = err.message;
  if (msg.includes("401") || msg.includes("invalid_api_key")) return "invalid_api_key";
  if (msg.includes("403") || msg.includes("permission")) return "permission_denied";
  if (msg.includes("429") || msg.includes("rate_limit")) return "rate_limit";
  if (msg.includes("quota") || msg.includes("billing")) return "insufficient_quota";
  if (msg.includes("not found") || msg.includes("404")) return "model_not_found";
  if (msg.includes("timeout") || msg.includes("Timeout")) return "timeout";
  return "provider_error";
}

const RETRYABLE_CODES = new Set(["rate_limit", "timeout", "provider_error"]);

async function executeStepWithRetry(
  step: AgentStep,
  vars: Record<string, string>,
  ctx: OrchestratorContext,
  maxTokens: number,
  stepIndex: number,
  maxAttempts = 2
): Promise<{ content: string; usage?: StepUsage; awaitingApproval?: string }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await executeStep(step, vars, ctx, maxTokens, stepIndex);
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && err.message === "awaiting_approval") {
        throw err;
      }
      const code = extractErrorCode(err);
      if (attempt >= maxAttempts || !RETRYABLE_CODES.has(code)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

async function executeStep(
  step: AgentStep,
  vars: Record<string, string>,
  ctx: OrchestratorContext,
  maxTokens = 4096,
  stepIndex = 0
): Promise<{ content: string; usage?: StepUsage }> {
  const simulated = ctx.dryRun ?? false;
  const runId = ctx.runId;

  const sType = step.type;
  const stepLabel = sType === "llm"
    ? `LLM ${step.model}`
    : sType === "tool"
      ? `Outil ${step.tool}`
      : sType === "action"
        ? `Action ${step.action}`
        : sType === "condition"
          ? "Condition"
          : sType === "approval"
            ? `Approbation ${step.label ?? ""}`.trim()
            : sType === "retrieve"
              ? `Retrieve ${step.source}`
              : "Code sandbox";

  const resolved = sType === "llm" ? resolveModelOrDefault(step.model) : null;

  let stepDbId = "";
  const stepStartedAt = new Date();

  if (runId) {
    try {
      stepDbId = await logStepStarted({
        runId,
        stepIndex,
        stepId: `step_${stepIndex}`,
        stepType: step.type,
        label: stepLabel,
        provider: resolved?.provider,
        model: resolved?.apiModel,
        toolSlug: sType === "tool" ? step.tool : undefined,
        actionSlug: sType === "action" ? step.action : undefined,
      });
    } catch (e) {
      console.warn("[orchestrator] step log insert failed:", e);
    }
  }

  try {
    if (step.type === "llm") {
      const { provider, apiModel, tokenParam } = resolved!;
      const apiKey = ctx.apiKeys[provider];
      if (!apiKey) throw new Error(`Clé ${provider} manquante`);

      const prompt = interpolate(step.prompt, vars);
      if (runId && stepDbId) {
        await updateStepInput(stepDbId, { prompt: prompt.slice(0, 500) }).catch(() => undefined);
      }

      let memoryContext = "";
      const memEnabled = (ctx as OrchestratorContext & { memoryEnabled?: boolean }).memoryEnabled;
      if (memEnabled && ctx.listingId) {
        const memories = await getRelevantMemories(ctx.listingId, ctx.userId, prompt, 3);
        if (memories.length) {
          memoryContext = `\n\nContexte mémoire:\n${memories.join("\n---\n")}`;
        }
      }

      const result = await callModel({
        provider,
        model: apiModel,
        messages: [{ role: "user", content: prompt + memoryContext }],
        apiKey,
        maxTokens: Math.min(maxTokens, 4096),
        tokenParam,
      });

      await logRunActivity({
        userId: ctx.userId,
        runId: ctx.runId,
        listingId: ctx.listingId,
        actionType: "llm",
        actionLabel: simulated ? `LLM (aperçu) — ${resolved!.catalogId}` : `LLM — ${resolved!.catalogId}`,
        simulated,
        detail: { model: apiModel, stepIndex },
      });

      if (scanOutput(result.content)) {
        throw new Error("Sortie interdite détectée — agent suspendu");
      }

      const usage = {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: apiModel,
      };

      if (runId && stepDbId) {
        await logStepSuccess(stepDbId, result.content.slice(0, 1000), usage, stepStartedAt).catch(() => undefined);
      }

      return { content: result.content, usage };
    }

    if (step.type === "tool") {
      if (simulated) {
        const queryPreview = interpolate(step.params.query ?? step.params.url ?? "", vars).slice(0, 500);
        const preview = `[APERÇU — outil ${step.tool}, étape ${stepIndex + 1}]\n${queryPreview || "(aucun paramètre)"}`;
        await logRunActivity({
          userId: ctx.userId,
          runId: ctx.runId,
          listingId: ctx.listingId,
          actionType: "tool",
          actionLabel: `Outil ${step.tool} (aperçu)`,
          simulated: true,
          detail: { tool: step.tool, stepIndex },
        });
        if (runId && stepDbId) {
          await logStepSuccess(stepDbId, preview.slice(0, 500), undefined, stepStartedAt).catch(() => undefined);
        }
        return { content: preview, usage: { inputTokens: 0, outputTokens: 0, tool: step.tool } };
      }

      let content: string;
      switch (step.tool) {
        case "web_search":
          content = await webSearch(interpolate(step.params.query ?? "", vars), ctx.apiKeys.serper);
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

      if (runId && stepDbId) {
        await logStepSuccess(stepDbId, content.slice(0, 1000), undefined, stepStartedAt).catch(() => undefined);
      }

      return { content, usage: { inputTokens: 0, outputTokens: 0, tool: step.tool } };
    }

    if (step.type === "action") {
      const conn = await getUserConnection(ctx.userId, step.connector);
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(step.params)) {
        params[k] = interpolate(v, vars);
      }

      if (runId && stepDbId) {
        await updateStepInput(stepDbId, params).catch(() => undefined);
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

      if (runId && stepDbId) {
        await logStepSuccess(stepDbId, result.output.slice(0, 1000), undefined, stepStartedAt).catch(() => undefined);
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
        if (runId && stepDbId) {
          await logStepSuccess(stepDbId, preview.slice(0, 500), undefined, stepStartedAt).catch(() => undefined);
        }
        return { content: preview };
      }
      const code = interpolate(step.source, vars);
      const output = await runCodeInSandbox(code);
      if (scanOutput(output)) {
        throw new Error("Sortie code interdite détectée");
      }

      if (runId && stepDbId) {
        await logStepSuccess(stepDbId, output.slice(0, 1000), undefined, stepStartedAt).catch(() => undefined);
      }
      return { content: output };
    }

    if (step.type === "condition") {
      const expr = interpolate(step.expression, vars);
      const result = evaluateCondition(expr, vars);
      const content = JSON.stringify({ result, expression: expr });
      if (runId && stepDbId) {
        await logStepSuccess(stepDbId, content, undefined, stepStartedAt).catch(() => undefined);
      }
      return { content };
    }

    if (step.type === "retrieve") {
      const query = interpolate(step.query, vars);
      if (simulated) {
        const preview = `[APERÇU — retrieve ${step.source}]\nQuery: ${query}`;
        if (runId && stepDbId) {
          await logStepSuccess(stepDbId, preview, undefined, stepStartedAt).catch(() => undefined);
        }
        return { content: preview };
      }
      const retrieved = await retrieveFromSource({
        source: step.source,
        query,
        maxResults: step.maxResults,
        userId: ctx.userId,
        fileContent: vars.file_content,
      });
      const content = JSON.stringify({ data: retrieved.content, sources: retrieved.sources });
      if (runId && stepDbId) {
        await logStepSuccess(stepDbId, content.slice(0, 1000), undefined, stepStartedAt).catch(() => undefined);
      }
      return { content };
    }

    if (step.type === "approval") {
      const payloadText = step.payloadTemplate
        ? interpolate(step.payloadTemplate, vars)
        : JSON.stringify(Object.fromEntries(Object.entries(vars).slice(0, 10)));
      if (simulated || ctx.demoMode) {
        const preview = ctx.demoMode
          ? `[DÉMO — validation auto-approuvée]\n${payloadText.slice(0, 500)}`
          : `[APERÇU — approbation requise]\n${payloadText.slice(0, 500)}`;
        if (runId && stepDbId) {
          await logStepSuccess(stepDbId, preview, undefined, stepStartedAt).catch(() => undefined);
        }
        return { content: preview };
      }
      if (!runId) throw new Error("Approbation requiert un runId");
      const approvalId = await createPendingApproval({
        runId,
        stepIndex,
        payload: { label: step.label, preview: payloadText.slice(0, 2000) },
        expiresInMinutes: step.expiresInMinutes,
      });
      if (stepDbId) {
        await logStepSuccess(stepDbId, "En attente d'approbation", undefined, stepStartedAt).catch(() => undefined);
      }
      const err = new Error("awaiting_approval");
      (err as Error & { approvalId?: string }).approvalId = approvalId;
      throw err;
    }

    throw new Error("Étape inconnue");
  } catch (err) {
    if (runId && stepDbId) {
      const errCode = extractErrorCode(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      await logStepFailed(stepDbId, errCode, errMsg, stepStartedAt).catch(() => undefined);
    }
    throw err;
  }
}

function describeStep(step: AgentStep, index: number): string {
  if (step.type === "parallel") {
    return `Parallel (${step.branches.length} branches)`;
  }
  switch (step.type) {
    case "llm":
      return step.model;
    case "tool":
      return `Outil ${step.tool}`;
    case "action":
      return `${step.connector} → ${step.action}`;
    case "code":
      return "Code Python";
    case "condition":
      return "Condition";
    case "approval":
      return step.label ?? "Approbation";
    case "retrieve":
      return `Retrieve ${step.source}`;
    default:
      return `Étape ${index + 1}`;
  }
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
  const privileges = await getUserPrivileges(context.userId);
  const effectiveLimits = privileges.unrestricted
    ? { ...manifest.limits, ...UNRESTRICTED_LIMITS }
    : manifest.limits;
  const manifestWithLimits = { ...manifest, limits: effectiveLimits };

  let runInputs = { ...context.inputs };
  const docText = await resolveDocumentFromInputs(context.userId, runInputs).catch(() => null);
  if (docText) {
    runInputs.file_content = docText;
    runInputs.document = docText;
  }

  const provisioned = await ensureAutoResources(
    manifestWithLimits,
    {
      userId: context.userId,
      agentTitle: context.listingId !== "preview" ? context.listingId : undefined,
      dryRun: context.dryRun,
    },
    runInputs
  ).catch(() => ({ inputs: runInputs, created: [], logs: [] as string[] }));

  runInputs = provisioned.inputs;
  if (provisioned.logs.length > 0) {
    runInputs._provision_logs = provisioned.logs.join("\n");
  }

  const effectiveContext = { ...context, inputs: runInputs };
  let latestStepsCompleted = 0;
  const memoryEnabled = manifest.memory?.enabled ?? false;
  const startFromStep = (context as OrchestratorContext & { resumeFromStep?: number }).resumeFromStep ?? 0;

  const run = async (): Promise<OrchestratorResult> => {
    const vars = { ...effectiveContext.inputs };
    const outputs: Record<string, string> = {};
    const usageLog: StepUsage[] = [];
    const stepTrace: StepTraceEntry[] = [];
    let stepsCompleted = startFromStep;
    let tokensUsed = 0;
    let toolCalls = 0;
    let totalOutputBytes = 0;
    const seenHashes = new Set<string>();
    let lastOutputSig = "";
    let repeatStreak = 0;

    const maxToolCalls = manifestWithLimits.limits.max_tool_calls ?? 5;
    const maxOutputBytes = manifestWithLimits.limits.max_output_bytes ?? 51200;

    try {
      for (let i = startFromStep; i < manifestWithLimits.steps.length; i++) {
        const step = manifestWithLimits.steps[i];
        const stepStartedAt = Date.now();
        if (stepsCompleted >= manifestWithLimits.limits.max_steps) {
          if (context.runId) {
            await logStepSkipped(
              context.runId, stepsCompleted, `step_${stepsCompleted}`,
              step.type, `Step ${stepsCompleted}`, "max_steps atteint"
            ).catch(() => undefined);
          }
          throw new Error("Plafond max_steps atteint");
        }

        // ─── Parallel step ────────────────────────────────────────────────
        if (step.type === "parallel") {
          const parallelStep = step as ParallelStep;
          const ctxWithMemory = { ...effectiveContext, memoryEnabled };

          const branchResults = await Promise.allSettled(
            parallelStep.branches.map(async (branch, branchIdx) => {
              const branchOutputs: string[] = [];
              for (let s = 0; s < branch.steps.length; s++) {
                const subStep = branch.steps[s] as BaseAgentStep;
                const { content, usage: subUsage } = await executeStepWithRetry(
                  subStep,
                  { ...vars },
                  ctxWithMemory,
                  manifestWithLimits.limits.max_tokens,
                  i * 100 + branchIdx * 10 + s
                );
                branchOutputs.push(content);
                if (subUsage) usageLog.push(subUsage);

                if (subStep.type === "tool" || subStep.type === "action") {
                  toolCalls++;
                }
                if (subStep.type === "llm" && subUsage) {
                  tokensUsed += subUsage.inputTokens + subUsage.outputTokens;
                }
                totalOutputBytes += content.length;
              }
              const lastOutput = branchOutputs[branchOutputs.length - 1] ?? "";
              return { lastOutput, branchIdx, outputKey: branch.outputKey };
            })
          );

          if (toolCalls > maxToolCalls) throw new Error("Plafond max_tool_calls atteint");
          if (tokensUsed > manifestWithLimits.limits.max_tokens) throw new Error("Plafond max_tokens atteint");
          if (totalOutputBytes > maxOutputBytes) throw new Error("Plafond max_output_bytes atteint");

          const branchOutputsList: string[] = [];
          const errors: string[] = [];

          for (const result of branchResults) {
            if (result.status === "fulfilled") {
              branchOutputsList.push(result.value.lastOutput);
              if (result.value.outputKey) {
                vars[result.value.outputKey] = result.value.lastOutput;
                outputs[result.value.outputKey] = result.value.lastOutput;
              }
            } else {
              const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
              errors.push(errMsg);
              branchOutputsList.push(`[ERREUR] ${errMsg}`);
            }
          }

          const combinedContent = JSON.stringify(branchOutputsList);
          vars[`step_${stepsCompleted}_output`] = combinedContent;
          outputs[`step_${stepsCompleted}`] = combinedContent;

          if (parallelStep.outputKey) {
            vars[parallelStep.outputKey] = combinedContent;
            outputs[parallelStep.outputKey] = combinedContent;
          }

          const parallelStatus = errors.length > 0 && errors.length === branchResults.length ? "failed" : "success";
          stepTrace.push({
            stepIndex: i,
            stepType: "parallel",
            label: describeStep(step, i),
            status: parallelStatus === "failed" ? "failed" : "success",
            outputPreview: combinedContent.slice(0, 800),
            durationMs: Date.now() - stepStartedAt,
          });

          if (parallelStatus === "failed") {
            throw new Error(`Toutes les branches parallèles ont échoué: ${errors.join("; ")}`);
          }

          stepsCompleted++;
          latestStepsCompleted = stepsCompleted;

          if (context.onProgress) {
            await context.onProgress(stepsCompleted);
          }
          continue;
        }

        // ─── Sequential step (existant) ──────────────────────────────────
        const ctxWithMemory = { ...effectiveContext, memoryEnabled };
        const { content, usage } = await executeStepWithRetry(
          step,
          vars,
          ctxWithMemory,
          manifestWithLimits.limits.max_tokens,
          i
        );

        if (step.type === "tool" || step.type === "action") {
          toolCalls++;
          if (toolCalls > maxToolCalls) throw new Error("Plafond max_tool_calls atteint");
        }

        if (step.type === "llm" && usage) {
          tokensUsed += usage.inputTokens + usage.outputTokens;
          if (tokensUsed > manifestWithLimits.limits.max_tokens) {
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

        if (!effectiveContext.dryRun) {
          const sig = content.slice(0, 400);
          if (sig.length > 0 && sig === lastOutputSig) {
            repeatStreak++;
          } else {
            repeatStreak = 0;
            lastOutputSig = sig;
          }
          if (repeatStreak >= 2) {
            stepTrace.push({
              stepIndex: i,
              stepType: step.type,
              label: describeStep(step, i),
              status: "failed",
              outputPreview: content.slice(0, 800),
              durationMs: Date.now() - stepStartedAt,
              model: step.type === "llm" ? step.model : usage?.model,
              actionSlug: step.type === "action" ? step.action : undefined,
            });
            throw new Error(
              `Boucle détectée à l'étape ${i + 1} (${describeStep(step, i)}) — 3 sorties identiques d'affilée`
            );
          }

          const hash = `${describeStep(step, i)}:${content.slice(0, 120)}`;
          if (seenHashes.has(hash)) {
            stepTrace.push({
              stepIndex: i,
              stepType: step.type,
              label: describeStep(step, i),
              status: "failed",
              outputPreview: content.slice(0, 800),
              durationMs: Date.now() - stepStartedAt,
            });
            throw new Error(
              `Boucle détectée à l'étape ${i + 1} (${describeStep(step, i)}) — même sortie qu'une étape précédente du même type`
            );
          }
          seenHashes.add(hash);
        }

        // Always set by index for backward compat
        vars[`step_${stepsCompleted}_output`] = content;
        outputs[`step_${stepsCompleted}`] = content;

        // If step has a custom outputKey, set it as a named variable too
        const outputKey = step.outputKey;
        if (outputKey && outputKey !== `step_${stepsCompleted}_output`) {
          vars[outputKey] = content;
          outputs[outputKey] = content;
        }

        stepsCompleted++;
        latestStepsCompleted = stepsCompleted;

        stepTrace.push({
          stepIndex: i,
          stepType: step.type,
          label: describeStep(step, i),
          status: "success",
          outputPreview: content.slice(0, 800),
          durationMs: Date.now() - stepStartedAt,
          model: step.type === "llm" ? step.model : usage?.model,
          actionSlug: step.type === "action" ? step.action : undefined,
        });

        if (context.onProgress) {
          await context.onProgress(stepsCompleted);
        }
      }

      outputs.result = vars[`step_${stepsCompleted - 1}_output`] ?? "";

      if (memoryEnabled && effectiveContext.runId) {
        const summary = outputs.result.slice(0, 500);
        if (summary) {
          await saveRunMemory({
            listingId: effectiveContext.listingId,
            userId: effectiveContext.userId,
            runId: effectiveContext.runId,
            content: summary,
            key: "last_run_result",
          }).catch(() => undefined);
        }
      }

      return { status: "completed", stepsCompleted, output: outputs, usage: usageLog, stepTrace };
    } catch (err) {
      if (err instanceof Error && err.message === "awaiting_approval") {
        const approvalId = (err as Error & { approvalId?: string }).approvalId;
        return {
          status: "awaiting_approval",
          stepsCompleted,
          output: outputs,
          error: "En attente d'approbation humaine",
          approvalId,
          usage: usageLog,
          stepTrace,
        };
      }
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      const status = message.includes("suspendu") ? "suspended" : "failed";
      const failIndex = Math.min(stepsCompleted, manifestWithLimits.steps.length - 1);
      const failStep = manifestWithLimits.steps[failIndex];
      const lastTrace = stepTrace[stepTrace.length - 1];
      if (
        failStep &&
        status === "failed" &&
        (!lastTrace || lastTrace.stepIndex !== failIndex || lastTrace.status !== "failed")
      ) {
        stepTrace.push({
          stepIndex: failIndex,
          stepType: failStep.type,
          label: describeStep(failStep, failIndex),
          status: "failed",
          outputPreview: message,
        });
      }
      return { status, stepsCompleted, output: outputs, error: message, usage: usageLog, stepTrace };
    }
  };

  const timeoutMs = manifestWithLimits.limits.timeout_ms ?? 60000;
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
