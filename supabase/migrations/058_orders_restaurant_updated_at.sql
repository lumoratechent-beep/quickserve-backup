-- Supports fast incremental Back Office order synchronization per restaurant.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_updated_at
  ON public.orders (restaurant_id, updated_at ASC);
