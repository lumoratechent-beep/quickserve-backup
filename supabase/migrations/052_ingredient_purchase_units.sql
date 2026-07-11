-- 052: Ingredient purchase-to-stock unit conversion
-- Lets vendors buy supplies in packs/bottles/boxes while stock is held in base units.

ALTER TABLE ingredient_items
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS purchase_to_stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 1;

UPDATE ingredient_items
SET purchase_unit = CASE
      WHEN purchase_unit IS NULL OR purchase_unit = '' OR purchase_unit = 'pcs' THEN unit
      ELSE purchase_unit
    END,
    purchase_to_stock_quantity = CASE
      WHEN purchase_to_stock_quantity IS NULL OR purchase_to_stock_quantity <= 0 THEN 1
      ELSE purchase_to_stock_quantity
    END;
