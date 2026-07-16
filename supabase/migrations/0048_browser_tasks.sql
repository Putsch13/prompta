-- Pilotage du navigateur (Prompta partout, phase 2)
--
-- Une étape « browser » d'un run agent dialogue avec l'extension via cette
-- file : l'orchestrateur insère une tâche (une action à exécuter dans
-- l'onglet), l'extension la récupère en pollant le statut du run, l'exécute
-- dans la page (avec la session de l'utilisateur), et poste sa réponse
-- (snapshot de la page). Accès applicatif exclusivement via service_role →
-- RLS deny-all.

create table if not exists agent_browser_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references listing_agent_runs(id) on delete cascade,
  step_index int not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'expired')),
  -- { kind: 'snapshot' } | { kind: 'act', action: { type, id?, text?, url?, dir? }, label }
  request jsonb not null,
  -- { ok, snapshot?: { url, title, text, elements[] }, declined?, error? }
  response jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists idx_browser_tasks_run_pending
  on agent_browser_tasks (run_id, created_at desc)
  where status = 'pending';

alter table agent_browser_tasks enable row level security;
