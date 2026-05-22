-- ============================================================
-- Prompta — Migration initiale
-- ============================================================

-- Profils (1:1 avec auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text not null,
  headline text,
  bio text,
  location text,
  avatar_url text,
  is_verified boolean default false,
  created_at timestamptz default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  icon text
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id),
  category_id uuid references categories(id),
  type text not null check (type in ('prompt','agent','workflow')),
  title text not null,
  slug text unique not null,
  description text,
  models text[] default '{}',
  tags text[] default '{}',
  price_cents int default 0,
  currency text default 'eur',
  status text default 'draft'
    check (status in ('draft','under_review','published','rejected')),
  current_version_id uuid,
  search_vector tsvector,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table listing_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  semver text not null,
  changelog text,
  prompt_body text,
  env jsonb,
  bundle_path text,
  created_at timestamptz default now()
);

create table stripe_accounts (
  profile_id uuid primary key references profiles(id),
  stripe_account_id text not null,
  charges_enabled boolean default false,
  payouts_enabled boolean default false
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id),
  listing_id uuid not null references listings(id),
  version_id uuid references listing_versions(id),
  amount_cents int not null,
  platform_fee_cents int not null,
  stripe_payment_intent text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  listing_id uuid not null references listings(id),
  version_id uuid references listing_versions(id),
  created_at timestamptz default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  author_id uuid not null references profiles(id),
  rating int not null check (rating between 1 and 5),
  body text,
  verified boolean default true,
  created_at timestamptz default now(),
  unique (listing_id, author_id)
);

create table follows (
  follower_id uuid references profiles(id),
  creator_id uuid references profiles(id),
  created_at timestamptz default now(),
  primary key (follower_id, creator_id)
);

create table badges (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  label text
);

create table creator_badges (
  creator_id uuid references profiles(id),
  badge_id uuid references badges(id),
  awarded_at timestamptz default now(),
  primary key (creator_id, badge_id)
);

create table partner_integrations (
  id uuid primary key default gen_random_uuid(),
  name text,
  run_url_template text,
  affiliate_param text,
  active boolean default true
);

create table moderation_flags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id),
  reason text,
  status text default 'open',
  created_at timestamptz default now()
);

-- ============================================================
-- Index full-text search
-- ============================================================
create index listings_search_idx on listings using gin (search_vector);

-- ============================================================
-- RLS — activé sur toutes les tables
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table listings enable row level security;
alter table listing_versions enable row level security;
alter table stripe_accounts enable row level security;
alter table purchases enable row level security;
alter table downloads enable row level security;
alter table reviews enable row level security;
alter table follows enable row level security;
alter table badges enable row level security;
alter table creator_badges enable row level security;
alter table partner_integrations enable row level security;
alter table moderation_flags enable row level security;

-- ============================================================
-- Politiques RLS
-- ============================================================

-- profiles: lecture publique, écriture par le propriétaire
create policy "Profiles are viewable by everyone"
  on profiles for select using (true);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- categories: lecture publique
create policy "Categories are viewable by everyone"
  on categories for select using (true);

-- listings: les publiés sont publics, brouillons/refusés visibles par le créateur
create policy "Published listings are viewable by everyone"
  on listings for select using (
    status = 'published' or creator_id = auth.uid()
  );
create policy "Creators can insert own listings"
  on listings for insert with check (creator_id = auth.uid());
create policy "Creators can update own listings"
  on listings for update using (creator_id = auth.uid());
create policy "Creators can delete own listings"
  on listings for delete using (creator_id = auth.uid());

-- listing_versions: lecture si le listing est visible
create policy "Versions viewable if listing is viewable"
  on listing_versions for select using (
    exists (
      select 1 from listings
      where listings.id = listing_versions.listing_id
        and (listings.status = 'published' or listings.creator_id = auth.uid())
    )
  );
create policy "Creators can insert versions"
  on listing_versions for insert with check (
    exists (
      select 1 from listings
      where listings.id = listing_versions.listing_id
        and listings.creator_id = auth.uid()
    )
  );

-- stripe_accounts: visible uniquement par le propriétaire
create policy "Users can view own stripe account"
  on stripe_accounts for select using (profile_id = auth.uid());
create policy "Users can manage own stripe account"
  on stripe_accounts for all using (profile_id = auth.uid());

-- purchases: visible par l'acheteur
create policy "Buyers can view own purchases"
  on purchases for select using (buyer_id = auth.uid());

-- downloads: visible par le user
create policy "Users can view own downloads"
  on downloads for select using (user_id = auth.uid());

-- reviews: lecture publique, écriture si achat/téléchargement vérifié
create policy "Reviews are viewable by everyone"
  on reviews for select using (true);
create policy "Users can insert review if purchased or downloaded"
  on reviews for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from purchases where buyer_id = auth.uid() and listing_id = reviews.listing_id
      union all
      select 1 from downloads where user_id = auth.uid() and listing_id = reviews.listing_id
    )
  );

-- follows: lecture publique, gestion par le follower
create policy "Follows are viewable by everyone"
  on follows for select using (true);
create policy "Users can manage own follows"
  on follows for insert with check (follower_id = auth.uid());
create policy "Users can unfollow"
  on follows for delete using (follower_id = auth.uid());

-- badges / creator_badges: lecture publique
create policy "Badges are viewable by everyone"
  on badges for select using (true);
create policy "Creator badges are viewable by everyone"
  on creator_badges for select using (true);

-- partner_integrations: lecture publique (actifs)
create policy "Active partners are viewable"
  on partner_integrations for select using (active = true);

-- moderation_flags: insertion par les users authentifiés
create policy "Authenticated users can flag content"
  on moderation_flags for insert with check (auth.uid() is not null);
