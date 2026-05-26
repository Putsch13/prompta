-- Compte admin sans restriction (tokens, crédits, rate limits)
alter table profiles
  add column if not exists unrestricted_usage boolean not null default false;

comment on column profiles.unrestricted_usage is
  'Bypass quotas crédits, rate limits et plafonds tokens pour ce compte';

-- Promouvoir puccini.f13@gmail.com si le compte existe déjà
do $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = 'puccini.f13@gmail.com' limit 1;
  if uid is not null then
    update public.profiles
    set is_admin = true, unrestricted_usage = true
    where id = uid;
  end if;
end $$;
