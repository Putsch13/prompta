import { callModel } from "@/lib/llm/gateway";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { executeConnectorAction } from "@/lib/connectors/execute";
import { getUserConnection } from "@/lib/connections";
import { isResourcePlaceholder } from "@/lib/connectors/param-bindings";
import { getConnectorAction } from "@/lib/connectors/registry";
import { isUnresolvedParamValue } from "@/lib/connectors/format-action-error";
import { mapAgentError } from "@/lib/agent/error-map";
import { applyActionParamDefaults } from "@/lib/connectors/param-defaults";
import { buildContract, type AgentContract } from "@/lib/agent/contract";
import {
  resolveAgentInterface,
  resolvedValueForStepParam,
  type ResolvedInput,
} from "@/lib/agent/resolve-interface";
import { AgentManifestSchema, type AgentManifest, type AgentStep, type BaseAgentStep, type ParallelStep } from "./schema";
import { webSearch, httpFetch, fileRead } from "./tools";
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
import { checkIdempotency, beginExecution, completeExecution, failExecution } from "./idempotency";
import { checkWriteFileParams } from "@/lib/connectors/write-file-guard";
import { extractResourceId } from "@/lib/connectors/extract-resource-id";
import { isCancelRequested, markRunCancelled } from "./cancellation";
import { saveDeliverable, sanitizeDeliverableFilename } from "./deliverables";

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
  errorMessage?: string;
  durationMs?: number;
  model?: string;
  actionSlug?: string;
  simulated?: boolean;
}

export interface OrchestratorContext {
  userId: string;
  listingId: string;
  /** Créateur de l'agent — pour résoudre les étapes sharedEnv */
  creatorId?: string;
  inputs: Record<string, string>;
  /** Valeurs choisies pour {{resource:…}} — clés « stepIndex:paramKey » */
  resources?: Record<string, string>;
  apiKeys: Record<string, string>;
  runId?: string;
  dryRun?: boolean;
  /** Builder / test : auto-approuve les étapes validation humaine */
  demoMode?: boolean;
  /** Reprise après approbation ou crash worker */
  resumeFromStep?: number;
  resumeOutputs?: Record<string, string>;
  onProgress?: (stepsCompleted: number, outputs?: Record<string, string>) => void | Promise<void>;
  /**
   * Pré-calculé par `runAgent` via `resolveAgentInterface(contract, { phase: "run" })` :
   * pour chaque paramètre d'étape on connaît la valeur effective (résolue/ask/missing).
   * L'orchestrateur ne fait plus de logique de résolution ad hoc (Pilier B).
   */
  resolvedInterface?: ResolvedInput[];
  contract?: AgentContract;
}

export interface OrchestratorResult {
  status: "completed" | "failed" | "suspended" | "awaiting_approval" | "cancelled";
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
 * - `maxVarChars` : plafond PAR VALEUR substituée — indispensable pour les
 *   prompts LLM : une extraction (Gmail, Sheets…) peut ramener des centaines
 *   de Ko de JSON qui feraient exploser le prompt (erreur fournisseur, coût).
 */
function interpolate(
  template: string,
  vars: Record<string, string>,
  opts?: { maxVarChars?: number },
): string {
  const cap = (v: string): string =>
    opts?.maxVarChars && v.length > opts.maxVarChars
      ? `${v.slice(0, opts.maxVarChars)}\n…[contenu tronqué : ${Math.round(v.length / 1000)} Ko au total]`
      : v;
  return template.replace(/\{\{([\w.:]+)\}\}/g, (match, expr: string) => {
    if (expr.startsWith("resource:")) {
      return vars[expr] ?? match;
    }
    const dotIdx = expr.indexOf(".");
    if (dotIdx === -1) {
      return vars[expr] !== undefined ? cap(vars[expr]) : match;
    }
    const baseKey = expr.slice(0, dotIdx);
    const path = expr.slice(dotIdx + 1);
    const baseVal = vars[baseKey];
    if (baseVal === undefined) return match;
    return cap(resolveJsonPath(baseVal, path));
  });
}

/** Plafond par variable dans un prompt LLM (~6k tokens par valeur). */
const LLM_VAR_CHAR_CAP = 24_000;

/**
 * Champs de contenu où une URL doit rester intacte (on n'extrait pas l'ID).
 * Pour tout le reste (folder_url, spreadsheet_id, file_id…), on extrait l'ID
 * depuis une URL collée.
 */
function isContentParamKey(key: string): boolean {
  return /body|content|text|message|html|markdown|description|caption|note|prompt|query|subject|title|name/i.test(
    key,
  );
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
      const prompt = interpolate(step.prompt, vars, { maxVarChars: LLM_VAR_CHAR_CAP });
      if (runId && stepDbId) {
        await updateStepInput(stepDbId, { prompt: prompt.slice(0, 500) }).catch(() => undefined);
      }

      if (simulated || ctx.demoMode) {
        const preview = ctx.demoMode
          ? `[DÉMO — LLM ${apiModel}]\n${prompt.slice(0, 500)}`
          : `[APERÇU — LLM ${apiModel}]\n${prompt.slice(0, 500)}`;
        await logRunActivity({
          userId: ctx.userId,
          runId: ctx.runId,
          listingId: ctx.listingId,
          actionType: "llm",
          actionLabel: simulated ? `LLM (aperçu) — ${resolved!.catalogId}` : `LLM (démo) — ${resolved!.catalogId}`,
          simulated: true,
          detail: { model: apiModel, stepIndex },
        }).catch(() => undefined);
        if (runId && stepDbId) {
          await logStepSuccess(stepDbId, preview.slice(0, 500), undefined, stepStartedAt).catch(() => undefined);
        }
        return {
          content: preview,
          usage: { inputTokens: 0, outputTokens: 0, model: apiModel },
        };
      }

      const apiKey = ctx.apiKeys[provider];
      if (!apiKey) throw new Error(`Clé ${provider} manquante`);

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
      const useCreatorEnv =
        step.sharedEnv === true &&
        ctx.creatorId &&
        ctx.creatorId !== ctx.userId;
      const connUserId = useCreatorEnv ? ctx.creatorId! : ctx.userId;
      const conn = await getUserConnection(connUserId, step.connector);
      // Sans connexion utilisable, ne pas appeler l'API du service avec un token
      // undefined (401 cryptique) : message clair et actionnable tout de suite.
      if (!conn && !simulated) {
        throw new Error(
          useCreatorEnv
            ? `Le connecteur ${step.connector} du créateur de l'agent n'est plus connecté — le créateur doit le reconnecter.`
            : `${step.connector} n'est pas connecté (ou la connexion a expiré sans pouvoir être rafraîchie). Reconnectez-le dans Connexions puis relancez.`,
        );
      }
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(step.params)) {
        let raw = v;
        // Pilier B : on consomme la décision du Résolveur (P2.1) au lieu de
        // re-faire la logique de résolution localement.
        const resolved = ctx.resolvedInterface
          ? resolvedValueForStepParam(ctx.resolvedInterface, stepIndex, k)
          : undefined;
        if (resolved?.resolvedValue && resolved.status === "resolved") {
          raw = resolved.resolvedValue;
        } else if (isResourcePlaceholder(v)) {
          // Fallback historique pour les appels qui n'auraient pas pré-résolu (tests/legacy)
          const resourceKey = `${stepIndex}:${k}`;
          const override = ctx.resources?.[resourceKey] ?? ctx.inputs?.[resourceKey];
          if (override) {
            raw = override;
          } else {
            const rt = v.trim().slice("{{resource:".length, -2);
            raw = ctx.inputs[`resource:${rt}`] ?? v;
          }
        }
        const interpolated = interpolate(raw, vars);
        // Extraction d'ID depuis une URL collée (Doc/Sheet/dossier Drive…),
        // sauf pour les champs de contenu (où une URL est légitime).
        params[k] = isContentParamKey(k) ? interpolated : extractResourceId(interpolated);
      }

      // Remplissage par IA des paramètres en champ libre (avant défauts/validation).
      if (step.aiFills && Object.keys(step.aiFills).length > 0) {
        for (const [key, fill] of Object.entries(step.aiFills)) {
          const fillModel = resolveModelOrDefault(fill.model);
          const fillPrompt = interpolate(fill.prompt, vars, { maxVarChars: LLM_VAR_CHAR_CAP });
          if (simulated || ctx.demoMode) {
            params[key] = `[${ctx.demoMode ? "DÉMO" : "APERÇU"} IA ${fillModel.apiModel}] ${fillPrompt.slice(0, 200)}`;
            continue;
          }
          const fillApiKey = ctx.apiKeys[fillModel.provider];
          if (!fillApiKey) {
            throw new Error(
              `Clé ${fillModel.provider} manquante pour le remplissage IA du paramètre « ${key} »`,
            );
          }
          const filled = await callModel({
            provider: fillModel.provider,
            model: fillModel.apiModel,
            messages: [{ role: "user", content: fillPrompt }],
            apiKey: fillApiKey,
            maxTokens: 1024,
            tokenParam: fillModel.tokenParam,
          });
          params[key] = filled.content.trim();
          await logRunActivity({
            userId: ctx.userId,
            runId: ctx.runId,
            listingId: ctx.listingId,
            actionType: "llm",
            actionLabel: `IA remplissage « ${key} » — ${fillModel.catalogId}`,
            simulated: false,
            detail: { model: fillModel.apiModel, stepIndex, paramKey: key },
          }).catch(() => undefined);
        }
      }

      Object.assign(
        params,
        applyActionParamDefaults(step.connector, step.action, params),
      );

      const actionDef = getConnectorAction(step.connector, step.action);
      // Alias snake_case ↔ camelCase : le registre dit « spreadsheetId », les
      // plans générés disent souvent « spreadsheet_id » — on aligne sur la clé
      // canonique au lieu d'échouer en « non renseigné ».
      for (const input of actionDef?.inputs ?? []) {
        if (params[input.key] !== undefined) continue;
        const snake = input.key.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`);
        const camel = input.key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        for (const alias of [snake, camel]) {
          if (alias !== input.key && params[alias] !== undefined) {
            params[input.key] = params[alias];
            break;
          }
        }
      }
      for (const input of actionDef?.inputs ?? []) {
        if (!input.required) continue;
        const val = params[input.key];
        if (isUnresolvedParamValue(val)) {
          // Message piloté par le résolveur si dispo (libellés cohérents partout)
          const resolved = ctx.resolvedInterface
            ? resolvedValueForStepParam(ctx.resolvedInterface, stepIndex, input.key)
            : undefined;
          const message =
            resolved?.message ??
            `Paramètre « ${input.label} » non renseigné — choisissez la ressource ou renseignez la valeur.`;
          throw new Error(message);
        }
      }

      // P0-1 : garde-fou écriture de fichier (évite les fichiers vides « Untitled »).
      if (!simulated) {
        const writeCheck = checkWriteFileParams(step.action, params);
        if (!writeCheck.ok) {
          throw new Error(`missing_file_content: ${writeCheck.reason}`);
        }
      }

      if (runId && stepDbId) {
        await updateStepInput(stepDbId, params).catch(() => undefined);
      }

      if (runId && !simulated) {
        const cached = await checkIdempotency(runId, stepIndex, step.action, params);
        if (cached.inProgress) {
          throw new Error(
            "Action externe déjà en cours pour cette étape — attendez ou relancez manuellement.",
          );
        }
        if (cached.alreadyExecuted && cached.previousOutput != null) {
          await logRunActivity({
            userId: ctx.userId,
            runId: ctx.runId,
            listingId: ctx.listingId,
            actionType: "action",
            actionLabel: `${step.action} (idempotent cache)`,
            simulated: false,
            detail: { connector: step.connector, stepIndex },
          });
          if (runId && stepDbId) {
            await logStepSuccess(stepDbId, cached.previousOutput.slice(0, 1000), undefined, stepStartedAt).catch(() => undefined);
          }
          return {
            content: cached.previousOutput,
            usage: { inputTokens: 0, outputTokens: 0, connectorAction: step.action },
          };
        }
      }

      let executionId: string | null = null;
      try {
        if (runId && !simulated) {
          executionId = await beginExecution(runId, stepIndex, step.action, params);
        }

        const result = await executeConnectorAction(step.action, params, {
          userId: ctx.userId,
          accessToken: conn?.accessToken,
          apiKey: step.connector === "telegram" ? conn?.accessToken : undefined,
          dryRun: simulated,
          connector: step.connector,
          provider: conn?.provider,
        });

        if (runId && !simulated && executionId) {
          await completeExecution(executionId, result.output).catch(() => undefined);
        }

        await logRunActivity({
          userId: ctx.userId,
          runId: ctx.runId,
          listingId: ctx.listingId,
          actionType: "action",
          actionLabel: simulated ? `${step.action} (aperçu)` : step.action,
          simulated,
          detail: { connector: step.connector, stepIndex },
        });

        if (runId && stepDbId) {
          await logStepSuccess(stepDbId, result.output.slice(0, 1000), undefined, stepStartedAt).catch(() => undefined);
        }

        return {
          content: result.output,
          usage: { inputTokens: 0, outputTokens: 0, connectorAction: step.action },
        };
      } catch (err) {
        // P3.2 : mapping unifié vers AgentRuntimeError (codes + hints lisibles)
        const mapped = mapAgentError(err, { connector: step.connector, action: step.action });
        const message = mapped.hint ? `${mapped.message} — ${mapped.hint}` : mapped.message;
        if (executionId && runId && !simulated) {
          await failExecution(executionId, message).catch(() => undefined);
        }
        throw new Error(message);
      }
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
      // Le contenu À VALIDER = template interpolé + contenu produit par l'étape
      // amont (le rapport/email/message), pour que l'utilisateur voie vraiment
      // ce qu'il approuve (et pas juste « Action : … »).
      const interpolated = step.payloadTemplate
        ? interpolate(step.payloadTemplate, vars).trim()
        : "";
      const upstream = (vars[`step_${stepIndex - 1}_output`] ?? "").trim();
      const previewParts: string[] = [];
      if (interpolated) previewParts.push(interpolated);
      if (upstream && !interpolated.includes(upstream.slice(0, 80))) {
        previewParts.push(`— Contenu à valider —\n${upstream}`);
      }
      const payloadText =
        previewParts.join("\n\n") ||
        JSON.stringify(Object.fromEntries(Object.entries(vars).slice(0, 10)));
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
        // `preview` (2000 car.) sert à l'affichage/notification ; `full` porte le
        // contenu INTÉGRAL — c'est lui qui devient la sortie validée, sinon tout
        // ce qui suit l'approbation (emails, docs) était tronqué à 2000 caractères.
        payload: {
          label: step.label,
          preview: payloadText.slice(0, 2000),
          full: payloadText.slice(0, 200_000),
        },
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
    // "awaiting_approval" est un signal de PAUSE, pas une erreur : l'étape reste
    // « en attente » (déjà loggée), on ne la marque PAS en échec.
    if (err instanceof Error && err.message === "awaiting_approval") {
      throw err;
    }
    if (runId && stepDbId) {
      const errCode = extractErrorCode(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const detail =
        step.type === "action"
          ? {
              connector: step.connector,
              actionSlug: step.action,
              rawProviderError: errMsg,
            }
          : undefined;
      await logStepFailed(stepDbId, errCode, errMsg, stepStartedAt, detail).catch(() => undefined);
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

async function persistRunDeliverables(params: {
  runId: string;
  listingId: string;
  userId: string;
  outputs: Record<string, string>;
  manifest: AgentManifest;
}): Promise<void> {
  const saved = new Set<string>();

  async function saveOne(key: string, content: string, kind = "text") {
    if (!content.trim() || saved.has(key)) return;
    saved.add(key);
    const ext = kind === "json" ? "json" : kind === "markdown" ? "md" : kind === "html" ? "html" : "txt";
    await saveDeliverable({
      runId: params.runId,
      listingId: params.listingId,
      userId: params.userId,
      kind,
      filename: sanitizeDeliverableFilename(`${key}.${ext}`),
      mimeType: kind === "json" ? "application/json" : kind === "html" ? "text/html" : "text/plain",
      content,
      previewText: kind === "html" ? params.outputs.result?.slice(0, 500) : content.slice(0, 500),
    });
  }

  if (params.outputs.result) {
    await saveOne("result", params.outputs.result, "markdown");
  }

  // Rapport HTML stylé (téléchargeable, imprimable en PDF) : le livrable
  // « présentable » du dossier de mission. `result` est souvent la réponse
  // JSON du dernier envoi (inutilisable) — on prend le contenu TEXTE le plus
  // substantiel produit par la mission (dossier, mémo, synthèse…).
  const isJsonLike = (v: string) => /^[[{]/.test(v.trim());
  const reportSource =
    Object.entries(params.outputs)
      .filter(
        ([k, v]) =>
          !k.startsWith("step_") &&
          k !== "result" &&
          typeof v === "string" &&
          v.trim().length > 400 &&
          !isJsonLike(v),
      )
      .sort((a, b) => b[1].length - a[1].length)[0] ??
    (params.outputs.result && params.outputs.result.trim().length > 400 && !isJsonLike(params.outputs.result)
      ? (["result", params.outputs.result] as [string, string])
      : null);
  if (reportSource) {
    try {
      const { markdownToDocumentHtml } = await import("@/lib/email/markdown-to-html");
      await saveDeliverable({
        runId: params.runId,
        listingId: params.listingId,
        userId: params.userId,
        kind: "html",
        filename: "rapport.html",
        mimeType: "text/html",
        content: markdownToDocumentHtml(reportSource[1], {
          title: "Rapport de mission",
          subtitle: "Dossier de mission Prompta",
        }),
        previewText: reportSource[1].slice(0, 500),
      });
    } catch {
      // best-effort — le .md reste disponible
    }
  }

  for (const key of params.manifest.outputs ?? []) {
    if (key === "result") continue;
    const val = params.outputs[key];
    if (val) await saveOne(key, val);
  }

  for (const [key, val] of Object.entries(params.outputs)) {
    if (key.startsWith("step_") || key === "result") continue;
    if (val) await saveOne(key, val);
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
  // Plancher runtime : les versions publiées avant le redimensionnement des
  // limites (builder ≤ 2026-07) portent des plafonds intenables figés dans leur
  // manifeste (60 s, 5 tool calls, 8 000 tokens cumulés, 50 Ko) qui faisaient
  // échouer des runs valides. Le coût reste gardé par le hold de crédits.
  const flooredLimits = {
    ...manifest.limits,
    max_steps: Math.max(manifest.limits.max_steps, manifest.steps.length + 2),
    max_tokens: Math.max(manifest.limits.max_tokens, 16_000),
    timeout_ms: Math.max(manifest.limits.timeout_ms ?? 60_000, 120_000),
    max_tool_calls: Math.max(manifest.limits.max_tool_calls ?? 5, 10),
    max_output_bytes: Math.max(manifest.limits.max_output_bytes ?? 51_200, 512_000),
  };
  const effectiveLimits = privileges.unrestricted
    ? { ...flooredLimits, ...UNRESTRICTED_LIMITS }
    : flooredLimits;
  const manifestWithLimits = { ...manifest, limits: effectiveLimits };

  let runInputs = { ...context.inputs };
  const resources: Record<string, string> = { ...(context.resources ?? {}) };
  const cleanInputs: Record<string, string> = {};
  for (const [k, v] of Object.entries(runInputs)) {
    if (/^\d+:\w+$/.test(k)) {
      if (v?.trim()) resources[k] = v.trim();
    } else {
      cleanInputs[k] = v;
    }
  }
  runInputs = cleanInputs;
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

  // Pilier B : on calcule une fois le Résolveur (P2.1) — l'orchestrateur consomme
  // la décision plutôt que de re-faire la logique de résolution dans le pas action.
  const contract = context.contract ?? buildContract(manifest.steps);
  const resolvedInterface = resolveAgentInterface(contract, {
    phase: "run",
    runnerId: context.userId,
    creatorId: context.creatorId,
    provided: runInputs,
    resources,
  });

  const effectiveContext = {
    ...context,
    inputs: runInputs,
    resources,
    contract,
    resolvedInterface,
  };
  let latestStepsCompleted = 0;
  let latestOutputs: Record<string, string> = {};
  // Signal d'arrêt coopératif : quand le timeout global a déjà fait échouer le
  // run, la boucle abandonnée ne doit plus exécuter d'étape (actions externes
  // fantômes) ni réécrire l'état d'un run déjà marqué failed.
  let timedOut = false;
  const memoryEnabled = manifest.memory?.enabled ?? false;
  const startFromStep = context.resumeFromStep ?? 0;
  const resumeOutputs = context.resumeOutputs ?? {};

  const run = async (): Promise<OrchestratorResult> => {
    const vars = { ...effectiveContext.inputs, ...resumeOutputs };
    const outputs: Record<string, string> = { ...resumeOutputs };
    latestOutputs = outputs;
    const usageLog: StepUsage[] = [];
    const stepTrace: StepTraceEntry[] = [];
    let stepsCompleted = startFromStep;
    let tokensUsed = 0;
    let toolCalls = 0;
    let totalOutputBytes = 0;

    const maxToolCalls = manifestWithLimits.limits.max_tool_calls ?? 5;
    const maxOutputBytes = manifestWithLimits.limits.max_output_bytes ?? 51200;

    try {
      for (let i = startFromStep; i < manifestWithLimits.steps.length; i++) {
        const step = manifestWithLimits.steps[i];
        const stepStartedAt = Date.now();

        // Timeout global déjà déclenché : le résultat « failed » a été renvoyé,
        // on n'exécute plus d'étape (sinon actions externes fantômes).
        if (timedOut) {
          throw new Error("Timeout agent dépassé");
        }

        // P0-2 : annulation coopérative — on s'arrête proprement entre 2 étapes.
        if (context.runId && !effectiveContext.dryRun && (await isCancelRequested(context.runId))) {
          await markRunCancelled(context.runId);
          await logStepSkipped(
            context.runId, i, `step_${i}`, step.type,
            describeStep(step, i), "Annulé par l'utilisateur",
          ).catch(() => undefined);
          return {
            status: "cancelled",
            stepsCompleted,
            output: outputs,
            usage: usageLog,
            stepTrace,
            error: "Run annulé par l'utilisateur.",
          };
        }

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
              const branchVars = { ...vars };
              const branchOutputs: string[] = [];
              for (let s = 0; s < branch.steps.length; s++) {
                const subStep = branch.steps[s] as BaseAgentStep;
                const subIndex = i * 100 + branchIdx * 10 + s;
                const { content, usage: subUsage } = await executeStepWithRetry(
                  subStep,
                  branchVars,
                  ctxWithMemory,
                  manifestWithLimits.limits.max_tokens,
                  subIndex
                );
                branchOutputs.push(content);
                branchVars[`step_${subIndex}_output`] = content;
                if (subStep.outputKey) {
                  branchVars[subStep.outputKey] = content;
                }
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

          if (context.onProgress && !timedOut) {
            await context.onProgress(stepsCompleted, { ...outputs });
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

        // NOTE : l'ancienne « détection de boucle » (sorties identiques entre
        // étapes du même type) a été retirée : un manifeste est une liste
        // LINÉAIRE d'étapes exécutées une seule fois — aucune boucle possible —
        // et le garde échouait des runs légitimes (deux envois Slack renvoient
        // tous deux « ok », deux lectures d'une même feuille sont identiques).

        // Always set by index for backward compat
        vars[`step_${stepsCompleted}_output`] = content;
        outputs[`step_${stepsCompleted}`] = content;
        outputs[`step_${stepsCompleted}_output`] = content;

        const outputKey = step.outputKey;
        if (outputKey) {
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
          simulated:
            effectiveContext.dryRun === true &&
            (step.type === "action" || step.type === "tool") &&
            content.includes("[APERÇU"),
        });

        if (context.onProgress && !timedOut) {
          await context.onProgress(stepsCompleted, { ...outputs });
        }
      }

      outputs.result = vars[`step_${stepsCompleted - 1}_output`] ?? "";

      if (effectiveContext.runId && !effectiveContext.dryRun && effectiveContext.listingId !== "preview") {
        await persistRunDeliverables({
          runId: effectiveContext.runId,
          listingId: effectiveContext.listingId,
          userId: effectiveContext.userId,
          outputs,
          manifest: manifestWithLimits,
        }).catch((e) => console.warn("[orchestrator] deliverables save failed:", e));
      }

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
          outputPreview: message.slice(0, 800),
          errorMessage: message,
        });
      }
      return { status, stepsCompleted, output: outputs, error: message, usage: usageLog, stepTrace };
    }
  };

  const timeoutMs = manifestWithLimits.limits.timeout_ms ?? 60000;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Timeout agent dépassé"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(), timeout]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Timeout";
    return {
      status: "failed",
      stepsCompleted: latestStepsCompleted,
      output: latestOutputs,
      error: message,
    };
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}
