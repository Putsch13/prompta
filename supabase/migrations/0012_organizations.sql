-- ============================================================
-- Migration 0012 — Organisations B2B
-- ============================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  stripe_customer_id text,
  seat_limit int default 10,
  plan text default 'starter' check (plan in ('starter', 'team', 'scale')),
  created_at timestamptz default now()
);

create table org_members (
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'reader' check (role in ('admin', 'editor', 'reader')),
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);

create table org_listings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_listing_id uuid references listings(id) on delete set null,
  title text not null,
  type text not null check (type in ('prompt', 'agent', 'workflow')),
  status text default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'archived')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table org_api_keys add constraint org_api_keys_org_fkey
  foreign key (org_id) references organizations(id) on delete cascade;

alter table organizations enable row level security;
alter table org_members enable row level security;
alter table org_listings enable row level security;

create policy "Members read own org"
  on organizations for select
  using (exists (
    select 1 from org_members where org_id = organizations.id and user_id = auth.uid()
  ));

create policy "Members read org membership"
  on org_members for select
  using (user_id = auth.uid() or exists (
    select 1 from org_members om where om.org_id = org_members.org_id and om.user_id = auth.uid()
  ));

create policy "Members read org listings"
  on org_listings for select
  using (exists (
    select 1 from org_members where org_id = org_listings.org_id and user_id = auth.uid()
  ));

create index idx_org_members_user on org_members(user_id);
