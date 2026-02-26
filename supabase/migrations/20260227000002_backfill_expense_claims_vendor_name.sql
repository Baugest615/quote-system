-- =====================================================
-- 回填 expense_claims 的 vendor_name
-- 已存在但 vendor_name 為空的記錄，填入提交者的員工姓名
-- =====================================================

UPDATE expense_claims ec
SET vendor_name = e.name
FROM employees e
WHERE e.user_id = ec.submitted_by
  AND (ec.vendor_name IS NULL OR ec.vendor_name = '');

-- 同步回填 accounting_expenses 中由個人報帳產生的記錄
UPDATE accounting_expenses ae
SET vendor_name = e.name
FROM expense_claims ec
JOIN employees e ON e.user_id = ec.submitted_by
WHERE ae.expense_claim_id = ec.id
  AND (ae.vendor_name IS NULL OR ae.vendor_name = '');

-- 同步回填 payment_confirmation_items 的快照欄位
UPDATE payment_confirmation_items pci
SET kol_name_at_confirmation = e.name
FROM expense_claims ec
JOIN employees e ON e.user_id = ec.submitted_by
WHERE pci.expense_claim_id = ec.id
  AND (pci.kol_name_at_confirmation IS NULL OR pci.kol_name_at_confirmation = '' OR pci.kol_name_at_confirmation = '個人報帳');
