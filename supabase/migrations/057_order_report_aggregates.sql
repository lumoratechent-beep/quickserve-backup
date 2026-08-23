-- Keep admin reporting bounded: aggregate inside Postgres instead of returning
-- every matching order to the API/browser.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_orders_timestamp_desc
  ON public.orders (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_timestamp_desc
  ON public.orders (restaurant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_orders_location_timestamp_desc
  ON public.orders (location_name, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_timestamp_desc
  ON public.orders (status, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_orders_updated_at_id
  ON public.orders (updated_at, id);

CREATE INDEX IF NOT EXISTS idx_orders_id_trgm
  ON public.orders USING gin (id gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.get_order_report_summary(
  p_start_timestamp BIGINT DEFAULT NULL,
  p_end_timestamp BIGINT DEFAULT NULL,
  p_restaurant_id UUID DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_include_breakdowns BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
SET statement_timeout = '15s'
AS $$
  WITH base AS (
    SELECT total, status, payment_method, cashier_name
    FROM public.orders
    WHERE (p_start_timestamp IS NULL OR timestamp >= p_start_timestamp)
      AND (p_end_timestamp IS NULL OR timestamp <= p_end_timestamp)
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
      AND (p_location_name IS NULL OR location_name = p_location_name)
      AND (p_search IS NULL OR id ILIKE '%' || p_search || '%')
  ),
  filtered AS (
    SELECT * FROM base WHERE p_status IS NULL OR status = p_status
  ),
  headline AS (
    SELECT
      COALESCE(SUM(total) FILTER (WHERE status = 'COMPLETED'), 0)::NUMERIC AS total_revenue,
      COUNT(*)::BIGINT AS order_volume
    FROM filtered
  ),
  health AS (
    -- Completion rate intentionally ignores the status selector; otherwise a
    -- COMPLETED filter always reports 100% and a PENDING filter always 0%.
    SELECT ROUND(
      100.0 * COUNT(*) FILTER (WHERE status = 'COMPLETED') / NULLIF(COUNT(*), 0)
    )::INTEGER AS efficiency
    FROM base
  ),
  transactions AS (
    SELECT COALESCE(payment_method, '-') AS name, COUNT(*)::BIGINT AS count,
      COALESCE(SUM(total), 0)::NUMERIC AS total
    FROM filtered
    WHERE status <> 'CANCELLED' AND p_include_breakdowns
    GROUP BY COALESCE(payment_method, '-')
    ORDER BY total DESC
  ),
  cashiers AS (
    SELECT COALESCE(cashier_name, '-') AS name, COUNT(*)::BIGINT AS count,
      COALESCE(SUM(total), 0)::NUMERIC AS total
    FROM filtered
    WHERE status <> 'CANCELLED' AND p_include_breakdowns
    GROUP BY COALESCE(cashier_name, '-')
    ORDER BY total DESC
  )
  SELECT jsonb_build_object(
    'totalRevenue', headline.total_revenue,
    'orderVolume', headline.order_volume,
    'efficiency', COALESCE(health.efficiency, 0),
    'byTransactionType', COALESCE((SELECT jsonb_agg(to_jsonb(transactions)) FROM transactions), '[]'::jsonb),
    'byCashier', COALESCE((SELECT jsonb_agg(to_jsonb(cashiers)) FROM cashiers), '[]'::jsonb)
  )
  FROM headline CROSS JOIN health;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_analytics(
  p_start_timestamp BIGINT,
  p_end_timestamp BIGINT,
  p_timezone_offset_minutes INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
SET statement_timeout = '15s'
AS $$
  WITH base AS (
    SELECT restaurant_id, location_name, total, status, timestamp, payment_method
    FROM public.orders
    WHERE timestamp >= p_start_timestamp AND timestamp <= p_end_timestamp
  ),
  headline AS (
    SELECT
      COALESCE(SUM(total) FILTER (WHERE status = 'COMPLETED'), 0)::NUMERIC AS revenue,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::BIGINT AS completed_orders,
      COUNT(*)::BIGINT AS total_orders
    FROM base
  ),
  daily AS (
    SELECT to_char(
      (to_timestamp(timestamp / 1000.0) AT TIME ZONE 'UTC')
        - (p_timezone_offset_minutes * INTERVAL '1 minute'),
      'YYYY-MM-DD'
    ) AS date,
      COALESCE(SUM(total), 0)::NUMERIC AS sales, COUNT(*)::BIGINT AS orders
    FROM base WHERE status = 'COMPLETED'
    GROUP BY 1 ORDER BY 1
  ),
  vendors AS (
    SELECT restaurant_id::TEXT AS "restaurantId",
      COALESCE(MAX(location_name), 'Unassigned') AS hub,
      COALESCE(SUM(total) FILTER (WHERE status = 'COMPLETED'), 0)::NUMERIC AS sales,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::BIGINT AS completed,
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::BIGINT AS cancelled
    FROM base GROUP BY restaurant_id
  ),
  payments AS (
    SELECT COALESCE(payment_method, 'Unspecified') AS name,
      COALESCE(SUM(total), 0)::NUMERIC AS value, COUNT(*)::BIGINT AS orders
    FROM base WHERE status = 'COMPLETED'
    GROUP BY COALESCE(payment_method, 'Unspecified') ORDER BY value DESC
  ),
  statuses AS (
    SELECT status AS name, COUNT(*)::BIGINT AS value
    FROM base GROUP BY status ORDER BY value DESC
  ),
  item_rows AS (
    SELECT
      COALESCE(item->>'id', item->>'name') AS item_key,
      COALESCE(item->>'name', 'Unknown item') AS name,
      CASE WHEN item->>'quantity' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (item->>'quantity')::NUMERIC ELSE 0 END AS quantity,
      CASE WHEN item->>'price' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::NUMERIC ELSE 0 END AS price
    FROM public.orders order_row
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(order_row.items::jsonb, '[]'::jsonb)) item
    WHERE order_row.status = 'COMPLETED'
      AND order_row.timestamp >= p_start_timestamp
      AND order_row.timestamp <= p_end_timestamp
  ),
  top_items AS (
    SELECT item_key, MAX(name) AS name, SUM(quantity)::NUMERIC AS quantity,
      SUM(price * quantity)::NUMERIC AS sales
    FROM item_rows GROUP BY item_key ORDER BY quantity DESC LIMIT 5
  )
  SELECT jsonb_build_object(
    'revenue', headline.revenue,
    'completedOrders', headline.completed_orders,
    'totalOrders', headline.total_orders,
    'averageOrder', CASE WHEN headline.completed_orders > 0 THEN headline.revenue / headline.completed_orders ELSE 0 END,
    'completionRate', CASE WHEN headline.total_orders > 0 THEN 100.0 * headline.completed_orders / headline.total_orders ELSE 0 END,
    'dailySales', COALESCE((SELECT jsonb_agg(to_jsonb(daily)) FROM daily), '[]'::jsonb),
    'vendors', COALESCE((SELECT jsonb_agg(to_jsonb(vendors)) FROM vendors), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(payments)) FROM payments), '[]'::jsonb),
    'statusBreakdown', COALESCE((SELECT jsonb_agg(to_jsonb(statuses)) FROM statuses), '[]'::jsonb),
    'topItems', COALESCE((SELECT jsonb_agg(to_jsonb(top_items) - 'item_key') FROM top_items), '[]'::jsonb)
  )
  FROM headline;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_report_summary(BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_analytics(BIGINT, BIGINT, INTEGER) TO anon, authenticated;
