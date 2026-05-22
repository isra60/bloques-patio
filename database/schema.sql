create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  name text not null,
  source_sheet text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.variants (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  name text not null,
  raw_header text,
  stock_pallets numeric not null default 0,
  stock_date date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references public.variants(id) on delete cascade,
  commercial text not null check (commercial in ('JESUS', 'FERNANDO')),
  customer text not null,
  pallets numeric not null check (pallets > 0),
  notes text,
  source_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists variants_set_updated_at on public.variants;
create trigger variants_set_updated_at
before update on public.variants
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.orders enable row level security;

drop policy if exists "shared read products" on public.products;
create policy "shared read products" on public.products
for select to authenticated using (true);

drop policy if exists "shared write products" on public.products;
create policy "shared write products" on public.products
for all to authenticated using (true) with check (true);

drop policy if exists "shared read variants" on public.variants;
create policy "shared read variants" on public.variants
for select to authenticated using (true);

drop policy if exists "shared write variants" on public.variants;
create policy "shared write variants" on public.variants
for all to authenticated using (true) with check (true);

drop policy if exists "shared read orders" on public.orders;
create policy "shared read orders" on public.orders
for select to authenticated using (true);

drop policy if exists "shared write orders" on public.orders;
create policy "shared write orders" on public.orders
for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'variants'
  ) then
    alter publication supabase_realtime add table public.variants;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
