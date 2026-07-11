alter table if exists public.admin_quotations
  drop constraint if exists admin_quotations_status_check;

alter table if exists public.admin_quotations
  add constraint admin_quotations_status_check
  check (status in ('draft', 'sent', 'accepted', 'paid', 'expired'));
