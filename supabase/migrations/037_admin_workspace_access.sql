-- Admin quotation/shop data is used through the app's custom login flow,
-- so the browser uses the public anon Supabase client instead of Supabase Auth.
-- Keep access explicit and consistent with the other app-managed tables.

alter table public.admin_quotations enable row level security;
alter table public.admin_sold_items enable row level security;

drop policy if exists "admin_quotations_all" on public.admin_quotations;
create policy "admin_quotations_all"
on public.admin_quotations
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "admin_sold_items_all" on public.admin_sold_items;
create policy "admin_sold_items_all"
on public.admin_sold_items
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.admin_quotations to anon, authenticated;
grant select, insert, update, delete on public.admin_sold_items to anon, authenticated;
