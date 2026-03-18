-- RPC function to delete a vendor and all associated data.
-- Uses SECURITY DEFINER so it runs with the function owner's privileges,
-- bypassing RLS policies that may block DELETE operations via the anon key.

CREATE OR REPLACE FUNCTION delete_vendor(p_user_id UUID, p_restaurant_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF p_restaurant_id IS NOT NULL THEN
    -- Delete menu items first (foreign key dependency)
    DELETE FROM menu_items WHERE restaurant_id = p_restaurant_id;

    -- Delete orders for this restaurant
    DELETE FROM orders WHERE restaurant_id = p_restaurant_id;

    -- Delete subscriptions (may not exist for all vendors)
    DELETE FROM subscriptions WHERE restaurant_id = p_restaurant_id;

    -- Delete the restaurant record
    DELETE FROM restaurants WHERE id = p_restaurant_id;
  END IF;

  -- Delete the user record
  DELETE FROM users WHERE id = p_user_id;

  -- Verify deletion
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RETURN json_build_object('success', false, 'message', 'Failed to delete user record');
  END IF;

  IF p_restaurant_id IS NOT NULL AND EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN
    RETURN json_build_object('success', false, 'message', 'Failed to delete restaurant record');
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
