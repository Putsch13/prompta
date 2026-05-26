-- Documents utilisateur réutilisables par les agents
create table if not exists user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists user_documents_user_idx on user_documents (user_id, created_at desc);

alter table user_documents enable row level security;

create policy "user_documents_own_read"
  on user_documents for select using (auth.uid() = user_id);

create policy "user_documents_own_insert"
  on user_documents for insert with check (auth.uid() = user_id);

create policy "user_documents_own_delete"
  on user_documents for delete using (auth.uid() = user_id);

-- Bucket storage (à créer dans Supabase Storage si absent : user-documents)
insert into storage.buckets (id, name, public)
values ('user-documents', 'user-documents', false)
on conflict (id) do nothing;

create policy "user_documents_storage_read"
  on storage.objects for select
  using (bucket_id = 'user-documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "user_documents_storage_insert"
  on storage.objects for insert
  with check (bucket_id = 'user-documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "user_documents_storage_delete"
  on storage.objects for delete
  using (bucket_id = 'user-documents' and auth.uid()::text = (storage.foldername(name))[1]);
