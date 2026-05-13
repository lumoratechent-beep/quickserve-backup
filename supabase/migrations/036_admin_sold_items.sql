create table if not exists public.admin_sold_items (
  id text primary key,
  name text not null,
  sku text,
  description text,
  price numeric not null default 0,
  cost_price numeric not null default 0,
  category text,
  is_active boolean not null default true,
  item_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_sold_items_name_idx on public.admin_sold_items (name);
create index if not exists admin_sold_items_sku_idx on public.admin_sold_items (sku);
create index if not exists admin_sold_items_updated_at_idx on public.admin_sold_items (updated_at desc);
