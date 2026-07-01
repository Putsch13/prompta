import { defineConfig, globalIgnores } from "eslint/config";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Next 16 a retiré `next lint` : ESLint est invoqué directement (flat config),
// avec les presets Next exportés nativement en flat par eslint-config-next@16.
export default defineConfig([
  ...coreWebVitals,
  ...typescript,
  {
    // Nouvelles règles « React Compiler » de react-hooks v6 (arrivées avec
    // eslint-config-next@16) : en warning le temps de refactorer les ~40
    // patterns préexistants (fetch dans useEffect, etc.) — pas des régressions.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // Dossiers que `next lint` ne couvrait pas avant la migration.
    files: ["tests/**", "scripts/**", "worker/**", "e2e/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
]);
