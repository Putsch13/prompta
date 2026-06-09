-- 0041 — Détail d'erreur structuré par step (P0-3)
-- Permet d'exposer dans la page détail run : outil/action, params masqués,
-- erreur provider brute (sans secrets). Aucun secret n'est stocké (redaction
-- côté applicatif dans lib/agent/step-logger.ts).

alter table listing_agent_run_steps
  add column if not exists error_detail jsonb;

comment on column listing_agent_run_steps.error_detail is
  'Détail structuré de l''erreur (toolSlug, actionSlug, params masqués, erreur provider) — secrets retirés côté app.';
