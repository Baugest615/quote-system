-- =====================================================
-- 修正回填 accounting_sales 年份
-- 根因：20260227100000 回填用了 quotation.created_at 年份，
--       但原始 RPC 用 NOW() 年份。導致 2025 年建立的報價單
--       簽約在 2026 年時，銷售記錄卻歸到 2025 年。
-- 修正：將回填記錄的年份改為與對應支出記錄一致。
-- =====================================================

-- 方法：如果 accounting_expenses 存在同一 quotation 的支出記錄，
-- 使用支出記錄的年份；否則使用當前年份（2026）。
UPDATE accounting_sales AS s
SET year = COALESCE(
  (
    SELECT DISTINCT ae.year
    FROM accounting_expenses ae
    JOIN payment_requests pr ON ae.payment_request_id = pr.id
    JOIN quotation_items qi ON pr.quotation_item_id = qi.id
    WHERE qi.quotation_id = s.quotation_id
    LIMIT 1
  ),
  EXTRACT(YEAR FROM NOW())::integer
)
WHERE s.note LIKE '%回填%'
  AND s.quotation_id IS NOT NULL;

-- 同時修正 20260227100000 中的 RPC 回填補建邏輯
-- 確保未來補建使用 NOW() 年份（已在 RPC 本身用 NOW()，不需改）

NOTIFY pgrst, 'reload schema';
