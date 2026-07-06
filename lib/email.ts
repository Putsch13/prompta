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

interface PurchaseReceiptParams {
  to: string;
  listingTitle: string;
  listingSlug: string;
  listingType?: string;
  amountCents: number;
  taxCents: number;
  purchaseId: string;
  versionId: string;
}

export async function sendPurchaseReceipt(params: PurchaseReceiptParams) {
  const {
    to,
    listingTitle,
    listingSlug,
    listingType = "prompt",
    amountCents,
    taxCents,
    purchaseId,
    versionId,
  } = params;

  const totalCents = amountCents + taxCents;
  const isRunnable = listingType === "agent" || listingType === "workflow";
  const actionUrl = isRunnable
    ? `${APP_URL}/listing/${listingSlug}`
    : `${APP_URL}/api/download/${versionId}`;
  const actionLabel = isRunnable ? "Lancer l'agent" : "Télécharger le bundle";
  const listingUrl = `${APP_URL}/listing/${listingSlug}`;
  const date = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reçu d'achat - Prompta</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #0A66C2; font-size: 24px; margin: 0;">
      Prompta<span style="color: #0A66C2;">.</span>
    </h1>
  </div>

  <div style="background: #f8f8f6; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px; font-size: 20px;">Merci pour votre achat !</h2>
    <p style="margin: 0 0 16px; color: #666;">
      Votre paiement a été confirmé. Voici le récapitulatif de votre commande.
    </p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Référence</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; font-family: monospace;">${purchaseId.slice(0, 8)}</td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Date</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;">${date}</td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Produit</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${listingTitle}</td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Prix HT</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;">${(amountCents / 100).toFixed(2)} €</td>
    </tr>
    ${taxCents > 0 ? `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">TVA</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;">${(taxCents / 100).toFixed(2)} €</td>
    </tr>
    ` : ""}
    <tr>
      <td style="padding: 12px 0; font-weight: 600;">Total TTC</td>
      <td style="padding: 12px 0; text-align: right; font-weight: 600; font-size: 18px; color: #0A66C2;">${(totalCents / 100).toFixed(2)} €</td>
    </tr>
  </table>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${actionUrl}" style="display: inline-block; background: #0A66C2; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
      ${actionLabel}
    </a>
    <p style="margin: 16px 0 0; font-size: 14px; color: #666;">
      ou <a href="${listingUrl}" style="color: #0A66C2;">voir la fiche ${isRunnable ? "de l'agent" : "du prompt"}</a>
    </p>
  </div>

  <div style="border-top: 1px solid #eee; padding-top: 24px; font-size: 12px; color: #999; text-align: center;">
    <p style="margin: 0 0 8px;">
      Ce reçu est généré automatiquement par Prompta.
    </p>
    <p style="margin: 0;">
      <a href="${APP_URL}/legal/terms" style="color: #999;">CGU</a> •
      <a href="${APP_URL}/legal/privacy" style="color: #999;">Confidentialité</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Reçu d'achat — ${listingTitle}`,
      html,
    });
  } catch (error) {
    console.error("Erreur envoi email de reçu:", error);
  }
}

interface SaleNotificationParams {
  to: string;
  listingTitle: string;
  amountCents: number;
  platformFeeCents: number;
  buyerName: string;
}

export async function sendSaleNotification(params: SaleNotificationParams) {
  const { to, listingTitle, amountCents, platformFeeCents, buyerName } = params;

  const netCents = amountCents - platformFeeCents;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nouvelle vente - Prompta</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #0A66C2; font-size: 24px; margin: 0;">
      Prompta<span style="color: #0A66C2;">.</span>
    </h1>
  </div>

  <div style="background: linear-gradient(115deg, #0A66C2 0%, #378FE9 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; color: white;">
    <h2 style="margin: 0 0 8px; font-size: 20px;">🎉 Nouvelle vente !</h2>
    <p style="margin: 0; opacity: 0.9;">
      ${buyerName} vient d'acheter <strong>${listingTitle}</strong>
    </p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Montant brut</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;">${(amountCents / 100).toFixed(2)} €</td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Commission Prompta (20%)</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;">-${(platformFeeCents / 100).toFixed(2)} €</td>
    </tr>
    <tr>
      <td style="padding: 12px 0; font-weight: 600;">Votre gain net</td>
      <td style="padding: 12px 0; text-align: right; font-weight: 600; font-size: 18px; color: #0A66C2;">${(netCents / 100).toFixed(2)} €</td>
    </tr>
  </table>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${APP_URL}/dashboard/payouts" style="display: inline-block; background: #0A66C2; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
      Voir mon dashboard
    </a>
  </div>

  <div style="border-top: 1px solid #eee; padding-top: 24px; font-size: 12px; color: #999; text-align: center;">
    <p style="margin: 0;">
      Les fonds seront transférés sur votre compte Stripe selon le calendrier habituel.
    </p>
  </div>
</body>
</html>
  `.trim();

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `🎉 Nouvelle vente — ${listingTitle}`,
      html,
    });
  } catch (error) {
    console.error("Erreur envoi notification de vente:", error);
  }
}

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
  <p>Votre abonnement à <strong>${listingTitle}</strong> est actif.</p>
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
        `<a href="${l.url}" style="display:inline-block;background:#4F46E5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:4px 6px 4px 0;">${l.label}</a>`,
    )
    .join("");

  const attachList = attachments
    .map((a) => `<li style="margin:2px 0;">📎 ${a.filename}</li>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;border-radius:14px;padding:26px 30px;">
    <p style="margin:0;font-size:13px;opacity:.85;">Mission terminée ✅</p>
    <h1 style="margin:6px 0 0;font-size:22px;">${agentTitle}</h1>
  </div>
  ${summary ? `<p style="margin:20px 0 8px;line-height:1.55;">${summary}</p>` : ""}
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
