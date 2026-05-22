-- Trigger : maintient search_vector à jour automatiquement
create or replace function public.update_listing_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('french', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(array_to_string(new.tags, ' '), '')), 'C');
  return new;
end;
$$;

create trigger trg_listings_search_vector
  before insert or update of title, description, tags
  on listings
  for each row
  execute function public.update_listing_search_vector();
