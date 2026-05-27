-- 0036 — Pin version abonnés + bucket Storage agent-deliverables

alter table subscriptions
  add column if not exists pinned_version_id uuid references listing_versions(id) on delete set null;

create index if not exists idx_subscriptions_pinned_version
  on subscriptions(pinned_version_id)
  where pinned_version_id is not null;

comment on column subscriptions.pinned_version_id is
  'Version agent figée à la souscription ; les abonnés exécutent cette version tant qu''ils restent actifs.';

-- Backfill : abonnements actifs sans pin → version courante du listing
update subscriptions s
set pinned_version_id = l.current_version_id
from listings l
where s.listing_id = l.id
  and s.status = 'active'
  and s.pinned_version_id is null
  and l.current_version_id is not null;

-- Bucket pour livrables agent (> 256 Ko)
insert into storage.buckets (id, name, public)
values ('agent-deliverables', 'agent-deliverables', false)
on conflict (id) do nothing;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'agent_deliverables_storage_read'
  ) then
    create policy "agent_deliverables_storage_read"
      on storage.objects for select
      using (
        bucket_id = 'agent-deliverables'
        and exists (
          select 1 from agent_deliverables d
          join listing_agent_runs r on r.id = d.run_id
          where d.storage_path = name
            and r.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'agent_deliverables_storage_service'
  ) then
    create policy "agent_deliverables_storage_service"
      on storage.objects for insert
      with check (bucket_id = 'agent-deliverables');
  end if;
end $$;
