-- Trigger : crée automatiquement une ligne profiles à l'inscription
-- Le username par défaut est un slug dérivé de l'email (modifiable ensuite dans l'onboarding)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  base_username text;
  final_username text;
  counter int := 0;
begin
  base_username := split_part(new.email, '@', 1);
  base_username := regexp_replace(base_username, '[^a-z0-9]', '', 'g');

  if length(base_username) < 3 then
    base_username := 'user' || substr(new.id::text, 1, 8);
  end if;

  final_username := base_username;

  loop
    begin
      insert into public.profiles (id, username, display_name, avatar_url)
      values (
        new.id,
        final_username,
        coalesce(new.raw_user_meta_data ->> 'full_name', final_username),
        new.raw_user_meta_data ->> 'avatar_url'
      );
      return new;
    exception when unique_violation then
      counter := counter + 1;
      final_username := base_username || counter::text;
    end;
  end loop;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
