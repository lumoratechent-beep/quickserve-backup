-- Revert the experimental Back Office daily sales helper. The dashboard has
-- returned to querying raw order data for its selected period.

DROP TRIGGER IF EXISTS trg_sync_restaurant_sales_daily ON public.orders;
DROP FUNCTION IF EXISTS public.sync_restaurant_sales_daily_from_order();
DROP FUNCTION IF EXISTS public.rebuild_restaurant_sales_daily(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.refresh_restaurant_sales_day(UUID, DATE);
DROP FUNCTION IF EXISTS public.normalize_order_items(JSONB);
DROP FUNCTION IF EXISTS public.get_restaurant_business_timezone(UUID);
DROP TABLE IF EXISTS public.restaurant_sales_daily;
