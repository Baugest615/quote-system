-- 追加項目標記：已簽約報價單新增的執行項目
ALTER TABLE "public"."quotation_items"
  ADD COLUMN IF NOT EXISTS "is_supplement" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."quotation_items"."is_supplement"
  IS '追加項目標記（已簽約後新增的執行項目）';
