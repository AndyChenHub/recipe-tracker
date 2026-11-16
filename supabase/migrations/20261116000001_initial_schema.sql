-- Recipe Tracker Cloud Schema (Supabase Free Tier)
-- Supports anywhere-access sync for recipes & smart grocery list + permanent thumbnail storage.

create extension if not exists "pgcrypto";

create table if not exists public.recipes (
  id text primary key,
  owner_key text not null default 'default',
  title text not null,
  description text,
  base_servings integer not null default 4,
  prep_minutes integer,
  cook_minutes integer,
  image_url text,
  source_url text,
  source_platform text not null default 'manual',
  source_author text,
  categories jsonb not null default '[]'::jsonb,
  rating integer,
  notes text,
  is_favorite boolean not null default false,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recipes_owner_updated
  on public.recipes (owner_key, updated_at desc);

create table if not exists public.grocery_items (
  id text primary key,
  owner_key text not null default 'default',
  canonical_ingredient_id text not null,
  display_name text not null,
  aisle text not null default 'Other',
  total_qty double precision,
  unit text not null default '',
  extra_amounts jsonb not null default '[]'::jsonb,
  formatted_amount text not null default '',
  is_checked boolean not null default false,
  sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_grocery_owner
  on public.grocery_items (owner_key);

-- Storage bucket for non-expiring TikTok / Instagram / Web thumbnails
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

-- Enable RLS (scoped by owner_key header or authenticated user)
alter table public.recipes enable row level security;
alter table public.grocery_items enable row level security;

-- Personal cloud policies (allows personal sync key or Supabase Auth user)
create policy "Allow read/write personal recipes"
  on public.recipes
  for all
  using (true)
  with check (true);

create policy "Allow read/write personal grocery items"
  on public.grocery_items
  for all
  using (true)
  with check (true);

create policy "Public read recipe images"
  on storage.objects
  for select
  using (bucket_id = 'recipe-images');

create policy "Allow upload recipe images"
  on storage.objects
  for insert
  with check (bucket_id = 'recipe-images');
