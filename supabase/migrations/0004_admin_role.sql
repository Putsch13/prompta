-- ============================================================
-- Migration 0004 — Rôle admin et RLS modération
-- ============================================================

-- Ajouter la colonne is_admin sur profiles
alter table profiles add column if not exists is_admin boolean default false;

-- Ajouter une colonne reason_rejected sur listings pour stocker le motif de refus
alter table listings add column if not exists reason_rejected text;

-- Ajouter une colonne flagged_by sur moderation_flags pour tracer qui a signalé
alter table moderation_flags add column if not exists flagged_by uuid references profiles(id);

-- Ajouter une colonne resolved_by et resolved_at sur moderation_flags
alter table moderation_flags add column if not exists resolved_by uuid references profiles(id);
alter table moderation_flags add column if not exists resolved_at timestamptz;

-- Ajouter une colonne content_flags sur listings pour stocker les flags de scan de contenu
alter table listings add column if not exists content_flags jsonb default '[]'::jsonb;

-- ============================================================
-- RLS pour modération — seuls les admins peuvent gérer
-- ============================================================

-- Politique pour que les admins puissent voir TOUS les listings (y compris under_review)
create policy "Admins can view all listings"
  on listings for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- Politique pour que les admins puissent mettre à jour tous les listings
create policy "Admins can update all listings"
  on listings for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- Politique pour que les admins puissent lire tous les moderation_flags
create policy "Admins can view all moderation flags"
  on moderation_flags for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- Politique pour que les admins puissent mettre à jour les moderation_flags
create policy "Admins can update moderation flags"
  on moderation_flags for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- ============================================================
-- Index pour améliorer les performances des requêtes admin
-- ============================================================
create index if not exists listings_status_idx on listings(status);
create index if not exists moderation_flags_status_idx on moderation_flags(status);
create index if not exists profiles_is_admin_idx on profiles(is_admin) where is_admin = true;
