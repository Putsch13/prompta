/**
 * Validateur de conformité du registre connecteur — Pilier D (P4.1/P4.2).
 *
 * Objectif : interdire toute déclaration incorrecte qui pourrait réintroduire
 * le bug « paramètre non renseigné / placeholder qui part en API ».
 *
 * Règles vérifiées :
 *  1. Tout input `required: true` a un `kind` explicite.
 *  2. Tout input `kind ∈ {resource, identity}` a un `resourceType` connu
 *     dans `RESOURCE_TYPES`.
 *  3. Tout `resourceType` référencé a un `listAction` défini.
 *  4. Pas de `defaultValue` « magique » non valide (ex. `"*"`).
 *  5. Tout connecteur a au moins une action.
 *  6. Tout action a un id, un label et un tableau `inputs`.
 *  7. Pas de clé `kind: identity` sans `resourceType` (l'identité = ressource).
 */

import { CONNECTORS } from "./registry";
import { RESOURCE_TYPES } from "./resource-types";

const FORBIDDEN_MAGIC_DEFAULTS = new Set<string>(["*"]);

export interface RegistryIssue {
  level: "error";
  code: string;
  message: string;
  connector?: string;
  action?: string;
  input?: string;
}

/**
 * Retourne la liste des problèmes de conformité du registre.
 * Tableau vide ⇒ registre conforme.
 */
export function validateRegistry(): RegistryIssue[] {
  const issues: RegistryIssue[] = [];

  for (const connector of CONNECTORS) {
    if (!connector.actions || connector.actions.length === 0) {
      issues.push({
        level: "error",
        code: "connector_no_actions",
        connector: connector.id,
        message: `Connecteur ${connector.id} n'a aucune action déclarée.`,
      });
      continue;
    }

    for (const action of connector.actions) {
      if (!action.id || !action.label) {
        issues.push({
          level: "error",
          code: "action_missing_meta",
          connector: connector.id,
          action: action.id,
          message: `Action ${connector.id}.${action.id ?? "?"} : id ou label manquant.`,
        });
      }
      if (!Array.isArray(action.inputs)) {
        issues.push({
          level: "error",
          code: "action_no_inputs_array",
          connector: connector.id,
          action: action.id,
          message: `Action ${connector.id}.${action.id} : champ inputs absent ou invalide.`,
        });
        continue;
      }

      for (const input of action.inputs) {
        // Règle 1 : required → kind
        if (input.required && !input.kind) {
          issues.push({
            level: "error",
            code: "required_input_missing_kind",
            connector: connector.id,
            action: action.id,
            input: input.key,
            message: `Input requis ${connector.id}.${action.id}.${input.key} n'a pas de kind. Ajoutez kind ∈ {input, resource, identity, step_ref, static}.`,
          });
        }

        // Règle 2 + 7 : resource/identity → resourceType connu
        if (input.kind === "resource" || input.kind === "identity") {
          if (!input.resourceType) {
            issues.push({
              level: "error",
              code: "resource_input_missing_resource_type",
              connector: connector.id,
              action: action.id,
              input: input.key,
              message: `${connector.id}.${action.id}.${input.key} : kind=${input.kind} requiert un resourceType.`,
            });
          } else {
            const def = RESOURCE_TYPES[input.resourceType];
            if (!def) {
              issues.push({
                level: "error",
                code: "unknown_resource_type",
                connector: connector.id,
                action: action.id,
                input: input.key,
                message: `${connector.id}.${action.id}.${input.key} : resourceType "${input.resourceType}" inconnu (manque dans RESOURCE_TYPES).`,
              });
            } else if (!def.listAction) {
              // Règle 3
              issues.push({
                level: "error",
                code: "resource_type_missing_list_action",
                connector: connector.id,
                action: action.id,
                input: input.key,
                message: `ResourceType "${input.resourceType}" n'a pas de listAction — l'abonné ne pourra pas choisir cette ressource.`,
              });
            }
          }
        }

        // Règle 4 : defaultValue magique interdite
        if (
          input.defaultValue !== undefined &&
          FORBIDDEN_MAGIC_DEFAULTS.has(input.defaultValue.trim())
        ) {
          issues.push({
            level: "error",
            code: "forbidden_magic_default",
            connector: connector.id,
            action: action.id,
            input: input.key,
            message: `${connector.id}.${action.id}.${input.key} : defaultValue "${input.defaultValue}" interdit (sémantique magique non valide).`,
          });
        }

        // Règle 8 (P4.4) : input requis non auto-rempli doit guider l'abonné
        if (
          input.required &&
          input.kind === "input" &&
          input.defaultValue === undefined &&
          !input.help?.trim() &&
          !input.placeholder?.trim()
        ) {
          issues.push({
            level: "error",
            code: "required_input_missing_help_or_placeholder",
            connector: connector.id,
            action: action.id,
            input: input.key,
            message: `${connector.id}.${action.id}.${input.key} : input requis sans help ni placeholder — l'abonné ne saura pas quoi renseigner.`,
          });
        }
      }
    }
  }

  return issues;
}
