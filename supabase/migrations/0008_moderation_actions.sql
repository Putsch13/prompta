-- ============================================================
-- Migration 0008 — Journal d'audit modération
-- ============================================================

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id),
  listing_id uuid references listings(id) on delete set null,
  flag_id uuid references moderation_flags(id) on delete set null,
  action text not null check (action in ('approve', 'reject', 'resolve', 'suspend', 'takedown')),
  reason text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_moderation_actions_admin on moderation_actions(admin_id);
create index idx_moderation_actions_listing on moderation_actions(listing_id);
create index idx_moderation_actions_created on moderation_actions(created_at desc);

alter table moderation_actions enable row level security;

create policy "Admins can read moderation actions"
  on moderation_actions for select
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Admins can insert moderation actions"
  on moderation_actions for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
