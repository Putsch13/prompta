-- ============================================================
-- Migration 0005 — Ajout du montant de TVA aux achats
-- ============================================================

-- Ajouter la colonne tax_cents sur purchases
alter table purchases add column if not exists tax_cents int default 0;

-- Ajouter une colonne stripe_checkout_session pour tracer la session Stripe
alter table purchases add column if not exists stripe_checkout_session text;
