/**
 * Résolveur de Contrat d'agent — Pilier B (REFONTE-prompta-runtime.md).
 *
 * Unique moteur qui, à partir du Contrat (`AgentContract`) et d'un contexte
 * d'exécution, décide pour chaque `NeededInput` :
 *  - quel est son statut (resolved/missing/ask/internal) ;
 *  - quel est son widget UI (text/email/resource_picker/connect) ;
 *  - quelle valeur effective utiliser au run.
 *
 * Consommé par :
 *  - `lib/agent/orchestrator.ts` (phase `run`) — plus d'inline `isResourcePlaceholder`
 *  - `app/api/run/agent/preflight/route.ts` (phase `preflight`)
 *  - `components/run/RunPanel.tsx` (phase `run`, filtre ask/missing pour UI)
 *  - `components/builder/canvas/NodeInspector.tsx` (phase `build`)
 *  - `lib/builder/validate-manifest-for-publish.ts` (phase `sell`)
 */

import type { AgentContract, NeededInput, NeededInputKind } from "@/lib/agent/contract";
import { resourcePlaceholder } from "@/lib/connectors/param-bindings";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Phase = "build" | "sell" | "run" | "preflight";

export type ResolvedStatus = "resolved" | "missing" | "ask" | "internal";
export type ResolvedWidget = "text" | "email" | "textarea" | "resource_picker" | "connect";

export interface ConnectionStatus {
  connected: boolean;
  account?: string;
}

export interface ResolveCtx {
  phase: Phase;
  /** Exécutant courant (créateur en build/test, abonné en run). */
  runnerId?: string;
  /** ID créateur de l'agent (pour les besoins `shared`). */
  creatorId?: string;
  /**
   * Valeurs saisies par binding key (champs texte/email/textarea/number).
   * Ex. `{ destinataire: "alice@x.com", ton: "formel" }`.
   */
  provided?: Record<string, string>;
  /**
   * Valeurs des ressources keyées `stepIndex:paramKey`. Ex.
   * `{ "0:spreadsheetId": "1AbCd…", "2:from": "alice@example.com" }`.
   */
  resources?: Record<string, string>;
  /** Statut des connexions par connectorId. */
  connections?: Record<string, ConnectionStatus>;
}

export interface ResolvedInput extends NeededInput {
  status: ResolvedStatus;
  resolvedValue?: string;
  widget?: ResolvedWidget;
  /** Message actionnable si `missing`/`ask`. */
  message?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function widgetForKind(kind: NeededInputKind): ResolvedWidget {
  if (kind === "resource" || kind === "identity") return "resource_picker";
  if (kind === "connection" || kind === "secret") return "connect";
  if (kind === "email") return "email";
  if (kind === "textarea") return "textarea";
  return "text";
}

function connectorOf(input: NeededInput): string | undefined {
  return input.connectorParam?.connector;
}

function isMeaningfulValue(v: string | undefined): v is string {
  if (v == null) return false;
  const t = v.trim();
  if (!t) return false;
  // exclut les placeholders non résolus
  if (t.startsWith("{{") && t.endsWith("}}")) return false;
  return true;
}

function askMessage(input: NeededInput): string {
  if (input.kind === "resource") {
    return `Choisissez la ressource « ${input.label} ».`;
  }
  if (input.kind === "identity") {
    return `Choisissez ${input.label.toLowerCase()}.`;
  }
  return `Renseignez « ${input.label} ».`;
}

function missingConnectionMessage(connector: string): string {
  return `Connectez ${connector} pour utiliser cet agent.`;
}

// ─── Cœur ────────────────────────────────────────────────────────────────────

function resolveOne(input: NeededInput, ctx: ResolveCtx): ResolvedInput {
  const widget = widgetForKind(input.kind);

  // 1) Sortie d'étape → résolue par l'orchestrateur (jamais demandée)
  if (input.source === "step") {
    return { ...input, status: "internal", widget };
  }

  // 2) Pinned : valeur fixée par le builder
  if (input.source === "pinned") {
    if (ctx.phase === "sell") {
      // À la vente, on transforme le pinned non-shared en placeholder demandé à l'abonné
      const placeholder =
        input.kind === "resource" && input.resourceType
          ? resourcePlaceholder(input.resourceType)
          : `{{${input.key}}}`;
      return {
        ...input,
        source: "subscriber",
        status: "ask",
        widget,
        resolvedValue: placeholder,
        message: askMessage(input),
      };
    }
    // build/run/preflight : la valeur épinglée est utilisée telle quelle
    return {
      ...input,
      status: "resolved",
      widget,
      resolvedValue: input.value,
    };
  }

  // 3) Shared : valeur fournie par le créateur (env partagée)
  if (input.source === "shared") {
    // À la vente, on conserve les valeurs/connexions du créateur (c'est l'intérêt du shared)
    // Au run, on attend que l'env créateur résolve (connexion sous `creatorId`).
    if (input.kind === "resource" || input.kind === "identity") {
      // Le runtime utilisera la connexion du créateur ; on marque resolved si on a une valeur épinglée
      if (input.value && isMeaningfulValue(input.value)) {
        return { ...input, status: "resolved", widget, resolvedValue: input.value };
      }
      // Ressource shared sans valeur épinglée → s'appuie sur la connexion créateur (resolved implicite)
      return { ...input, status: "resolved", widget, resolvedValue: input.value };
    }
    return {
      ...input,
      status: "resolved",
      widget,
      resolvedValue: input.value,
    };
  }

  // 4) Subscriber : abonné fournit
  // 4a) Connexion/secret → on regarde l'état de connexion
  if (input.kind === "connection" || input.kind === "secret") {
    const conn = connectorOf(input);
    const status = conn ? ctx.connections?.[conn] : undefined;
    if (status?.connected) {
      return { ...input, status: "resolved", widget };
    }
    return {
      ...input,
      status: "missing",
      widget,
      message: conn ? missingConnectionMessage(conn) : "Connectez le service requis.",
    };
  }

  // 4b) Ressource/identité → resources[stepIndex:paramKey] ou provided[key]
  if (input.kind === "resource" || input.kind === "identity") {
    const lookupKey =
      input.connectorParam && `${input.connectorParam.stepIndex}:${input.connectorParam.key}`;
    const fromResources = lookupKey ? ctx.resources?.[lookupKey] : undefined;
    const fromProvided = ctx.provided?.[input.key];
    const value = isMeaningfulValue(fromResources)
      ? fromResources
      : isMeaningfulValue(fromProvided)
        ? fromProvided
        : undefined;
    if (value) {
      return { ...input, status: "resolved", widget, resolvedValue: value };
    }
    return {
      ...input,
      status: "ask",
      widget,
      message: askMessage(input),
    };
  }

  // 4c) Texte/email/textarea/number → provided[key]
  const provided = ctx.provided?.[input.key];
  if (isMeaningfulValue(provided)) {
    return { ...input, status: "resolved", widget, resolvedValue: provided };
  }
  if (!input.required) {
    // Optionnel non renseigné : pas demandé, pas bloquant
    return { ...input, status: "resolved", widget, resolvedValue: "" };
  }
  return {
    ...input,
    status: "ask",
    widget,
    message: askMessage(input),
  };
}

// ─── API publique ────────────────────────────────────────────────────────────

/** Résout chaque besoin du contrat avec le contexte fourni. */
export function resolveAgentInterface(
  contract: AgentContract,
  ctx: ResolveCtx,
): ResolvedInput[] {
  return contract.interface.map((input) => resolveOne(input, ctx));
}

/** Sous-ensemble bloquant en preflight (à demander ou à connecter avant le run). */
export function preflightMissing(
  contract: AgentContract,
  ctx: ResolveCtx,
): ResolvedInput[] {
  const resolved = resolveAgentInterface(contract, { ...ctx, phase: "preflight" });
  return resolved.filter(
    (r) => (r.status === "missing" || r.status === "ask") && r.required,
  );
}

/** Champs à afficher dans le masque abonné (filtré sur le run). */
export function runtimeFieldsToShow(
  contract: AgentContract,
  ctx: ResolveCtx,
): ResolvedInput[] {
  const resolved = resolveAgentInterface(contract, { ...ctx, phase: "run" });
  return resolved.filter((r) => r.status === "ask" || r.status === "missing");
}

/** Aide : récupère la valeur résolue d'un paramètre d'étape (orchestrateur). */
export function resolvedValueForStepParam(
  resolved: ResolvedInput[],
  stepIndex: number,
  paramKey: string,
): ResolvedInput | undefined {
  return resolved.find(
    (r) =>
      r.connectorParam?.stepIndex === stepIndex &&
      r.connectorParam?.key === paramKey,
  );
}
