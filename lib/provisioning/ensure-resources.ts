import type { AgentManifest } from "@/lib/agent/schema";
import { getUserConnection } from "@/lib/connections";
import { detectAutoResourcesFromManifest, type AutoResourceSpec } from "./auto-resources";

export interface ProvisionContext {
  userId: string;
  agentTitle?: string;
  dryRun?: boolean;
}

export interface ProvisionResult {
  inputs: Record<string, string>;
  created: { kind: string; id: string; label: string }[];
  logs: string[];
}

async function createGoogleSpreadsheet(
  accessToken: string,
  title: string,
  dryRun: boolean
): Promise<{ spreadsheetId: string; log: string }> {
  if (dryRun) {
    return {
      spreadsheetId: "dry_run_spreadsheet_id",
      log: `[dry-run] Feuille « ${title} » serait créée`,
    };
  }

  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: { title: "Prospects" },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "Nom" } },
                    { userEnteredValue: { stringValue: "Email" } },
                    { userEnteredValue: { stringValue: "Statut" } },
                    { userEnteredValue: { stringValue: "Notes" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Création Sheets échouée : ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId as string,
    log: `Feuille créée : ${title} (${data.spreadsheetId})`,
  };
}

async function provisionSpec(
  spec: AutoResourceSpec,
  ctx: ProvisionContext,
  inputs: Record<string, string>
): Promise<{ key: string; value: string; log: string; kind: string } | null> {
  const existing =
    inputs[spec.inputKey] ||
    inputs[`${spec.connector}_id`] ||
    inputs.google_sheets_id ||
    inputs.spreadsheetId;

  if (existing?.trim()) return null;

  if (spec.kind === "google_spreadsheet") {
    const conn = await getUserConnection(ctx.userId, "google_sheets");
    if (!conn?.accessToken) {
      return {
        key: spec.inputKey,
        value: "",
        log: `Connectez Google Sheets pour auto-créer la feuille`,
        kind: spec.kind,
      };
    }

    const title = ctx.agentTitle
      ? `Prompta — ${ctx.agentTitle}`
      : `Prompta — ${new Date().toISOString().slice(0, 10)}`;

    const { spreadsheetId, log } = await createGoogleSpreadsheet(
      conn.accessToken,
      title,
      Boolean(ctx.dryRun)
    );

    return {
      key: spec.inputKey,
      value: spreadsheetId,
      log,
      kind: spec.kind,
    };
  }

  if (spec.kind === "gmail_label") {
    return {
      key: spec.inputKey,
      value: "Prompta",
      log: ctx.dryRun
        ? "[dry-run] Libellé Gmail Prompta serait utilisé"
        : "Libellé Gmail « Prompta » configuré pour le suivi",
      kind: spec.kind,
    };
  }

  return {
    key: spec.inputKey,
    value: "",
    log: `${spec.label} : provisioning ${spec.kind} prévu (connecteur ${spec.connector})`,
    kind: spec.kind,
  };
}

/**
 * Enrichit les inputs avec les ressources auto-créées (modes assisted / managed).
 */
export async function ensureAutoResources(
  manifest: AgentManifest,
  ctx: ProvisionContext,
  inputs: Record<string, string>
): Promise<ProvisionResult> {
  const mode = manifest.provisioning?.mode ?? "manual";
  if (mode === "manual" || !manifest.provisioning?.autoCreateResources) {
    return { inputs: { ...inputs }, created: [], logs: [] };
  }

  const specs = detectAutoResourcesFromManifest(manifest);
  const enriched = { ...inputs };
  const created: ProvisionResult["created"] = [];
  const logs: string[] = [];

  for (const spec of specs) {
    try {
      const result = await provisionSpec(spec, ctx, enriched);
      if (!result) continue;
      if (result.value) {
        enriched[result.key] = result.value;
        enriched.spreadsheet_id = enriched.spreadsheet_id || result.value;
        enriched.google_sheets_id = enriched.google_sheets_id || result.value;
        created.push({ kind: result.kind, id: result.value, label: spec.label });
      }
      logs.push(result.log);
    } catch (err) {
      logs.push(
        `${spec.label} : ${err instanceof Error ? err.message : "erreur provisioning"}`
      );
    }
  }

  return { inputs: enriched, created, logs };
}

export function listProvisionableServices(): AutoResourceSpec[] {
  return detectAutoResourcesFromManifest({
    steps: [],
    connectors: [
      "google_sheets",
      "googlesheets",
      "google_drive",
      "notion",
      "slack",
      "hubspot",
      "gmail",
    ],
  });
}
