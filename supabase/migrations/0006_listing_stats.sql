-- ============================================================
-- Migration 0006 — Vue listing_stats pour agrégation des métriques
-- ============================================================

-- Créer la vue listing_stats qui agrège les métriques par listing
create or replace view listing_stats as
select
  l.id as listing_id,
  l.slug,
  l.title,
  l.type,
  l.description,
  l.price_cents,
  l.currency,
  l.status,
  l.creator_id,
  l.category_id,
  l.models,
  l.tags,
  l.created_at,
  l.updated_at,
  coalesce(r.avg_rating, 0) as avg_rating,
  coalesce(r.review_count, 0) as review_count,
  coalesce(d.download_count, 0) as download_count
from listings l
left join (
  select
    listing_id,
    avg(rating)::numeric(2,1) as avg_rating,
    count(*) as review_count
  from reviews
  group by listing_id
) r on r.listing_id = l.id
left join (
  select
    listing_id,
    count(*) as download_count
  from downloads
  group by listing_id
) d on d.listing_id = l.id;

-- Donner accès à la vue au rôle anon et authenticated
grant select on listing_stats to anon;
grant select on listing_stats to authenticated;
