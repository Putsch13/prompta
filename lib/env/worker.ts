/**
 * Validation des variables d'environnement au boot du worker.
 * Ne log JAMAIS les valeurs, uniquement présence/absence.
 */

interface EnvCheck {
  key: string;
  required: boolean;
  label: string;
}

const WORKER_ENV_CHECKS: EnvCheck[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, label: "Supabase URL" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: true, label: "Service role" },
  { key: "ENCRYPTION_KEY", required: true, label: "Encryption key" },
  { key: "COMPOSIO_API_KEY", required: false, label: "Composio" },
  { key: "PLATFORM_OPENAI_KEY", required: false, label: "Platform OpenAI" },
  { key: "PLATFORM_ANTHROPIC_KEY", required: false, label: "Platform Anthropic" },
  { key: "PLATFORM_GOOGLE_KEY", required: false, label: "Platform Google" },
  { key: "PLATFORM_MISTRAL_KEY", required: false, label: "Platform Mistral" },
  { key: "PLATFORM_SERPER_KEY", required: false, label: "Serper" },
  { key: "ANTHROPIC_API_KEY", required: false, label: "Anthropic (admin agents)" },
  { key: "E2B_API_KEY", required: false, label: "E2B sandbox" },
  { key: "AGENT_MODEL", required: false, label: "Agent model override" },
  { key: "PLATFORM_DAILY_COST_CAP_CENTS", required: false, label: "Daily cost cap" },
  { key: "NEXT_PUBLIC_APP_URL", required: false, label: "App URL" },
  { key: "CRON_SECRET", required: false, label: "Cron secret" },
];

export interface WorkerEnvStatus {
  ok: boolean;
  missing: string[];
  enabled: Record<string, boolean>;
}

export function validateWorkerEnv(): WorkerEnvStatus {
  const missing: string[] = [];
  const enabled: Record<string, boolean> = {};

  for (const check of WORKER_ENV_CHECKS) {
    const present = !!process.env[check.key];
    enabled[check.key] = present;

    if (check.required && !present) {
      missing.push(check.key);
    }

    const status = present ? "OK" : check.required ? "MISSING" : "not set";
    console.info(`[worker:env] ${check.label}: ${status}`);
  }

  const ok = missing.length === 0;

  if (ok) {
    console.info("[worker:boot] Environment OK — all required vars present");
  } else {
    console.error("[worker:boot] FATAL — missing required env vars:", missing.join(", "));
  }

  return { ok, missing, enabled };
}
