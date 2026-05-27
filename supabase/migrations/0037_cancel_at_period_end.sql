-- 0037 — Annulation fin de période Stripe + sécurité status listings (prod déjà sur 0034 sans CHECK)

alter table listings drop constraint if exists listings_status_check;

alter table listings add constraint listings_status_check
  check (status in (
    'draft',
    'under_review',
    'published',
    'rejected',
    'deleted',
    'archived'
  ));

alter table subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_requested_at timestamptz;

alter table platform_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_requested_at timestamptz;

comment on column subscriptions.cancel_at_period_end is 'Stripe cancel_at_period_end — accès conservé jusqu''à current_period_end';
comment on column subscriptions.cancel_requested_at is 'Date de la demande d''annulation par l''utilisateur';
comment on column platform_subscriptions.cancel_at_period_end is 'Stripe cancel_at_period_end pour Prompta Pro';
comment on column platform_subscriptions.cancel_requested_at is 'Date de la demande d''annulation Pro';
