-- Migration: Ajoute is_seed sur profiles et reviews pour distinguer le contenu de démo
-- ⚠️ Uniquement pour environnements de staging/démo

alter table profiles
  add column if not exists is_seed boolean default false;

alter table reviews
  add column if not exists is_seed boolean default false;

create index if not exists idx_profiles_is_seed on profiles(is_seed) where is_seed = true;
create index if not exists idx_reviews_is_seed on reviews(is_seed) where is_seed = true;

comment on column profiles.is_seed is 'True si ce profil a été créé par le script de seed (démo)';
comment on column reviews.is_seed is 'True si cet avis a été créé par le script de seed (démo)';
