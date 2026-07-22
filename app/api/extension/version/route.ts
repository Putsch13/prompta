import { NextResponse } from "next/server";
import manifest from "@/extension/manifest.json";

export const dynamic = "force-static";

/**
 * Version courante de l'extension (celle du ZIP servi par ce déploiement).
 * L'extension la compare à la sienne pour afficher « mise à jour disponible »
 * — indispensable tant que l'installation se fait hors Chrome Web Store
 * (un ZIP en mode développeur ne s'auto-met jamais à jour).
 */
export async function GET() {
  return NextResponse.json(
    { version: (manifest as { version: string }).version },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
