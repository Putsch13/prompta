import type { AgentStep, BaseAgentStep } from "@/lib/agent/schema";
import { AgentStepSchema } from "@/lib/agent/schema";
import type { GeneratedAgentPlan } from "@/lib/builder/generate-agent-plan";
import { validateAgentManifest, hasBlockingIssues } from "@/lib/builder/validate-agent";
import { connectorsForSteps } from "@/lib/connectors/registry";

export const COL_W = 260;
export const ROW_H = 130;

export type PlanNodeKind =
  | "llm"
  | "action"
  | "tool"
  | "code"
  | "condition"
  | "approval"
  | "trigger";

export interface PlanNode {
  id: string;
  kind: PlanNodeKind;
  name: string;
  description?: string;
  model?: string;
  prompt?: string;
  connectorId?: string;
  actionSlug?: string;
  toolId?: "web_search" | "http_fetch" | "file_read";
  expression?: string;
  outputKey: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
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
        model: defaultModel,
        prompt: step.description,
      };
    case "action":
      return {
        ...base,
        kind: "action",
        connectorId: step.connectorId,
        actionSlug: step.actionSlug,
      };
    case "tool": {
      const toolId =
        step.actionSlug === "web_search" ||
        step.actionSlug === "http_fetch" ||
        step.actionSlug === "file_read"
          ? step.actionSlug
          : "web_search";
      return { ...base, kind: "tool", toolId };
    }
    case "code":
      return { ...base, kind: "code", prompt: step.description };
    case "condition":
      return { ...base, kind: "condition", expression: step.description };
    case "approval":
      return { ...base, kind: "approval", prompt: step.description };
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
                : node.kind === "action"
                  ? "action"
                  : "llm",
    name: node.name,
    description: node.description ?? node.prompt ?? "",
    outputKey: node.outputKey,
    connectorId: node.connectorId,
    actionSlug: node.actionSlug ?? node.toolId,
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
        params: {},
        outputKey: node.outputKey,
      };
    case "tool":
      return {
        type: "tool",
        tool: node.toolId ?? "web_search",
        params: {},
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
    default:
      return { ...base, model: defaultModel, prompt: "" };
  }
}
