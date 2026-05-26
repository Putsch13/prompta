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
