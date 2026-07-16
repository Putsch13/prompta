import type { AgentStep, BaseAgentStep } from "@/lib/agent/schema";
import { AgentStepSchema } from "@/lib/agent/schema";
import type { GeneratedAgentPlan } from "@/lib/builder/generate-agent-plan";
import { validateAgentManifest, hasBlockingIssues } from "@/lib/builder/validate-agent";
import { connectorsForSteps, getConnectorAction } from "@/lib/connectors/registry";
import { seedActionParamDefaults } from "@/lib/connectors/param-defaults";
import type { ParamMeta } from "@/lib/connectors/param-bindings";
import type { ActionInput } from "@/lib/connectors/types";

export { graphRunInputs, deriveRunInputsFromSteps, deriveManifestInputsFromSteps } from "@/lib/builder/run-inputs";
export const COL_W = 260;
export const ROW_H = 130;

export type PlanNodeKind =
  | "llm"
  | "action"
  | "tool"
  | "code"
  | "condition"
  | "approval"
  | "retrieve"
  | "browser"
  | "trigger";

export type DataSourceKind =
  | "file_upload"
  | "google_drive"
  | "notion"
  | "google_sheets"
  | "url"
  | "gmail"
  | "hubspot"
  | "custom_api";

export interface PlanNode {
  id: string;
  kind: PlanNodeKind;
  name: string;
  description?: string;
  model?: string;
  prompt?: string;
  connectorId?: string;
  actionSlug?: string;
  /** Libellé lisible du connecteur (catalogue Composio). */
  connectorLabel?: string;
  /** Snapshot du schéma d'entrées (outils Composio hors registre natif). */
  actionInputs?: ActionInput[];
  toolId?: "web_search" | "http_fetch" | "web_fetch" | "file_read";
  expression?: string;
  /** Étape retrieve (RAG) : source de connaissance + requête. */
  dataSource?: DataSourceKind;
  query?: string;
  outputKey: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  params?: Record<string, string>;
  paramMeta?: Record<string, ParamMeta>;
  /** Paramètres remplis par une IA (clé param → modèle + consigne). */
  aiFills?: Record<string, { model: string; prompt: string }>;
  /** true = env partagée (builder) pour tous les abonnés */
  sharedEnv?: boolean;
  /** Ressources épinglées par le builder (clé param → bool) */
  pinnedResources?: Record<string, boolean>;
  x?: number;
  y?: number;
}

export interface PlanEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface PlanGraph {
  entryId: string;
  nodes: PlanNode[];
  edges: PlanEdge[];
  meta?: {
    kind?: GeneratedAgentPlan["kind"];
    title?: string;
    description?: string;
    objective?: string;
    variables?: GeneratedAgentPlan["variables"];
    requiredConnectors?: GeneratedAgentPlan["requiredConnectors"];
    triggers?: GeneratedAgentPlan["triggers"];
    policies?: GeneratedAgentPlan["policies"];
    memory?: GeneratedAgentPlan["memory"];
  };
}

export interface PlanGraphValidationIssue {
  nodeId?: string;
  level: "error" | "warn";
  message: string;
}

function edgeId(source: string, target: string, label?: string): string {
  return `${source}->${target}${label ? `:${label}` : ""}`;
}

function planStepToNode(
  step: GeneratedAgentPlan["steps"][number],
  defaultModel: string,
): PlanNode {
  const base = {
    id: step.id,
    name: step.name,
    description: step.description,
    outputKey: step.outputKey,
    riskLevel: step.riskLevel,
    requiresApproval: step.requiresApproval,
  };

  switch (step.type) {
    case "llm":
      return {
        ...base,
        kind: "llm",
        model: step.model ?? defaultModel,
        prompt: step.description,
      };
    case "action": {
      const params = step.inputMapping
        ? Object.fromEntries(
            Object.entries(step.inputMapping).map(([k, v]) => [k, String(v)]),
          )
        : undefined;
      return {
        ...base,
        kind: "action",
        connectorId: step.connectorId,
        actionSlug: step.actionSlug,
        params,
      };
    }
    case "tool": {
      const toolId =
        step.actionSlug === "web_search" ||
        step.actionSlug === "http_fetch" ||
        step.actionSlug === "web_fetch" ||
        step.actionSlug === "file_read"
          ? step.actionSlug
          : "web_search";
      // Les params du tool (query, url…) DOIVENT survivre au graphe — sans
      // eux, web_search partait avec une query vide sur tout agent du wizard.
      const params = step.inputMapping
        ? Object.fromEntries(Object.entries(step.inputMapping).map(([k, v]) => [k, String(v)]))
        : undefined;
      return { ...base, kind: "tool", toolId, params };
    }
    case "code":
      return { ...base, kind: "code", prompt: step.description };
    case "condition":
      return { ...base, kind: "condition", expression: step.description };
    case "approval":
      return { ...base, kind: "approval", prompt: step.description };
    case "retrieve":
      return {
        ...base,
        kind: "retrieve",
        dataSource: step.dataSource ?? "file_upload",
        query: step.query ?? step.description,
      };
    default:
      return { ...base, kind: "llm", model: defaultModel, prompt: step.description };
  }
}

function nodeToPlanStep(node: PlanNode): GeneratedAgentPlan["steps"][number] {
  return {
    id: node.id,
    type:
      node.kind === "trigger"
        ? "llm"
        : node.kind === "tool"
          ? "tool"
          : node.kind === "code"
            ? "code"
            : node.kind === "condition"
              ? "condition"
              : node.kind === "approval"
                ? "approval"
                : node.kind === "retrieve"
                  ? "retrieve"
                  : node.kind === "action"
                    ? "action"
                    : "llm",
    name: node.name,
    description: node.description ?? node.prompt ?? "",
    model: node.model,
    outputKey: node.outputKey,
    connectorId: node.connectorId,
    actionSlug: node.actionSlug ?? node.toolId,
    inputMapping: node.params,
    dataSource: node.dataSource,
    query: node.query,
    riskLevel: node.riskLevel,
    requiresApproval: node.requiresApproval,
    next: undefined,
    branchLabel: undefined,
  };
}

/** Plan IA → graphe avec arêtes explicites ou chaînage séquentiel. */
export function planToGraph(plan: GeneratedAgentPlan, defaultModel = "gpt-5.4"): PlanGraph {
  const nodes = plan.steps.map((s) => planStepToNode(s, defaultModel));
  const edges: PlanEdge[] = [];
  const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
  const hasExplicitNext = plan.steps.some((s) => s.next && s.next.length > 0);

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const nextIds =
      step.next && step.next.length > 0
        ? step.next
        : !hasExplicitNext && i < plan.steps.length - 1
          ? [plan.steps[i + 1].id]
          : [];

    for (const targetId of nextIds) {
      const targetStep = stepMap.get(targetId);
      if (!targetStep) continue;
      const label = targetStep.branchLabel ?? step.branchLabel;
      edges.push({
        id: edgeId(step.id, targetId, label),
        source: step.id,
        target: targetId,
        label,
      });
    }
  }

  return {
    entryId: plan.entryStepId ?? plan.steps[0]?.id ?? "",
    nodes,
    edges,
    meta: {
      kind: plan.kind,
      title: plan.title,
      description: plan.description,
      objective: plan.objective,
      variables: plan.variables,
      requiredConnectors: plan.requiredConnectors,
      triggers: plan.triggers,
      policies: plan.policies,
      memory: plan.memory,
    },
  };
}

/** Graphe → plan IA (pour édition IA). */
export function graphToPlan(graph: PlanGraph): GeneratedAgentPlan {
  const outgoing = new Map<string, PlanEdge[]>();
  for (const e of graph.edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e);
    outgoing.set(e.source, list);
  }

  const steps: GeneratedAgentPlan["steps"][number][] = graph.nodes.map((node) => {
    const outs = outgoing.get(node.id) ?? [];
    const incoming = graph.edges.filter((e) => e.target === node.id);
    const step = nodeToPlanStep(node);
    if (incoming.length > 0 && incoming.some((e) => e.label)) {
      step.branchLabel = incoming.find((e) => e.label)?.label;
    }
    if (outs.length > 0) {
      step.next = outs.map((e) => e.target);
    } else {
      step.next = undefined;
    }
    return step;
  });

  return {
    kind: graph.meta?.kind ?? "agent",
    title: graph.meta?.title ?? "Agent",
    description: graph.meta?.description ?? "",
    objective: graph.meta?.objective ?? "",
    variables: graph.meta?.variables ?? [],
    requiredConnectors: graph.meta?.requiredConnectors ?? [],
    steps,
    entryStepId: graph.entryId,
    triggers: graph.meta?.triggers ?? [{ type: "manual" }],
    policies: graph.meta?.policies ?? {
      maxIterations: 1,
      requireHumanApprovalForExternalActions: true,
      memoryEnabled: false,
    },
    memory: graph.meta?.memory,
  };
}

function nodeToAgentStep(node: PlanNode, defaultModel: string): AgentStep {
  switch (node.kind) {
    case "llm":
      return {
        type: "llm",
        model: node.model ?? defaultModel,
        prompt: node.prompt ?? node.description ?? "",
        outputKey: node.outputKey,
      };
    case "action":
      return {
        type: "action",
        connector: node.connectorId ?? "",
        action: node.actionSlug ?? "",
        params: node.params ?? {},
        paramMeta: node.paramMeta,
        sharedEnv: node.sharedEnv,
        outputKey: node.outputKey,
        ...(node.actionInputs && node.actionInputs.length > 0
          ? { inputsSchema: node.actionInputs }
          : {}),
        ...(node.aiFills && Object.keys(node.aiFills).length > 0
          ? { aiFills: node.aiFills }
          : {}),
      };
    case "tool":
      return {
        type: "tool",
        tool: node.toolId ?? "web_search",
        params: node.params ?? {},
        outputKey: node.outputKey,
      };
    case "code":
      return {
        type: "code",
        language: "python",
        source: node.prompt ?? node.description ?? "",
        outputKey: node.outputKey,
      };
    case "condition":
      return {
        type: "condition",
        expression: node.expression ?? node.description ?? "true",
        outputKey: node.outputKey,
      };
    case "approval":
      return {
        type: "approval",
        label: node.name,
        payloadTemplate: node.description,
        outputKey: node.outputKey,
        expiresInMinutes: 60,
      };
    case "retrieve":
      return {
        type: "retrieve",
        source: node.dataSource ?? "file_upload",
        query: node.query ?? node.description ?? "",
        outputKey: node.outputKey,
        maxResults: 5,
      };
    case "browser":
      return {
        type: "browser",
        goal: node.prompt ?? node.description ?? "",
        outputKey: node.outputKey,
      };
    default:
      return {
        type: "llm",
        model: defaultModel,
        prompt: node.description ?? "",
        outputKey: node.outputKey,
      };
  }
}

function compileLinearChain(
  graph: PlanGraph,
  startId: string,
  defaultModel: string,
  stopAt: Set<string>,
): BaseAgentStep[] {
  const steps: BaseAgentStep[] = [];
  let current: string | null = startId;

  while (current && !stopAt.has(current)) {
    const node = graph.nodes.find((n) => n.id === current);
    if (!node) break;
    const outs = graph.edges.filter((e) => e.source === current);
    steps.push(nodeToAgentStep(node, defaultModel) as BaseAgentStep);
    if (outs.length !== 1) break;
    current = outs[0].target;
  }

  return steps;
}

function compileBranch(
  graph: PlanGraph,
  startId: string,
  defaultModel: string,
  stopAt: Set<string>,
): AgentStep[] {
  const steps: AgentStep[] = [];
  let current: string | null = startId;

  while (current && !stopAt.has(current)) {
    const node = graph.nodes.find((n) => n.id === current);
    if (!node) break;

    const outs = graph.edges.filter((e) => e.source === current);
    if (node.kind === "condition" && outs.length >= 1) {
      const trueEdges = outs.filter((e) => isTruthyLabel(e.label));
      const falseEdges = outs.filter((e) => isFalsyLabel(e.label));
      const other = outs.filter((e) => !isTruthyLabel(e.label) && !isFalsyLabel(e.label));
      steps.push({
        type: "condition",
        expression: node.expression ?? node.description ?? "true",
        outputKey: node.outputKey,
        ifTrueStepIds: trueEdges.length ? trueEdges.map((e) => e.target) : other.map((e) => e.target),
        ifFalseStepIds: falseEdges.map((e) => e.target),
      });
      break;
    }

    if (outs.length > 1) {
      steps.push(nodeToAgentStep(node, defaultModel));
      steps.push({
        type: "parallel",
        branches: outs.map((e) => ({
          steps: compileLinearChain(graph, e.target, defaultModel, stopAt),
          outputKey: `${node.outputKey}_${e.target}`,
        })),
        outputKey: `${node.outputKey}_parallel`,
      });
      break;
    }

    steps.push(nodeToAgentStep(node, defaultModel));
    current = outs[0]?.target ?? null;
  }

  return steps;
}

function isTruthyLabel(label?: string): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return l.includes("si ") || l.includes("oui") || l.includes("true") || l.includes("vrai");
}

function isFalsyLabel(label?: string): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return l.includes("sinon") || l.includes("non") || l.includes("false") || l.includes("faux");
}

/** Graphe → AgentStep[] pour buildManifest. */
export function graphToSteps(graph: PlanGraph, defaultModel = "gpt-5.4"): AgentStep[] {
  if (!graph.entryId || graph.nodes.length === 0) return [];
  return compileBranch(graph, graph.entryId, defaultModel, new Set());
}

export function graphConnectors(graph: PlanGraph): string[] {
  const steps = graphToSteps(graph);
  return connectorsForSteps(steps);
}

/** Layout topologique : colonne = profondeur, ligne = rang dans la colonne. */
export function layoutGraph(graph: PlanGraph): PlanGraph {
  const depths = new Map<string, number>();
  const queue: string[] = [graph.entryId];
  depths.set(graph.entryId, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depths.get(id) ?? 0;
    for (const e of graph.edges.filter((x) => x.source === id)) {
      const nd = d + 1;
      if (!depths.has(e.target) || (depths.get(e.target) ?? 0) < nd) {
        depths.set(e.target, nd);
        queue.push(e.target);
      }
    }
  }

  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  const colCounts = new Map<number, number>();

  const nodes = graph.nodes.map((n) => {
    let depth = depths.get(n.id);
    if (depth === undefined) {
      depth = maxDepth + 1;
    }
    const row = colCounts.get(depth) ?? 0;
    colCounts.set(depth, row + 1);
    return {
      ...n,
      x: depth * COL_W,
      y: row * ROW_H,
    };
  });

  return { ...graph, nodes };
}

export function getNode(graph: PlanGraph, id: string): PlanNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function updateNode(graph: PlanGraph, id: string, patch: Partial<PlanNode>): PlanGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch, id: n.id } : n)),
  };
}

export function addNode(
  graph: PlanGraph,
  node: PlanNode,
  afterId?: string,
): PlanGraph {
  const nodes = [...graph.nodes, node];
  let edges = [...graph.edges];
  if (afterId) {
    const out = edges.filter((e) => e.source === afterId);
    if (out.length === 0) {
      edges.push({ id: edgeId(afterId, node.id), source: afterId, target: node.id });
    } else {
      const first = out[0];
      edges = edges.filter((e) => !(e.source === afterId && e.target === first.target));
      edges.push({ id: edgeId(afterId, node.id), source: afterId, target: node.id });
      edges.push({ id: edgeId(node.id, first.target), source: node.id, target: first.target });
    }
  }
  const entryId = graph.nodes.length === 0 ? node.id : graph.entryId;
  return layoutGraph({ ...graph, nodes, edges, entryId });
}

export function removeNode(graph: PlanGraph, id: string): PlanGraph {
  const incoming = graph.edges.filter((e) => e.target === id);
  const outgoing = graph.edges.filter((e) => e.source === id);
  const edges = graph.edges.filter((e) => e.source !== id && e.target !== id);
  for (const inc of incoming) {
    for (const out of outgoing) {
      edges.push({
        id: edgeId(inc.source, out.target, inc.label),
        source: inc.source,
        target: out.target,
        label: inc.label,
      });
    }
  }
  const nodes = graph.nodes.filter((n) => n.id !== id);
  const entryId = graph.entryId === id ? (nodes[0]?.id ?? "") : graph.entryId;
  return layoutGraph({ ...graph, nodes, edges, entryId });
}

export function connect(
  graph: PlanGraph,
  source: string,
  target: string,
  label?: string,
): PlanGraph {
  const exists = graph.edges.some(
    (e) => e.source === source && e.target === target && e.label === label,
  );
  if (exists) return graph;
  return layoutGraph({
    ...graph,
    edges: [...graph.edges, { id: edgeId(source, target, label), source, target, label }],
  });
}

export function disconnect(graph: PlanGraph, source: string, target: string): PlanGraph {
  return layoutGraph({
    ...graph,
    edges: graph.edges.filter((e) => !(e.source === source && e.target === target)),
  });
}

export function insertBetween(
  graph: PlanGraph,
  source: string,
  target: string,
  node: PlanNode,
): PlanGraph {
  const edges = graph.edges.filter((e) => !(e.source === source && e.target === target));
  edges.push({ id: edgeId(source, node.id), source, target: node.id });
  edges.push({ id: edgeId(node.id, target), source: node.id, target });
  return layoutGraph({ ...graph, nodes: [...graph.nodes, node], edges });
}

export function validatePlanGraph(
  graph: PlanGraph,
  defaultModel = "gpt-5.4",
): PlanGraphValidationIssue[] {
  const issues: PlanGraphValidationIssue[] = [];

  if (!graph.entryId) {
    issues.push({ level: "error", message: "Point d'entrée du graphe manquant." });
    return issues;
  }

  const reachable = new Set<string>();
  const stack = [graph.entryId];
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const e of graph.edges.filter((x) => x.source === id)) {
      stack.push(e.target);
    }
  }

  for (const n of graph.nodes) {
    // Un outil sans sa donnée d'entrée = échec garanti au run (web_search
    // « Missing query parameter ») : bloquant dès le build.
    if (n.kind === "tool") {
      const needed = n.toolId === "http_fetch" || n.toolId === "web_fetch" ? "url" : n.toolId === "file_read" ? "path" : "query";
      const toolVal = n.params?.[needed] ?? n.params?.query ?? "";
      if (!String(toolVal).trim()) {
        issues.push({
          nodeId: n.id,
          level: "error",
          message: `« ${n.name} » : renseigne ${needed === "url" ? "l'URL à lire" : needed === "path" ? "le fichier à lire" : "la requête de recherche"} (params.${needed}).`,
        });
      }
    }

    if (!reachable.has(n.id)) {
      issues.push({
        nodeId: n.id,
        level: "warn",
        message: `Nœud « ${n.name} » inaccessible depuis l'entrée.`,
      });
    }
    if (n.kind === "llm" && !(n.prompt ?? n.description)?.trim()) {
      issues.push({ nodeId: n.id, level: "error", message: "Prompt LLM vide." });
    }
    if (n.kind === "action" && (!n.connectorId || !n.actionSlug)) {
      issues.push({ nodeId: n.id, level: "error", message: "Action sans connecteur ou slug." });
    }
  }

  const visited = new Set<string>();
  function dfs(id: string, path: Set<string>): void {
    if (path.has(id)) {
      issues.push({ nodeId: id, level: "error", message: "Cycle détecté dans le graphe." });
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    const next = new Set(path);
    next.add(id);
    for (const e of graph.edges.filter((x) => x.source === id)) {
      dfs(e.target, next);
    }
  }
  dfs(graph.entryId, new Set());

  const steps = graphToSteps(graph, defaultModel);
  for (const step of steps) {
    const parsed = AgentStepSchema.safeParse(step);
    if (!parsed.success) {
      issues.push({ level: "error", message: "Étape invalide après compilation du graphe." });
    }
  }

  const manifestIssues = validateAgentManifest(steps, {
    connectors: graphConnectors(graph),
  });
  for (const mi of manifestIssues.filter((i) => i.severity === "error")) {
    issues.push({ level: "error", message: mi.message });
  }

  if (hasBlockingIssues(manifestIssues) && issues.every((i) => i.level !== "error")) {
    issues.push({ level: "error", message: manifestIssues.find((i) => i.severity === "error")?.message ?? "Validation échouée" });
  }

  return issues;
}

export function hasBlockingGraphIssues(issues: PlanGraphValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

export function moveNode(graph: PlanGraph, id: string, x: number, y: number): PlanGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
  };
}

function nodeTextFields(node: PlanNode): string[] {
  const texts = [node.prompt, node.description, node.expression, node.query].filter(Boolean) as string[];
  if (node.params) texts.push(...Object.values(node.params));
  return texts;
}

const OUTPUT_REF_RE = /\{\{([\w.]+)\}\}/g;

function referencedOutputKeys(node: PlanNode, knownKeys: Set<string>): Set<string> {
  const refs = new Set<string>();
  for (const text of nodeTextFields(node)) {
    const re = new RegExp(OUTPUT_REF_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const root = m[1].split(".")[0];
      if (knownKeys.has(root)) refs.add(root);
    }
  }
  return refs;
}

function pathExists(edges: PlanEdge[], from: string, to: string): boolean {
  const queue = [from];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges.filter((x) => x.source === id)) {
      queue.push(e.target);
    }
  }
  return false;
}

function reachableFrom(entryId: string, edges: PlanEdge[]): Set<string> {
  const reachable = new Set<string>();
  const stack = [entryId];
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const e of edges.filter((x) => x.source === id)) {
      stack.push(e.target);
    }
  }
  return reachable;
}

function findChainTail(entryId: string, edges: PlanEdge[], nodes: PlanNode[]): string {
  let current = entryId;
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (;;) {
    const outs = edges.filter((e) => e.source === current);
    if (outs.length !== 1) break;
    const next = outs[0].target;
    if (!nodeIds.has(next)) break;
    current = next;
  }
  return current;
}

function countIncoming(edges: PlanEdge[], nodes: PlanNode[]): Map<string, number> {
  const incoming = new Map<string, number>();
  for (const n of nodes) incoming.set(n.id, 0);
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }
  return incoming;
}

function autoBindActionParams(graph: PlanGraph): PlanGraph {
  const variables = [...(graph.meta?.variables ?? [])];
  const varKeys = new Set(variables.map((v) => v.key));

  const nodes = graph.nodes.map((node) => {
    if (node.kind !== "action" || !node.connectorId || !node.actionSlug) return node;
    const action = getConnectorAction(node.connectorId, node.actionSlug);
    if (!action) return node;

    const params = { ...(node.params ?? {}), ...seedActionParamDefaults(node.connectorId, node.actionSlug) };
    const paramMeta = { ...(node.paramMeta ?? {}) };
    for (const input of action.inputs) {
      if (input.defaultValue !== undefined && params[input.key] === input.defaultValue) {
        paramMeta[input.key] = {
          ...paramMeta[input.key],
          scope: paramMeta[input.key]?.scope ?? "builder_test",
        };
      }
    }
    for (const input of action.inputs.filter((i) => i.required)) {
      // Préserver TOUTE valeur déjà fixée (littéral builder/copilote, binding, défaut).
      // Sinon on écraserait une valeur que le copilote vient de renseigner.
      const existing = params[input.key];
      if (existing !== undefined && String(existing).trim() !== "") continue;
      if (input.kind === "resource" || input.kind === "identity" || input.resourceType) continue;
      const varKey = `${node.connectorId}_${input.key}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
      if (!varKeys.has(varKey)) {
        variables.push({
          key: varKey,
          label: input.label,
          type: input.type === "textarea" ? "text" : "text",
          required: true,
        });
        varKeys.add(varKey);
      }
      params[input.key] = `{{${varKey}}}`;
    }
    return { ...node, params, paramMeta };
  });

  return {
    ...graph,
    nodes,
    meta: { ...graph.meta, variables },
  };
}

/** Normalise le graphe : auto-bindings, dépendances de données, reconnexion orphelins. */
export function normalizeGraph(graph: PlanGraph): PlanGraph {
  const g = autoBindActionParams(graph);
  const nodeIds = new Set(g.nodes.map((n) => n.id));
  const outputKeyToNode = new Map(g.nodes.map((n) => [n.outputKey, n.id]));
  const knownKeys = new Set(g.nodes.map((n) => n.outputKey));

  let edges = g.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const edgeKeys = new Set<string>();
  edges = edges.filter((e) => {
    const k = `${e.source}->${e.target}`;
    if (edgeKeys.has(k)) return false;
    edgeKeys.add(k);
    return true;
  });

  for (const consumer of g.nodes) {
    const refs = referencedOutputKeys(consumer, knownKeys);
    for (const key of Array.from(refs)) {
      const producerId = outputKeyToNode.get(key);
      if (!producerId || producerId === consumer.id) continue;
      if (!pathExists(edges, producerId, consumer.id)) {
        edges.push({
          id: edgeId(producerId, consumer.id),
          source: producerId,
          target: consumer.id,
        });
        edgeKeys.add(`${producerId}->${consumer.id}`);
      }
    }
  }

  let incoming = countIncoming(edges, g.nodes);
  let entryCandidates = g.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  let entryId =
    entryCandidates.length === 1
      ? entryCandidates[0].id
      : g.entryId && entryCandidates.some((c) => c.id === g.entryId)
        ? g.entryId
        : entryCandidates[0]?.id ?? g.nodes[0]?.id ?? "";

  if (entryId) {
    let reachable = reachableFrom(entryId, edges);
    for (const n of g.nodes) {
      if (reachable.has(n.id)) continue;
      const refs = referencedOutputKeys(n, knownKeys);
      let attached = false;
      for (const key of Array.from(refs)) {
        const prod = outputKeyToNode.get(key);
        if (prod && prod !== n.id) {
          const k = `${prod}->${n.id}`;
          if (!edgeKeys.has(k)) {
            edges.push({ id: edgeId(prod, n.id), source: prod, target: n.id });
            edgeKeys.add(k);
          }
          attached = true;
          break;
        }
      }
      if (!attached) {
        const tail = findChainTail(entryId, edges, g.nodes);
        if (tail && tail !== n.id) {
          const k = `${tail}->${n.id}`;
          if (!edgeKeys.has(k)) {
            edges.push({ id: edgeId(tail, n.id), source: tail, target: n.id });
            edgeKeys.add(k);
          }
        }
      }
      reachable = reachableFrom(entryId, edges);
    }
  }

  incoming = countIncoming(edges, g.nodes);
  entryCandidates = g.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  if (entryCandidates.length === 1) {
    entryId = entryCandidates[0].id;
  } else if (entryCandidates.length > 1 && entryId) {
    const ordered = topologicalSortByDeps(g.nodes, edges);
    const first = ordered.find((id) => entryCandidates.some((c) => c.id === id));
    if (first) entryId = first;
  }

  return { ...g, edges, entryId };
}

function topologicalSortByDeps(nodes: PlanNode[], edges: PlanEdge[]): string[] {
  const ids = nodes.map((n) => n.id);
  const knownKeys = new Set(nodes.map((n) => n.outputKey));
  const keyToId = new Map(nodes.map((n) => [n.outputKey, n.id]));
  const deps = new Map<string, Set<string>>();
  for (const id of ids) deps.set(id, new Set());

  for (const node of nodes) {
    for (const key of Array.from(referencedOutputKeys(node, knownKeys))) {
      const prod = keyToId.get(key);
      if (prod && prod !== node.id) deps.get(node.id)!.add(prod);
    }
    for (const e of edges.filter((x) => x.target === node.id)) {
      deps.get(node.id)!.add(e.source);
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    for (const d of Array.from(deps.get(id) ?? [])) visit(d);
    visiting.delete(id);
    visited.add(id);
    sorted.push(id);
  }

  for (const id of ids) visit(id);
  return sorted;
}

export function graphHasRepairableIssues(graph: PlanGraph): boolean {
  if (!graph.entryId) return false;
  const reachable = reachableFrom(graph.entryId, graph.edges);
  return graph.nodes.some((n) => !reachable.has(n.id));
}

export function createDefaultNode(
  kind: PlanNodeKind,
  index: number,
  defaultModel: string,
): PlanNode {
  const id = `step_${Date.now()}_${index}`;
  const base = {
    id,
    kind,
    name: `Nouvelle étape ${index + 1}`,
    outputKey: `step_${index}_output`,
    riskLevel: "low" as const,
    requiresApproval: false,
  };
  switch (kind) {
    case "llm":
      return { ...base, model: defaultModel, prompt: "" };
    case "action":
      return { ...base, connectorId: "", actionSlug: "", riskLevel: "medium" };
    case "tool":
      return { ...base, toolId: "web_search" };
    case "code":
      return { ...base, prompt: "# Votre code\nresult = {}\n" };
    case "condition":
      return { ...base, expression: "true" };
    case "approval":
      return { ...base, requiresApproval: true, riskLevel: "medium" };
    case "retrieve":
      return { ...base, dataSource: "file_upload", query: "" };
    default:
      return { ...base, model: defaultModel, prompt: "" };
  }
}

// ─── Manifeste → graphe (édition d'un agent existant) ───────────────────────

/** Nœud reconstruit depuis un AgentStep de manifeste, en préservant tout
 *  (params, paramMeta, aiFills, inputsSchema, sharedEnv). */
function agentStepToNode(step: BaseAgentStep, id: string, index: number): PlanNode {
  const base = {
    id,
    outputKey: step.outputKey ?? `step_${index}_output`,
    riskLevel: "low" as const,
    requiresApproval: false,
  };
  switch (step.type) {
    case "llm":
      return {
        ...base,
        kind: "llm",
        name: "Étape IA",
        description: step.prompt.slice(0, 140),
        model: step.model,
        prompt: step.prompt,
      };
    case "tool":
      return {
        ...base,
        kind: "tool",
        name: `Outil ${step.tool}`,
        toolId: step.tool,
        params: step.params,
      };
    case "action": {
      const native = step.connector ? getConnectorAction(step.connector, step.action) : undefined;
      return {
        ...base,
        kind: "action",
        name: native?.label ?? step.action ?? "Action",
        connectorId: step.connector,
        actionSlug: step.action,
        params: step.params,
        paramMeta: step.paramMeta,
        aiFills: step.aiFills,
        sharedEnv: step.sharedEnv,
        actionInputs: step.inputsSchema as ActionInput[] | undefined,
        riskLevel: "medium",
      };
    }
    case "code":
      return { ...base, kind: "code", name: "Code", prompt: step.source };
    case "condition":
      return { ...base, kind: "condition", name: "Condition", expression: step.expression };
    case "approval":
      return {
        ...base,
        kind: "approval",
        name: step.label ?? "Validation humaine",
        prompt: step.payloadTemplate,
        requiresApproval: true,
        riskLevel: "medium",
      };
    case "retrieve":
      return {
        ...base,
        kind: "retrieve",
        name: "Recherche documentaire",
        dataSource: step.source,
        query: step.query,
      };
    case "browser":
      return {
        ...base,
        kind: "browser",
        name: "Pilotage du navigateur",
        description: step.goal.slice(0, 140),
        prompt: step.goal,
        riskLevel: "medium",
      };
  }
}

/**
 * Steps d'un manifeste → graphe éditable (inverse de graphToSteps).
 * Les étapes parallèles sont dépliées en branches divergentes (les fins de
 * branches se raccordent à l'étape suivante s'il y en a une).
 */
export function stepsToGraph(steps: AgentStep[], meta?: PlanGraph["meta"]): PlanGraph {
  const nodes: PlanNode[] = [];
  const edges: PlanEdge[] = [];
  let prevIds: string[] = [];

  const linkTo = (targetId: string) => {
    for (const p of prevIds) {
      edges.push({ id: edgeId(p, targetId), source: p, target: targetId });
    }
  };

  steps.forEach((step, i) => {
    if ("branches" in step && step.type === "parallel") {
      const ends: string[] = [];
      step.branches.forEach((branch, b) => {
        let branchPrev = prevIds;
        branch.steps.forEach((bs, k) => {
          const id = `s${i}_${b}_${k}`;
          nodes.push(agentStepToNode(bs, id, i * 100 + b * 10 + k));
          for (const p of branchPrev) {
            edges.push({ id: edgeId(p, id), source: p, target: id });
          }
          branchPrev = [id];
        });
        if (branch.steps.length > 0) ends.push(branchPrev[branchPrev.length - 1]);
      });
      if (ends.length > 0) prevIds = ends;
      return;
    }
    const id = `s${i}`;
    nodes.push(agentStepToNode(step as BaseAgentStep, id, i));
    linkTo(id);
    prevIds = [id];
  });

  return layoutGraph({ entryId: nodes[0]?.id ?? "", nodes, edges, meta });
}
