-- Hébergement builder + mode provisioning agent
alter table listings
  add column if not exists hosting_fee_cents int not null default 0,
  add column if not exists provisioning_mode text not null default 'manual'
    check (provisioning_mode in ('manual', 'assisted', 'managed'));

comment on column listings.hosting_fee_cents is
  'Frais mensuels d''hébergement Prompta (centimes EUR) pour agents/workflows actifs';
comment on column listings.provisioning_mode is
  'manual = user configure tout | assisted = agent aide | managed = agent crée les ressources';
