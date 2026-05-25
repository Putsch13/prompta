-- ============================================================
-- Migration 0011 — Abonnements agents
-- ============================================================

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  unique (user_id, listing_id)
);

alter table listings add column if not exists subscription_price_cents int default 0;
alter table listings add column if not exists pricing_mode text default 'one_time'
  check (pricing_mode in ('free', 'one_time', 'subscription'));

alter table subscriptions enable row level security;

create policy "Users read own subscriptions"
  on subscriptions for select using (auth.uid() = user_id);

create index idx_subscriptions_user on subscriptions(user_id);
create index idx_subscriptions_listing on subscriptions(listing_id);
create index idx_subscriptions_stripe on subscriptions(stripe_subscription_id);
