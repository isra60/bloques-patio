drop table if exists orders;
drop table if exists variants;
drop table if exists products;

create table products (
  id text primary key,
  name text not null,
  source_sheet text,
  position integer not null default 0,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table variants (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  name text not null,
  raw_header text,
  stock_pallets real not null default 0,
  stock_date text,
  position integer not null default 0,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table orders (
  id text primary key,
  variant_id text not null references variants(id) on delete cascade,
  commercial text not null check (commercial in ('JESUS', 'FERNANDO')),
  customer text not null,
  pallets real not null check (pallets > 0),
  notes text,
  source_key text unique,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index orders_variant_id_idx on orders(variant_id);
create index variants_product_id_idx on variants(product_id);

pragma foreign_keys = on;

