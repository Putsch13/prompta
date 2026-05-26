-- 0028 — Table de logs step-by-step pour debug agent
-- Chaque step d'un run agent produit une entrée avec input/output/erreur/durée.

create table if not exists listing_agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references listing_agent_runs(id) on delete cascade,
  step_index integer not null,
  step_id text,
  step_type text not null,
  label text,
  status text not null check (status in ('pending', 'running', 'success', 'failed', 'skipped')),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  input_preview jsonb,
  output_preview jsonb,
  error_code text,
  error_message text,
  provider text,
  model text,
  tool_slug text,
  action_slug text,
  usage jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_run_steps_run_id on listing_agent_run_steps(run_id, step_index);

alter table listing_agent_run_steps enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'listing_agent_run_steps'
      and policyname = 'Users read own run steps'
  ) then
    create policy "Users read own run steps"
      on listing_agent_run_steps for select
      using (
        exists (
          select 1 from listing_agent_runs r
          where r.id = listing_agent_run_steps.run_id
            and r.user_id = auth.uid()
        )
      );
  end if;
end $$;

comment on table listing_agent_run_steps is 'Logs step-by-step des runs agent pour debug et timeline UI';
