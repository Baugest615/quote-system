-- =====================================================
-- 修復 Migration：補建缺少的代扣代繳 settlement 記錄
-- 原因：部分 '代扣代繳' 報帳在 RPC 更新前已被核准，
--       舊版 RPC 建立了 accounting_expense 而非 settlement
-- =====================================================

-- 1. 為已核准的 '代扣代繳' 報帳補建 withholding_settlement
INSERT INTO withholding_settlements (
  month,
  type,
  amount,
  settlement_method,
  expense_claim_id,
  note,
  settled_by,
  settled_at
)
SELECT
  -- 轉換 claim_month 格式："2026年2月" → "2026-02"
  regexp_replace(ec.claim_month, '年.*', '') || '-' ||
    LPAD(regexp_replace(regexp_replace(ec.claim_month, '.*年', ''), '月', ''), 2, '0'),
  CASE WHEN ec.accounting_subject = '二代健保' THEN 'nhi_supplement' ELSE 'income_tax' END,
  ec.total_amount,
  'employee_advance',
  ec.id,
  '修復補建 - 原核准時缺少 settlement 記錄',
  ec.approved_by,
  COALESCE(ec.approved_at, NOW())
FROM expense_claims ec
WHERE ec.expense_type = '代扣代繳'
  AND ec.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM withholding_settlements ws
    WHERE ws.expense_claim_id = ec.id
  );

-- 2. 清理被舊版 RPC 錯誤建立的 accounting_expense（代扣代繳不應有進項記錄）
DELETE FROM accounting_expenses
WHERE expense_claim_id IN (
  SELECT id FROM expense_claims
  WHERE expense_type = '代扣代繳'
    AND status = 'approved'
);
