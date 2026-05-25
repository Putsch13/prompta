-- ============================================================
-- Migration 0019 — Protéger is_admin contre l'escalade de privilège
-- ============================================================

create or replace function public.protect_is_admin_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
begin
  if OLD.is_admin is distinct from NEW.is_admin then
    jwt_role := coalesce(
      current_setting('request.jwt.claims', true)::json->>'role',
      auth.role()
    );
    if jwt_role is distinct from 'service_role' then
      raise exception 'Modification de is_admin non autorisée';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists protect_is_admin on profiles;
create trigger protect_is_admin
  before update on profiles
  for each row
  execute function public.protect_is_admin_update();
