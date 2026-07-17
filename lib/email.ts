import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY non définie");
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Prompta <noreply@prompta.fr>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Échappe les valeurs interpolées dans le HTML des emails (titres saisis par les créateurs…). */
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface SubscriptionConfirmationParams {
  to: string;
  listingTitle: string;
  amountCents: number;
}

export async function sendSubscriptionConfirmation(params: SubscriptionConfirmationParams) {
  const { to, listingTitle, amountCents } = params;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #0A66C2;">Abonnement confirmé</h1>
  <p>Votre abonnement à <strong>${escapeHtml(listingTitle)}</strong> est actif.</p>
  <p>Montant : <strong>${(amountCents / 100).toFixed(2)} €/mois</strong></p>
  <p>Lancez l'agent avec vos clés API depuis la fiche listing.</p>
  <p><a href="${APP_URL}/dashboard/connexions">Configurer mes clés →</a></p>
</body>
</html>`.trim();

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Abonnement confirmé — ${listingTitle}`,
      html,
    });
  } catch (error) {
    console.error("Erreur envoi confirmation abonnement:", error);
  }
}

interface ApprovalRequestParams {
  to: string;
  agentTitle: string;
  stepLabel?: string;
  preview?: string;
  approvalId: string;
  runId: string;
}

/** Notifie par email qu'un agent attend une validation humaine. */
export async function sendApprovalRequestEmail(params: ApprovalRequestParams) {
  const { to, agentTitle, stepLabel, preview, approvalId } = params;
  const link = `${APP_URL}/dashboard/validations?focus=${approvalId}`;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #0A66C2; font-size: 22px;">Validation requise</h1>
  <p>
    Votre agent <strong>${escape(agentTitle)}</strong> est en pause${
      stepLabel ? ` sur l'étape « ${escape(stepLabel)} »` : ""
    } et attend votre feu vert pour continuer.
  </p>
  ${
    preview
      ? `<div style="background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap; font-size: 13px;">${escape(
          preview.slice(0, 1200),
        )}${preview.length > 1200 ? "…" : ""}</div>`
      : ""
  }
  <p style="margin: 24px 0;">
    <a href="${link}" style="background: #0A66C2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
      Relire et valider →
    </a>
  </p>
  <p style="color: #888; font-size: 12px;">
    Vous pouvez modifier le contenu avant de valider, demander une correction à l'IA, ou refuser.
    L'agent reste en pause en attendant (24 h max).
  </p>
</body>
</html>`.trim();

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `⏸ ${agentTitle} attend votre validation`,
      html,
    });
  } catch (error) {
    console.error("Erreur envoi email approbation:", error);
  }
}

// ─── Dossier de mission : email avec VRAIES pièces jointes ───────────────────

export interface MissionReportAttachment {
  filename: string;
  /** Contenu texte (sera encodé pour Resend). */
  content: string;
  contentType?: string;
}

export interface MissionReportParams {
  to: string;
  agentTitle: string;
  runId: string;
  /** Résumé court affiché dans le corps. */
  summary?: string;
  /** Liens vers les ressources RÉELLES créées (feuille Sheets, design Canva…). */
  links: { label: string; url: string }[];
  attachments: MissionReportAttachment[];
}

/**
 * Email de fin de mission envoyé PAR la plateforme (Resend) au propriétaire du
 * run : les livrables en pièces jointes (rapport HTML, CSV…) + boutons vers
 * les ressources créées dans les apps. Destinataire = propriétaire du run,
 * jamais un tiers.
 */
export async function sendMissionReportEmail(params: MissionReportParams) {
  const { to, agentTitle, runId, summary, links, attachments } = params;

  const linkButtons = links
    .map(
      (l) =>
        `<a href="${escapeHtml(l.url)}" style="display:inline-block;background:#4F46E5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:4px 6px 4px 0;">${escapeHtml(l.label)}</a>`,
    )
    .join("");

  const attachList = attachments
    .map((a) => `<li style="margin:2px 0;">📎 ${escapeHtml(a.filename)}</li>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;border-radius:14px;padding:26px 30px;">
    <p style="margin:0;font-size:13px;opacity:.85;">Mission terminée ✅</p>
    <h1 style="margin:6px 0 0;font-size:22px;">${escapeHtml(agentTitle)}</h1>
  </div>
  ${summary ? `<p style="margin:20px 0 8px;line-height:1.55;">${escapeHtml(summary)}</p>` : ""}
  ${
    links.length
      ? `<h3 style="margin:22px 0 8px;font-size:15px;">Ressources créées dans tes apps</h3><div>${linkButtons}</div>`
      : ""
  }
  ${
    attachments.length
      ? `<h3 style="margin:22px 0 6px;font-size:15px;">Livrables en pièces jointes</h3><ul style="margin:4px 0;padding-left:20px;font-size:14px;">${attachList}</ul>`
      : ""
  }
  <div style="text-align:center;margin:26px 0 8px;">
    <a href="${APP_URL}/dashboard/runs/${runId}" style="display:inline-block;border:1px solid #4F46E5;color:#4F46E5;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      Ouvrir le dossier de mission complet
    </a>
  </div>
</body>
</html>`.trim();

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `📦 Mission terminée — ${agentTitle}`,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "utf-8"),
        contentType: a.contentType,
      })),
    });
  } catch (error) {
    console.error("Erreur envoi dossier de mission:", error);
  }
}
