/**
 * Dossier de mission par email — envoyé par la PLATEFORME (Resend) au
 * propriétaire du run à la fin d'une mission réussie qui a produit des
 * livrables. Contient :
 *  - les livrables en VRAIES pièces jointes (rapport.html, .csv…) ;
 *  - les liens directs vers les ressources créées dans les apps
 *    (feuille Google Sheets, design Canva, document…), extraits des sorties.
 *
 * Destinataire = propriétaire du run (jamais un tiers).
 */

import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_ATTACH_TOTAL = 4 * 1024 * 1024; // 4 MB — marge sous la limite Resend
const MAX_LINKS = 6;

/** Extrait les URLs « ressource créée » des sorties d'actions (JSON). */
export function extractResourceLinks(
  outputs: Record<string, string>,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();

  const push = (label: string, url: string) => {
    if (!url || seen.has(url) || links.length >= MAX_LINKS) return;
    if (!/^https:\/\//.test(url)) return;
    seen.add(url);
    links.push({ label, url });
  };

  const labelFor = (url: string): string => {
    if (url.includes("docs.google.com/spreadsheets")) return "📊 Ouvrir la feuille Google Sheets";
    if (url.includes("docs.google.com/document")) return "📄 Ouvrir le document Google Docs";
    if (url.includes("docs.google.com/presentation")) return "📽️ Ouvrir la présentation";
    if (url.includes("canva.com")) return "🎨 Ouvrir le design Canva";
    if (url.includes("calendar.google.com")) return "🗓️ Voir l'événement Calendar";
    if (url.includes("notion.so")) return "🗒️ Ouvrir la page Notion";
    if (url.includes("mail.google.com")) return "✉️ Voir l'email envoyé";
    return "🔗 Ouvrir la ressource";
  };

  for (const [key, val] of Object.entries(outputs)) {
    if (typeof val !== "string" || !val.trim().startsWith("{")) continue;
    // step_N_output et alias pointent vers les mêmes JSON — dédupe par URL.
    void key;
    try {
      const parsed = JSON.parse(val) as Record<string, unknown>;
      const walk = (obj: unknown, depth: number) => {
        if (depth > 3 || obj == null || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (typeof v === "string" && /^https:\/\//.test(v) && /url/i.test(k)) {
            push(labelFor(v), v);
          } else if (typeof v === "object") {
            walk(v, depth + 1);
          }
        }
      };
      walk(parsed, 0);
    } catch {
      // pas du JSON — ignore
    }
  }
  return links;
}

/**
 * Envoie le dossier de mission au propriétaire du run (best-effort).
 * À appeler après persistance des livrables, uniquement sur un run réel réussi.
 */
export async function sendMissionReport(params: {
  runId: string;
  userId: string;
  listingId: string | null;
  outputs: Record<string, string>;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const admin = createAdminClient();

  const { data: userData } = await admin.auth.admin.getUserById(params.userId);
  const to = userData?.user?.email;
  if (!to) return;

  let agentTitle = "Ton agent";
  if (params.listingId) {
    const { data: listing } = await admin
      .from("listings")
      .select("title")
      .eq("id", params.listingId)
      .single();
    if ((listing as any)?.title) agentTitle = (listing as any).title;
  }

  // Livrables fraîchement persistés → pièces jointes (rapport + données).
  const { data: dels } = await admin
    .from("agent_deliverables")
    .select("filename, mime_type, content_text, size_bytes")
    .eq("run_id", params.runId)
    .order("size_bytes", { ascending: false });

  const attachments: { filename: string; content: string; contentType?: string }[] = [];
  let total = 0;
  const wanted = (f: string) =>
    f.endsWith(".html") || f.endsWith(".csv") || f === "result.md";
  for (const d of dels ?? []) {
    const row = d as { filename: string; mime_type: string | null; content_text: string | null; size_bytes: number | null };
    if (!row.content_text || !wanted(row.filename)) continue;
    const size = row.size_bytes ?? row.content_text.length;
    if (total + size > MAX_ATTACH_TOTAL) continue;
    total += size;
    attachments.push({
      filename: row.filename,
      content: row.content_text,
      contentType: row.mime_type ?? undefined,
    });
  }

  const links = extractResourceLinks(params.outputs);
  if (attachments.length === 0 && links.length === 0) return;

  // Résumé : première sortie texte substantielle.
  const summary = Object.entries(params.outputs)
    .filter(([k, v]) => !k.startsWith("step_") && v && !v.trim().startsWith("{"))
    .sort((a, b) => b[1].length - a[1].length)[0]?.[1]
    ?.slice(0, 220);

  const { sendMissionReportEmail } = await import("@/lib/email");
  await sendMissionReportEmail({
    to,
    agentTitle,
    runId: params.runId,
    summary: summary ? `${summary}${summary.length >= 220 ? "…" : ""}` : undefined,
    links,
    attachments,
  });
}
