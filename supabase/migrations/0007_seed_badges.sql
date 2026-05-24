-- ============================================================
-- Migration 0007 — Seed des badges de base
-- ============================================================

-- Insérer les badges de base s'ils n'existent pas
insert into badges (slug, label) values
  ('verified', 'Vérifié'),
  ('downloads_1k', '1K+ Téléchargements'),
  ('downloads_10k', '10K+ Téléchargements'),
  ('downloads_100k', '100K+ Téléchargements'),
  ('top_1pct_category', 'Top 1% Catégorie'),
  ('early_adopter', 'Early Adopter'),
  ('top_seller', 'Top Vendeur')
on conflict (slug) do nothing;
