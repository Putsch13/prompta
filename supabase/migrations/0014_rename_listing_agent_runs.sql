-- Renomme agent_runs (runtime utilisateur, migration 0010)
-- pour libérer le nom agent_runs pour le système admin/agents.

alter table if exists agent_runs rename to listing_agent_runs;

drop policy if exists "Users read own agent runs" on listing_agent_runs;

create policy "Users read own listing agent runs"
  on listing_agent_runs for select using (auth.uid() = user_id);
