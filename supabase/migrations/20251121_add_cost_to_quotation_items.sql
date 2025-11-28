-- Add cost column to quotation_items table
ALTER TABLE quotation_items 
ADD COLUMN cost numeric DEFAULT 0;

-- Comment on column
COMMENT ON COLUMN quotation_items.cost IS '成本金額';
