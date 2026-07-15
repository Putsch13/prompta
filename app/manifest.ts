import type { MetadataRoute } from "next";

/**
 * Manifeste PWA : permet « Ajouter à l'écran d'accueil » sur mobile. L'appli
 * s'ouvre directement sur /quick (la barre de commande Prompta autonome).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prompta — IA du quotidien",
    short_name: "Prompta",
    description: "Décris une mission, Prompta crée l'agent et l'exécute.",
    start_url: "/quick",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/prompta-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/prompta-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
