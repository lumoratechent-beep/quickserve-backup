alter table public.admin_sold_items
  add column if not exists image_url text;

alter table public.admin_quotations
  drop constraint if exists admin_quotations_status_check;

alter table public.admin_quotations
  add constraint admin_quotations_status_check
  check (status in ('draft', 'sent', 'accepted', 'paid', 'expired'));

create table if not exists public.admin_shop_orders (
  id text primary key,
  customer_name text,
  customer_email text,
  customer_phone text,
  company_name text,
  total numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  stripe_session_id text unique,
  order_data jsonb not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_sold_items_image_url_idx on public.admin_sold_items (image_url);
create index if not exists admin_shop_orders_status_idx on public.admin_shop_orders (status);
create index if not exists admin_shop_orders_stripe_session_idx on public.admin_shop_orders (stripe_session_id);
create index if not exists admin_shop_orders_updated_at_idx on public.admin_shop_orders (updated_at desc);
