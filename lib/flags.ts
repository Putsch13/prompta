/**
 * Feature flags pilotés par les variables d'environnement.
 */

export type B2BLandingMode = "hidden" | "teaser" | "full";

/**
 * Mode d'affichage de la section B2B sur la landing page.
 * - "hidden" : section masquée (défaut)
 * - "teaser" : pitch court + badge "Bientôt" + capture d'email
 * - "full" : section complète avec lien vers /teams
 */
export const B2B_LANDING_MODE: B2BLandingMode =
  (process.env.NEXT_PUBLIC_B2B_LANDING_MODE as B2BLandingMode) || "hidden";
