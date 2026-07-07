"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  Wand2,
  PenLine,
  Boxes,
  Play,
  Rocket,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { EnvFieldInputs } from "@/components/builder/EnvFieldInputs";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { buildManifest } from "@/lib/builder/manifest";
import type { ProvisioningMode } from "@/lib/builder/provisioning";
import { deriveGraphEnv } from "@/lib/builder/derive-graph-env";
import { deriveClientRequirements } from "@/lib/builder/client-requirements";
import { ClientRequirementsPanel } from "@/components/builder/canvas/ClientRequirementsPanel";
import { AgentRunExperience } from "@/components/run/AgentRunExperience";
import { ConnectionsMasque } from "@/components/run/ConnectionsMasque";
import { PlanQuotaCard } from "@/components/builder/PlanQuotaCard";
import { plannedStepLabels } from "@/lib/agent/step-label";
import type { ApprovalDetails } from "@/components/run/HumanApprovalModal";
import { AgentFlowPreview } from "@/components/builder/AgentFlowPreview";
import { AgentCanvas } from "@/components/builder/canvas/AgentCanvas";
import { GuidedBuilder } from "@/components/builder/canvas/GuidedBuilder";
import { enrichComposioActions } from "@/lib/builder/enrich-composio-actions";
import {
  graphRunInputs,
  graphConnectors,
  graphToSteps,
  layoutGraph,
  moveNode,
  normalizeGraph,
  planToGraph,
  stepsToGraph,
  validatePlanGraph,
  hasBlockingGraphIssues,
  type PlanGraph,
} from "@/lib/builder/plan-graph";
import type { StepTraceEntry } from "@/lib/agent/orchestrator";
import { injectHumanApprovals } from "@/lib/connectors/approvals-inject";
import { dedupeConnectors } from "@/lib/connectors/resolve-id";
import { getBuilderModels } from "@/lib/catalogs";
import {
  validateAgentSteps,
} from "@/lib/builder/variables";
import { validateAgentManifest, hasBlockingIssues } from "@/lib/builder/validate-agent";
import type { GeneratedAgentPlan } from "@/lib/builder/generate-agent-plan";
import type { AgentStep, AgentKind, ExecutionMode } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";

const STEP_META = [
  { label: "Décrire", icon: PenLine, hint: "Ton objectif en une phrase" },
  { label: "Co-construire", icon: Boxes, hint: "Guidé par l'IA, étape par étape" },
  { label: "Tester", icon: Play, hint: "Lance et vérifie en réel" },
  { label: "Produire", icon: Rocket, hint: "Héberge ton agent en production" },
] as const;

const STEPS = STEP_META.map((s) => s.label);

interface Props {
  categories: { id: string; name: string; slug: string }[];
  /** Objectif prérempli (onboarding : /dashboard/new?objectif=…). */
  initialObjective?: string;
  /** Mode édition : recharge un agent existant dans le builder (arbo + copilote).
   *  La sauvegarde crée une nouvelle version via /api/listings/update. */
  edit?: {
    listingId: string;
    title: string;
    description: string;
    status: string | null;
    promptBody: string;
    manifest: import("@/lib/agent/schema").AgentManifest;
  };
}

interface EnvField {
  key: string;
  label: string;
  required: boolean;
  type?: "text" | "textarea" | "number" | "file" | "list";
  help?: string;
  connectorId?: string;
  paramKey?: string;
}

export function CreateWizard({ categories: _categories, edit, initialObjective }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(edit ? 1 : 0);
  const [saving, setSaving] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  // Aperçu opt-in : false = exécution réelle (défaut), true = simulation sans appel
  const [testDryRun, setTestDryRun] = useState(false);
  const [includeHumanApprovals, setIncludeHumanApprovals] = useState(false);
  const [flowPreviewConfirmed, setFlowPreviewConfirmed] = useState(false);
  const [showTestImmersive, setShowTestImmersive] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    output?: Record<string, string>;
    error?: string;
    stepsCompleted?: number;
    stepTrace?: StepTraceEntry[];
    runId?: string;
    approvalId?: string;
  } | null>(null);
  const [testApprovalDetails, setTestApprovalDetails] = useState<ApprovalDetails | null>(null);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);
  const [disconnectedConnectors, setDisconnectedConnectors] = useState<string[]>([]);

  const [objectiveText, setObjectiveText] = useState(initialObjective ?? "");
  const [builderModel, setBuilderModel] = useState("gpt-5.4-mini");
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedAgentPlan | null>(null);
  // Mode édition : le graphe démarre sur l'arborescence reconstruite du manifeste.
  const [planGraph, setPlanGraph] = useState<PlanGraph | null>(() =>
    edit
      ? stepsToGraph(edit.manifest.steps, {
          kind: edit.manifest.kind,
          title: edit.title,
          description: edit.description,
        })
      : null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphIssues, setGraphIssues] = useState<ReturnType<typeof validatePlanGraph>>([]);
  const graphHistoryRef = useRef<{ past: PlanGraph[]; future: PlanGraph[] }>({ past: [], future: [] });

  const [form, setForm] = useState({
    type: (edit ? edit.manifest.kind ?? "agent" : "prompt") as "prompt" | "agent" | "workflow",
    kind: edit?.manifest.kind as AgentKind | undefined,
    executionMode: edit?.manifest.executionMode as ExecutionMode | undefined,
    title: edit?.title ?? "",
    categoryId: "",
    description: edit?.description ?? "",
    models: ["gpt-5.4"],
    techStack: [] as string[],
    integrations: [] as string[],
    tags: [] as string[],
    promptBody: edit?.promptBody ?? "",
    agentSteps: (edit?.manifest.steps ?? []) as AgentStep[],
    envFields: [] as EnvField[],
    requiredSecrets: [] as KeyProvider[],
    requiredConnectors: [] as string[],
    dependencies: "",
    setupTime: "5 min",
    priceCents: 990,
    pricingMode: "free" as "free" | "one_time" | "subscription",
    subscriptionPriceCents: 990,
    provisioningMode: "manual" as ProvisioningMode,
    hostingEnabled: false,
    hostingFeeCents: 490,
  });

  // ── Brouillon persistant ─────────────────────────────────────────────
  // La création en cours survit à une navigation (OAuth, connexions…) ou à
  // un rechargement : état sauvegardé en localStorage, restauré au montage.
  const DRAFT_KEY = edit ? `prompta_wizard_edit_${edit.listingId}` : "prompta_wizard_draft_v1";
  const draftRestoredRef = useRef(false);
  const [draftNote, setDraftNote] = useState(false);

  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        objectiveText?: string;
        planGraph?: PlanGraph | null;
        generatedPlan?: GeneratedAgentPlan | null;
        form?: typeof form;
        step?: number;
        savedAt?: number;
      };
      // Brouillon de plus de 48h ou vide : on l'ignore.
      const fresh = draft.savedAt && Date.now() - draft.savedAt < 48 * 3600_000;
      if (!fresh || (!draft.planGraph && !draft.objectiveText?.trim())) return;
      if (draft.objectiveText) setObjectiveText(draft.objectiveText);
      if (draft.generatedPlan) setGeneratedPlan(draft.generatedPlan);
      if (draft.form) setForm((prev) => ({ ...prev, ...draft.form }));
      if (draft.planGraph) setPlanGraph(draft.planGraph);
      if (typeof draft.step === "number" && draft.planGraph) setStep(draft.step);
      setDraftNote(true);
    } catch {
      /* brouillon illisible — on repart proprement */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftRestoredRef.current) return;
    if (!planGraph && !objectiveText.trim()) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ objectiveText, planGraph, generatedPlan, form, step, savedAt: Date.now() }),
        );
      } catch {
        /* quota localStorage — tant pis */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [objectiveText, planGraph, generatedPlan, form, step]);

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* noop */
    }
  }

  function discardDraft() {
    clearDraft();
    window.location.reload();
  }

  function commitPlanGraph(next: PlanGraph | null, pushHistory = true) {
    if (pushHistory && planGraph && next) {
      graphHistoryRef.current.past.push(planGraph);
      if (graphHistoryRef.current.past.length > 40) {
        graphHistoryRef.current.past.shift();
      }
      graphHistoryRef.current.future = [];
    }
    setPlanGraph(next);
  }

  function applyPlan(plan: GeneratedAgentPlan) {
    setGeneratedPlan(plan);
    const graph = layoutGraph(normalizeGraph(planToGraph(plan, form.models[0])));
    commitPlanGraph(graph, false);
    graphHistoryRef.current = { past: [], future: [] };
    // Résout les actions Composio-only inventées → vrais outils + schéma réel.
    // Garde anti-écrasement : si l'arbo a déjà changé (copilote, édition) quand
    // l'enrichissement se termine, on ignore ce résultat périmé.
    void enrichComposioActions(graph).then((enriched) => {
      if (enriched === graph) return;
      setPlanGraph((current) =>
        current === graph ? layoutGraph(normalizeGraph(enriched)) : current,
      );
    });

    const connectorIds = plan.requiredConnectors.map((c) => c.connectorId);
    setForm((prev) => ({
      ...prev,
      type: plan.kind,
      kind: plan.kind,
      title: plan.title,
      description: plan.description,
      envFields: graphRunInputs(graph, prev.models[0]),
      requiredConnectors: connectorIds,
    }));
    setSelectedNodeId(null);
    setStep(1);
  }

  useEffect(() => {
    if (!planGraph) return;
    const steps = graphToSteps(planGraph, form.models[0]);
    const connectors = graphConnectors(planGraph);
    setForm((prev) => ({
      ...prev,
      agentSteps: steps,
      requiredConnectors: connectors.length > 0 ? connectors : prev.requiredConnectors,
      envFields: graphRunInputs(planGraph, form.models[0]),
      ...(planGraph.meta?.title ? { title: planGraph.meta.title } : {}),
      ...(planGraph.meta?.description ? { description: planGraph.meta.description } : {}),
      ...(planGraph.meta?.kind ? { type: planGraph.meta.kind, kind: planGraph.meta.kind } : {}),
    }));
    setGraphIssues(validatePlanGraph(planGraph, form.models[0]));
    const derived = deriveGraphEnv(planGraph, form.models[0]);
    setForm((prev) => ({
      ...prev,
      requiredConnectors: derived.requiredConnectors,
      requiredSecrets: derived.requiredSecrets,
    }));
  }, [planGraph, form.models]);

  useEffect(() => {
    if (!planGraph) return;
    const connectors = deriveGraphEnv(planGraph, form.models[0]).requiredConnectors;
    let cancelled = false;
    (async () => {
      const disconnected: string[] = [];
      for (const id of connectors) {
        const res = await fetch(`/api/connectors/${id}/status`);
        const data = await res.json();
        if (!data.connected) disconnected.push(id);
      }
      if (!cancelled) setDisconnectedConnectors(disconnected);
    })();
    return () => {
      cancelled = true;
    };
  }, [planGraph, form.models]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        const { past, future } = graphHistoryRef.current;
        if (!past.length || !planGraph) return;
        e.preventDefault();
        const prev = past.pop()!;
        future.push(planGraph);
        setPlanGraph(prev);
      }
      if (e.key === "z" && e.shiftKey) {
        const { past, future } = graphHistoryRef.current;
        if (!future.length || !planGraph) return;
        e.preventDefault();
        past.push(planGraph);
        const next = future.pop()!;
        setPlanGraph(next);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [planGraph]);

  async function handleGeneratePlan() {
    if (objectiveText.trim().length < 10) {
      setPlanError("Décrivez votre objectif en quelques phrases (min. 10 caractères).");
      return;
    }
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/builder/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: objectiveText.trim(), modelId: builderModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Erreur de génération");
        return;
      }
      applyPlan(data.plan);
    } catch {
      setPlanError("Erreur réseau. Réessayez.");
    } finally {
      setPlanLoading(false);
    }
  }

  useEffect(() => {
  }, [step]);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateCurrentManifest(): string | null {
    if (form.type === "prompt") return null;
    const manifest = buildCurrentManifest();
    const legacyIssues = validateAgentSteps(manifest.steps);
    if (legacyIssues.length > 0) return legacyIssues[0].message;
    const issues = validateAgentManifest(manifest.steps, { connectors: manifest.connectors });
    const blocking = issues.find((i) => i.severity === "error");
    return blocking?.message ?? null;
  }

  function canContinueFromStep(current: number): boolean {
    setStepError(null);
    if (current === 0 && !planGraph) {
      setStepError("Générez d'abord un plan à partir de votre description.");
      return false;
    }
    if (current === 1 && planGraph && hasBlockingGraphIssues(graphIssues)) {
      const first = graphIssues.find((i) => i.level === "error");
      setStepError(first?.message ?? "Corrigez les erreurs du graphe avant de continuer.");
      return false;
    }
    if (current === 1 && form.type !== "prompt") {
      const err = validateCurrentManifest();
      if (err) {
        setStepError(err);
        return false;
      }
    }
    return true;
  }

  const clientRequirements = deriveClientRequirements(
    planGraph,
    form.models[0],
  );

  const hasSharedNodes =
    planGraph?.nodes.some((n) => n.kind === "action" && n.sharedEnv) ?? false;

  function buildCurrentManifest() {
    let steps = form.agentSteps;
    if (includeHumanApprovals && form.type !== "prompt") {
      steps = injectHumanApprovals(steps);
    }
    return buildManifest({
      type: form.type,
      kind: form.kind,
      executionMode: form.executionMode,
      promptBody: form.promptBody,
      steps,
      requiredSecrets: form.requiredSecrets,
      requiredConnectors: form.requiredConnectors,
      defaultModel: form.models[0],
      provisioningMode: form.provisioningMode,
    });
  }

  const previewSteps = includeHumanApprovals && form.type !== "prompt"
    ? injectHumanApprovals(form.agentSteps)
    : form.agentSteps;

  async function handleSubmit(publish: boolean) {
    setSaving(true);
    const manifest = buildCurrentManifest();
    const validationErr = validateCurrentManifest();
    if (validationErr) {
      setStepError(validationErr);
      setSaving(false);
      return;
    }
    if (publish && hasBlockingIssues(validateAgentManifest(manifest.steps, { connectors: manifest.connectors }))) {
      setStepError("Corrigez les erreurs du manifeste avant publication.");
      setSaving(false);
      return;
    }

    // Mode édition : nouvelle version via l'API update (versionnage + quota).
    if (edit) {
      const res = await fetch("/api/listings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: edit.listingId,
          title: form.title,
          description: form.description,
          promptBody: form.promptBody,
          manifest,
          setupTime: form.setupTime,
          // Republie si l'agent était déjà en production (le quota ne se reconsomme pas).
          publish: publish || edit.status === "published",
        }),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) {
        if (data.error === "plan_limit") {
          alert(`${data.message}\n\nTes modifications sont enregistrées en brouillon.`);
          clearDraft();
          router.push("/pricing");
          return;
        }
        setStepError(data.message || data.error || "Enregistrement impossible");
        return;
      }
      clearDraft();
      router.push("/dashboard/contenus");
      router.refresh();
      return;
    }

    const res = await fetch("/api/listings/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        type: form.type,
        categoryId: form.categoryId || null,
        description: form.description,
        models: form.models,
        techStack: form.techStack,
        integrations: form.integrations,
        tags: form.tags,
        priceCents: 0,
        pricingMode: "free",
        subscriptionPriceCents: 0,
        hostingFeeCents: 0,
        provisioningMode: form.provisioningMode,
        promptBody: form.promptBody,
        manifest,
        setupTime: form.setupTime,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(data.message || data.error || "Erreur");
      return;
    }

    if (publish && data.id) {
      const pubRes = await fetch("/api/listings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: data.id, publish: true }),
      });
      if (!pubRes.ok) {
        const pubData = await pubRes.json().catch(() => ({}));
        if (pubData.error === "plan_limit") {
          // Quota du plan atteint : l'agent est sauvegardé en brouillon.
          alert(`${pubData.message}\n\nTon agent est enregistré en brouillon — il sera publiable dès l'upgrade.`);
          clearDraft();
          router.push("/pricing");
          return;
        }
        alert(pubData.message || pubData.error || "Publication impossible");
      }
    }
    clearDraft();
    router.push("/dashboard");
  }

  useEffect(() => {
    if (testResult?.status !== "awaiting_approval" || !testResult.runId) {
      setTestApprovalDetails(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/run/agent/${testResult.runId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.approval) return;
        setTestApprovalDetails({
          id: data.approval.id,
          label: data.approval.label,
          preview: data.approval.preview,
          stepIndex: data.approval.step_index,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [testResult?.status, testResult?.runId]);

  async function pollTestRun(runId: string) {
    // ~10 min max — les tests réels passent par le worker (limites runtime
    // jusqu'à 5 min) ; la console SSE affiche les étapes en direct pendant ce temps.
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const res = await fetch(`/api/run/agent/${runId}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "awaiting_approval") {
        setTestResult((prev) => ({
          ...(prev ?? { status: "awaiting_approval" }),
          status: "awaiting_approval",
          runId,
          approvalId: data.approval_id,
          stepsCompleted: data.steps_completed ?? prev?.stepsCompleted,
        }));
        return;
      }
      if (["completed", "failed", "suspended", "cancelled"].includes(data.status)) {
        setTestResult({
          status: data.status,
          runId,
          output: data.output,
          error: data.error_message,
          stepsCompleted: data.steps_completed,
        });
        return;
      }
      // Progression visible dans le wizard pendant que la console streame.
      setTestResult((prev) => ({
        ...(prev ?? { status: "running" }),
        status: "running",
        runId,
        stepsCompleted: data.steps_completed ?? prev?.stepsCompleted,
      }));
    }
    setTestResult((prev) => ({
      ...(prev ?? { status: "failed" }),
      status: "failed",
      runId,
      error: "Le test dépasse le délai de suivi — consultez Runs & logs pour la suite.",
    }));
  }

  async function handleTestApprove(approvalId: string, modifiedContent?: string) {
    if (!testResult?.runId) return;
    setTestRunning(true);
    try {
      // 1) Enregistre la décision : fusionne le contenu validé + fixe resume_from_step.
      const decideRes = await fetch(`/api/run/agent/${testResult.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision: "approved", modifiedContent }),
      });
      const decideData = await decideRes.json().catch(() => ({}));
      if (!decideRes.ok) {
        setTestResult((prev) => ({ ...prev, status: "failed", error: decideData.error || "Approbation échouée" }));
        return;
      }
      setTestApprovalDetails(null);
      void decideData;

      // 2) La reprise est faite par le WORKER (le run de test embarque son
      //    manifeste ; la route approve a déjà remis le run en pending et
      //    kické le worker). On suit simplement la reprise en direct — même
      //    chemin que /dashboard/validations, plus de double exécution.
      setTestResult((prev) => ({
        ...(prev ?? { status: "running" }),
        status: "running",
        runId: testResult.runId,
      }));
      await pollTestRun(testResult.runId);
    } finally {
      setTestRunning(false);
    }
  }

  async function handleTestReject(approvalId: string) {
    if (!testResult?.runId) return;
    await fetch(`/api/run/agent/${testResult.runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, decision: "rejected" }),
    });
    setTestApprovalDetails(null);
    setTestResult((prev) => ({
      ...prev,
      status: "failed",
      error: "Action rejetée — test arrêté.",
    }));
  }

  async function runPreview(dryRunOverride?: boolean) {
    if (!flowPreviewConfirmed && form.agentSteps.length > 0) {
      alert("Validez d'abord l'arborescence de l'agent.");
      return;
    }
    const isDryRun = dryRunOverride ?? testDryRun;
    setTestRunning(true);
    setTestResult(null);
    setTestApprovalDetails(null);
    setShowTestImmersive(true);
    const manifest = buildCurrentManifest();
    try {
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview: true,
          manifest,
          inputs: testInputs,
          async: false,
          dryRun: isDryRun,
          // fullDemo: persiste le run en base quand on exécute pour de vrai depuis le builder
          fullDemo: !isDryRun,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.runId && ["queued", "pending", "running"].includes(data.status)) {
          // Test réel : traité par le worker — la console SSE montre les
          // étapes en direct, on suit jusqu'au statut final.
          setTestResult({ status: "running", runId: data.runId });
          await pollTestRun(data.runId);
        } else {
          setTestResult({
            status: data.status,
            output: data.output,
            error: data.error,
            stepsCompleted: data.stepsCompleted,
            stepTrace: data.stepTrace,
            runId: data.runId,
            approvalId: data.approvalId,
          });
        }
      } else {
        setTestResult({ status: "failed", error: data.error || data.message });
      }
    } catch (err) {
      setTestResult({
        status: "failed",
        error: err instanceof Error ? err.message : "Erreur réseau lors du test",
      });
    } finally {
      setTestRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
      {draftNote && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5">
          <p className="text-sm text-ink">
            📝 Ta création en cours a été restaurée — reprends là où tu t&apos;étais arrêté.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDraftNote(false)}
              className="text-xs font-medium text-accent hover:underline"
            >
              Continuer
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="text-xs text-ink-faint hover:text-destructive hover:underline"
            >
              Repartir de zéro
            </button>
          </div>
        </div>
      )}
      <nav className="mb-8" aria-label="Étapes de création">
        <ol className="flex items-center">
          {STEP_META.map((meta, i) => {
            const StepIcon = meta.icon;
            const done = i < step;
            const current = i === step;
            const reachable = i <= step;
            return (
              <li key={meta.label} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => reachable && setStep(i)}
                  className={`group flex items-center gap-3 text-left outline-none ${
                    reachable ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all ${
                      done
                        ? "border-accent bg-accent text-white"
                        : current
                          ? "border-accent bg-accent/10 text-accent ring-4 ring-accent/10"
                          : "border-line bg-card text-ink-faint"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                  </span>
                  <span className="hidden md:block">
                    <span
                      className={`block text-sm font-semibold leading-tight ${
                        current || done ? "text-ink" : "text-ink-faint"
                      }`}
                    >
                      {meta.label}
                    </span>
                    <span className="block text-[11px] leading-tight text-ink-faint">
                      {meta.hint}
                    </span>
                  </span>
                </button>
                {i < STEP_META.length - 1 && (
                  <span
                    className={`mx-3 h-px flex-1 transition-colors ${
                      i < step ? "bg-accent" : "bg-line"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 0 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Quel est votre objectif ?</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Décrivez en langage naturel ce que vous voulez automatiser. Prompta générera un plan avec les étapes, outils et connexions nécessaires.
          </p>
          <textarea
            value={objectiveText}
            onChange={(e) => setObjectiveText(e.target.value)}
            placeholder="Ex. Quand je reçois un email de réclamation, analyser le sentiment, chercher le client dans HubSpot et rédiger une réponse empathique…"
            rows={4}
            className="mt-4 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-ink-soft">Modèle IA pour la génération</p>
            <CatalogSingleSelect
              catalog={getBuilderModels() as { id: string; label: string; provider?: string }[]}
              value={builderModel}
              onChange={setBuilderModel}
              groupByKey="provider"
              placeholder="Choisir OpenAI, Anthropic, Google…"
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Utilise votre clé BYOK du fournisseur choisi, ou la clé plateforme si configurée.
            </p>
          </div>
          {planError && <p className="mt-2 text-xs text-destructive">{planError}</p>}
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={planLoading}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {planLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {planLoading ? "Analyse en cours…" : "Générer mon agent"}
          </button>

          {generatedPlan && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{generatedPlan.title}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{generatedPlan.description}</p>
              </div>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium capitalize text-accent">
                {generatedPlan.kind}
              </span>
            </div>
          )}
          {planGraph && (
            <p className="mt-3 text-xs text-green-700">
              Plan généré — passez à l&apos;étape « Construire » pour configurer chaque nœud.
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Co-construis ton agent avec l&apos;IA</h2>
            <p className="text-sm text-ink-soft">
              L&apos;arborescence est en haut. Le copilote te guide étape par étape, complète pour toi,
              et te dit quand tout est prêt à tester.
            </p>
          </div>
          {!planGraph ? (
            <p className="text-sm text-amber-700">Générez d&apos;abord un plan à l&apos;étape « Décrire ».</p>
          ) : (
            <>
              <GuidedBuilder
                graph={planGraph}
                onGraphChange={(g) => commitPlanGraph(g)}
                selectedNodeId={selectedNodeId}
                onSelect={setSelectedNodeId}
                onMoveNode={(id, x, y) => commitPlanGraph(moveNode(planGraph, id, x, y))}
                defaultModel={form.models[0]}
                modelId={builderModel}
                envFields={form.envFields}
                disconnectedConnectors={disconnectedConnectors}
                onGoToTest={() => {
                  if (canContinueFromStep(1)) setStep(3);
                }}
              />
              <ClientRequirementsPanel
                summary={clientRequirements}
                onPreviewAsClient={() => setStep(3)}
              />
              {stepError && <p className="text-sm text-destructive">{stepError}</p>}
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Mettre en production</h2>
          <p className="text-sm text-ink-soft">
            Ton agent sera hébergé et exécutable à la demande — logs, validations et dossiers de
            mission inclus.
          </p>

          <input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Nom de l'agent"
            className="h-10 w-full rounded-lg border border-line px-3"
          />
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Ce que fait cet agent (pré-rempli par l'IA)"
            rows={3}
            className="w-full rounded-lg border border-line px-3 py-2"
          />

          <PlanQuotaCard />

          <dl className="space-y-2 rounded-xl border border-line bg-card2 p-4 text-sm">
            <div><dt className="text-ink-faint">Type</dt><dd className="font-medium capitalize">{form.type}</dd></div>
            <div><dt className="text-ink-faint">Étapes</dt><dd className="font-medium">{buildCurrentManifest().steps.length}</dd></div>
            <div><dt className="text-ink-faint">Applications</dt><dd className="font-medium">{dedupeConnectors(form.requiredConnectors).join(", ") || "—"}</dd></div>
          </dl>

          {stepError && <p className="text-sm text-destructive">{stepError}</p>}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Tester</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Visualisez l&apos;arborescence, configurez les validations humaines, puis lancez une démo complète.
          </p>

          {planGraph && planGraph.nodes.length > 0 && (
            <div className="mt-4">
              <AgentCanvas
                graph={planGraph}
                selectedId={undefined}
                onSelect={() => undefined}
                readOnly
                validationIssues={graphIssues}
              />
              {!flowPreviewConfirmed && (
                <button
                  type="button"
                  onClick={() => setFlowPreviewConfirmed(true)}
                  className="mt-3 rounded-lg border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent"
                >
                  Valider l&apos;arborescence
                </button>
              )}
              {flowPreviewConfirmed && (
                <p className="mt-2 flex items-center gap-1 text-xs text-green-700">
                  <Check className="h-3.5 w-3.5" /> Arborescence validée
                </p>
              )}
            </div>
          )}
          {form.agentSteps.length > 0 && !planGraph && (
            <div className="mt-4">
              <AgentFlowPreview
                steps={previewSteps}
                provisioningMode={form.provisioningMode}
                confirmed={flowPreviewConfirmed}
                onConfirm={() => setFlowPreviewConfirmed(true)}
              />
            </div>
          )}

          <div className="mt-4 space-y-3 rounded-xl border border-line bg-card2 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={includeHumanApprovals}
                onChange={(e) => {
                  setIncludeHumanApprovals(e.target.checked);
                  setFlowPreviewConfirmed(false);
                }}
                className="mt-1 rounded border-line"
              />
              <span>
                <span className="text-sm font-medium text-ink">Validations humaines</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Insère une étape d&apos;approbation avant chaque action sensible (envoi email, écriture Sheets…).
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={testDryRun}
                onChange={(e) => setTestDryRun(e.target.checked)}
                className="mt-1 rounded border-line"
              />
              <span>
                <span className="text-sm font-medium text-ink">Aperçu — rien n&apos;est envoyé</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Coché : les actions connecteur sont simulées (utile pour relire le plan). Décoché (défaut) : exécution réelle sur vos comptes connectés.
                </span>
              </span>
            </label>
          </div>

          {form.envFields.filter((f) => f.key).length > 0 && (
            <EnvFieldInputs
              fields={form.envFields}
              values={testInputs}
              onChange={(key, value) =>
                setTestInputs((prev) => ({ ...prev, [key]: value }))
              }
              requiredConnectors={dedupeConnectors(form.requiredConnectors)}
              provisioningMode={form.provisioningMode}
            />
          )}

          {showTestImmersive && (testRunning || testResult) && (
            <AgentRunExperience
              title={form.title || "Test agent"}
              status={testRunning ? "running" : testResult?.status ?? null}
              runId={testResult?.runId}
              stepsCompleted={testResult?.stepsCompleted ?? 0}
              totalSteps={previewSteps.length}
              plannedLabels={plannedStepLabels(previewSteps)}
              stepTrace={testResult?.stepTrace}
              pollWhileRunning={testRunning}
              errorMessage={testResult?.error ?? null}
              finalOutput={testResult?.output?.result}
              approvalId={testResult?.approvalId ?? null}
              approvalDetails={testApprovalDetails}
              onApprove={handleTestApprove}
              onReject={handleTestReject}
              onClose={() => setShowTestImmersive(false)}
            />
          )}

          {(form.requiredConnectors.length > 0 || form.requiredSecrets.length > 0) && (
            <div className="mt-4">
              {/* Connexion des apps DANS le wizard : plus besoin d'aller sur
                  Connexions pour découvrir qu'une app n'est pas authentifiée. */}
              <ConnectionsMasque
                requiredSecrets={form.requiredSecrets}
                requiredConnectors={dedupeConnectors(form.requiredConnectors)}
              />
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              onClick={() => void runPreview(false)}
              disabled={testRunning || (form.agentSteps.length > 0 && !flowPreviewConfirmed)}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {testRunning && !testDryRun && <Loader2 className="h-4 w-4 animate-spin" />}
              {testRunning && !testDryRun ? "Exécution…" : "Exécuter pour de vrai"}
            </button>
            <button
              onClick={() => void runPreview(true)}
              disabled={testRunning || (form.agentSteps.length > 0 && !flowPreviewConfirmed)}
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
            >
              {testRunning && testDryRun && <Loader2 className="h-4 w-4 animate-spin" />}
              {testRunning && testDryRun ? "Aperçu…" : "Aperçu (rien n'est envoyé)"}
            </button>
          </div>

          {form.agentSteps.length > 0 && !flowPreviewConfirmed && (
            <p className="mt-2 text-xs text-amber-700">
              Validez l&apos;arborescence ci-dessus avant de lancer le test.
            </p>
          )}

          {testResult?.error && !showTestImmersive && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-destructive">
              {testResult.error}
            </p>
          )}

          {testResult?.status === "completed" && testResult.output?.result && !showTestImmersive && (
            <div className="mt-4 rounded-xl border border-line bg-card p-4">
              <p className="text-xs font-bold uppercase text-ink-soft">Livrable final</p>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-ink">
                {testResult.output.result}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-card2 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => {
              if (canContinueFromStep(step)) setStep((s) => s + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
          >
            Continuer
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-card2 disabled:opacity-50"
            >
              {edit ? "Enregistrer (nouvelle version)" : "Brouillon"}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {saving
                ? "Mise en production…"
                : edit?.status === "published"
                  ? "Enregistrer & republier"
                  : "Mettre en production"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
