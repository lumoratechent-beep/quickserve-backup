create table if not exists public.admin_quotations (
  id text primary key,
  quote_no text not null,
  customer_name text,
  company_name text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'expired')),
  total numeric not null default 0,
  quote_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_quotations_status_idx on public.admin_quotations (status);
create index if not exists admin_quotations_updated_at_idx on public.admin_quotations (updated_at desc);
