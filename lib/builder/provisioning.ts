import type { AgentManifest } from "@/lib/agent/schema";
import type { EnvFieldBase } from "@/lib/builder/env-field-hints";

export type ProvisioningMode = "manual" | "assisted" | "managed";

export const PROVISIONING_OPTIONS: {
  id: ProvisioningMode;
  label: string;
  description: string;
  forBuilder: string;
  forUser: string;
}[] = [
  {
    id: "manual",
    label: "Manuel",
    description: "L'utilisateur configure Sheets, Gmail, etc. lui-même.",
    forBuilder: "Pour les power users qui veulent tout contrôler.",
    forUser: "Vous renseignez les IDs et paramètres (Sheets, expéditeur…).",
  },
  {
    id: "assisted",
    label: "Assisté",
    description: "L'agent guide et peut créer des ressources si OAuth accordé.",
    forBuilder: "Bon compromis — moins de friction, plus de conversions.",
    forUser: "Autorisez vos apps ; l'agent vous guide et crée ce qui manque.",
  },
  {
    id: "managed",
    label: "Clé en main",
    description: "Minimum d'inputs : OAuth + 2–3 champs métier, l'agent livre le reste.",
    forBuilder: "Idéal avec frais d'hébergement — expérience premium.",
    forUser: "Connectez Gmail/Sheets une fois ; l'agent crée la base et exécute.",
  },
];

/** Champs techniques masqués en mode managed (l'agent les crée). */
const MANAGED_HIDDEN_PATTERNS = [
  /sheet/,
  /spreadsheet/,
  /google.?sheet/,
  /identifiant.*base/,
  /feuille/,
  /document.?id/,
];

export function shouldHideInputForProvisioning(
  field: EnvFieldBase,
  mode: ProvisioningMode
): boolean {
  if (mode !== "managed") return false;
  const text = `${field.key} ${field.label} ${field.help ?? ""}`.toLowerCase();
  return MANAGED_HIDDEN_PATTERNS.some((re) => re.test(text));
}

export function filterInputsForProvisioning(
  fields: EnvFieldBase[],
  mode: ProvisioningMode
): EnvFieldBase[] {
  return fields.filter((f) => !shouldHideInputForProvisioning(f, mode));
}

export function provisioningFromManifest(manifest: AgentManifest): ProvisioningMode {
  return manifest.provisioning?.mode ?? "manual";
}

export function managedDeliverables(manifest: AgentManifest): string[] {
  const steps = manifest.steps ?? [];
  const deliverables = new Set<string>();
  for (const s of steps) {
    if (s.type === "action") {
      if (s.connector.includes("sheet")) deliverables.add("Feuille Google Sheets configurée");
      if (s.connector === "gmail") deliverables.add("Emails envoyés depuis votre Gmail connecté");
    }
    if (s.type === "tool" && s.tool === "web_search") deliverables.add("Prospects trouvés via recherche web");
    if (s.type === "llm") deliverables.add("Messages personnalisés générés par IA");
  }
  return Array.from(deliverables);
}
