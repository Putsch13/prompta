-- ============================================================
--  Prompta — Migration 0004 : Admin & Agents
--  À exécuter dans Supabase > SQL Editor APRÈS 0001/0002/0003
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  0. Extensions de tables existantes
-- ────────────────────────────────────────────────────────────

-- Drapeau admin (toi) et drapeau persona (comptes générés par l'agent)
alter table profiles add column if not exists is_admin   boolean not null default false;
alter table profiles add column if not exists is_persona boolean not null default false;

-- ────────────────────────────────────────────────────────────
--  1. PERSONAS — les pseudos utilisés par les agents (max 150)
-- ────────────────────────────────────────────────────────────
create table if not exists personas (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references profiles(id) on delete set null, -- compte réel lié
  username      text unique not null,
  display_name  text not null,
  email         text unique not null,
  specialty     text not null,
  tone          text not null,
  language      text not null default 'fr',
  is_active     boolean not null default true,
  daily_quota   int not null default 2,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists personas_active_idx on personas (is_active, last_used_at);

-- ────────────────────────────────────────────────────────────
--  2. AGENT_DEFINITIONS — les 7 agents et leur config
-- ────────────────────────────────────────────────────────────
create table if not exists agent_definitions (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,        -- 'prompt_factory', 'linkedin_publisher'...
  name            text not null,
  description     text,
  is_enabled      boolean not null default false,  -- OFF par défaut = sécurité
  requires_review boolean not null default true,   -- sortie validée par toi avant publication
  max_runs_per_day int not null default 1,
  config          jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
--  3. AGENT_SCHEDULES — "les soirs travaillés"
--     Quels jours / heures chaque agent tourne
-- ────────────────────────────────────────────────────────────
create table if not exists agent_schedules (
  id          uuid primary key default gen_random_uuid(),
  agent_slug  text not null references agent_definitions(slug) on delete cascade,
  -- jours actifs : 0=dimanche … 6=samedi
  days        int[] not null default '{1,2,3,4,5}',
  -- heures actives (0-23), ex: {19,20,21} pour les soirs
  hours       int[] not null default '{20}',
  is_enabled  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists agent_schedules_slug_idx on agent_schedules (agent_slug, is_enabled);

-- ────────────────────────────────────────────────────────────
--  4. AGENT_BUDGET — garde-fou financier (UNE seule ligne)
--     L'agent vérifie ce budget AVANT chaque appel API
-- ────────────────────────────────────────────────────────────
create table if not exists agent_budget (
  id                  int primary key default 1 check (id = 1),
  daily_cap_usd       numeric(10,2) not null default 2.00,
  monthly_cap_usd     numeric(10,2) not null default 30.00,
  daily_spent_usd     numeric(10,4) not null default 0,
  monthly_spent_usd   numeric(10,4) not null default 0,
  daily_reset_date    date not null default current_date,
  monthly_reset_month text not null default to_char(current_date,'YYYY-MM'),
  is_paused           boolean not null default false,  -- coupe-circuit global
  updated_at          timestamptz not null default now()
);
insert into agent_budget (id) values (1) on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────
--  5. AGENT_RUNS — chaque exécution d'agent + coût
-- ────────────────────────────────────────────────────────────
create table if not exists agent_runs (
  id              uuid primary key default gen_random_uuid(),
  agent_slug      text not null,
  trigger         text not null default 'cron',  -- cron | manual
  status          text not null default 'running', -- running | done | failed | blocked
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  cost_usd        numeric(10,4) not null default 0,
  items_produced  int not null default 0,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists agent_runs_idx on agent_runs (agent_slug, started_at desc);

-- ────────────────────────────────────────────────────────────
--  6. AGENT_OUTPUTS — ce que les agents produisent (file de validation)
--     Rien n'est publié tant que tu n'as pas approuvé.
-- ────────────────────────────────────────────────────────────
create table if not exists agent_outputs (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references agent_runs(id) on delete cascade,
  agent_slug    text not null,
  kind          text not null,        -- 'prompt' | 'linkedin_post' | 'blog_article' | 'email'...
  status        text not null default 'pending', -- pending | approved | rejected | published
  title         text,
  payload       jsonb not null,       -- contenu complet (variable selon kind)
  quality_score int,
  reviewed_by   uuid references profiles(id),
  reviewed_at   timestamptz,
  published_ref uuid,                 -- id du listing/post créé après publication
  created_at    timestamptz not null default now()
);
create index if not exists agent_outputs_status_idx on agent_outputs (status, agent_slug, created_at desc);

-- ────────────────────────────────────────────────────────────
--  7. AGENT_LOGS — journal d'exécution
-- ────────────────────────────────────────────────────────────
create table if not exists agent_logs (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references agent_runs(id) on delete cascade,
  agent_slug  text not null,
  level       text not null default 'info', -- info | warn | error
  message     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists agent_logs_run_idx on agent_logs (run_id, created_at);

-- ────────────────────────────────────────────────────────────
--  8. KPI_SNAPSHOTS — photo quotidienne des indicateurs
-- ────────────────────────────────────────────────────────────
create table if not exists kpi_snapshots (
  day               date primary key default current_date,
  total_users       int not null default 0,
  total_listings    int not null default 0,
  published_listings int not null default 0,
  total_purchases   int not null default 0,
  revenue_cents     bigint not null default 0,
  platform_fee_cents bigint not null default 0,
  total_downloads   int not null default 0,
  new_signups       int not null default 0,
  created_at        timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
--  9. VUE KPI live — calculée à la volée pour le dashboard
-- ────────────────────────────────────────────────────────────
create or replace view admin_kpis as
select
  (select count(*) from profiles where is_persona = false)              as total_users,
  (select count(*) from profiles where is_persona = false
     and created_at > now() - interval '7 days')                        as new_users_7d,
  (select count(*) from listings)                                       as total_listings,
  (select count(*) from listings where status = 'published')            as published_listings,
  (select count(*) from listings where status = 'under_review')         as listings_pending,
  (select count(*) from purchases where status = 'completed')           as total_purchases,
  (select coalesce(sum(amount_cents),0) from purchases
     where status = 'completed')                                        as gross_revenue_cents,
  (select coalesce(sum(platform_fee_cents),0) from purchases
     where status = 'completed')                                        as platform_revenue_cents,
  (select coalesce(sum(amount_cents),0) from purchases
     where status = 'completed'
     and created_at > now() - interval '30 days')                       as revenue_30d_cents,
  (select count(*) from downloads)                                      as total_downloads,
  (select coalesce(round(avg(rating),2),0) from reviews)                as avg_rating,
  (select count(*) from agent_outputs where status = 'pending')         as outputs_awaiting_review;

-- ────────────────────────────────────────────────────────────
--  10. SEED — les 7 agents (désactivés par défaut)
-- ────────────────────────────────────────────────────────────
insert into agent_definitions (slug, name, description, requires_review, max_runs_per_day) values
  ('prompt_factory',     'Prompt Factory',     'Génère des prompts gratuits et payants sous différents pseudos', true, 4),
  ('linkedin_publisher', 'LinkedIn Publisher', 'Rédige des posts LinkedIn pour promouvoir Prompta',              true, 2),
  ('seo_content',        'SEO Content',        'Génère des articles de blog optimisés SEO',                      true, 1),
  ('moderation',         'Modération',         'Vérifie la qualité et détecte les contenus problématiques',      false, 24),
  ('email_crm',          'Email & CRM',        'Prépare les séquences email de rétention',                       true, 1),
  ('analytics_pricing',  'Analytics & Pricing','Analyse les ventes et suggère des ajustements de prix',          true, 1),
  ('affiliate',          'Affiliate',          'Rédige des messages de partenariat pour créateurs externes',     true, 1)
on conflict (slug) do nothing;

-- Schedules par défaut (désactivés)
insert into agent_schedules (agent_slug, days, hours, is_enabled)
select slug, '{1,2,3,4,5}', '{20}', false from agent_definitions
on conflict do nothing;

-- ────────────────────────────────────────────────────────────
--  11. RLS — TOUT est verrouillé : service_role uniquement
--      sauf lecture pour les admins
-- ────────────────────────────────────────────────────────────
alter table personas          enable row level security;
alter table agent_definitions enable row level security;
alter table agent_schedules   enable row level security;
alter table agent_budget      enable row level security;
alter table agent_runs        enable row level security;
alter table agent_outputs     enable row level security;
alter table agent_logs        enable row level security;
alter table kpi_snapshots     enable row level security;

-- Helper : l'utilisateur courant est-il admin ?
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- Les admins peuvent TOUT lire ; seul le service_role écrit
do $$
declare t text;
begin
  foreach t in array array[
    'personas','agent_definitions','agent_schedules','agent_budget',
    'agent_runs','agent_outputs','agent_logs','kpi_snapshots'
  ]
  loop
    execute format(
      'create policy "admin_read_%1$s" on %1$s for select using (public.is_admin());', t
    );
    execute format(
      'create policy "admin_write_%1$s" on %1$s for all using (public.is_admin()) with check (public.is_admin());', t
    );
  end loop;
end $$;

-- ============================================================
--  APRÈS LA MIGRATION : passe-toi admin avec ton vrai user id
--  update profiles set is_admin = true where username = 'TON_USERNAME';
-- ============================================================
