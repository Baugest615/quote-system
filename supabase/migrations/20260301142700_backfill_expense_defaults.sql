-- 回填 quotation_items 的 expense_type / accounting_subject 智慧預設
-- 規則：
--   無 KOL → 專案費用 / 廣告費用
--   KOL 公司戶 → 外包服務 / 外包費用
--   KOL 個人戶或未設定 → 勞務報酬 / 勞務成本（維持原預設）

-- 1) 無 KOL 的項目 → 專案費用 / 廣告費用
UPDATE public.quotation_items
SET expense_type = '專案費用',
    accounting_subject = '廣告費用'
WHERE kol_id IS NULL
  AND (expense_type IS NULL OR expense_type = '勞務報酬')
  AND accounting_subject IS NULL;

-- 2) 有 KOL 且銀行帳戶為公司戶 → 外包服務 / 外包費用
UPDATE public.quotation_items qi
SET expense_type = '外包服務',
    accounting_subject = '外包費用'
FROM public.kols k
WHERE qi.kol_id = k.id
  AND (k.bank_info->>'bankType') = 'company'
  AND (qi.expense_type IS NULL OR qi.expense_type = '勞務報酬')
  AND qi.accounting_subject IS NULL;

-- 3) 有 KOL 且個人戶或未設定 → 補上 accounting_subject（expense_type 已是勞務報酬）
UPDATE public.quotation_items qi
SET accounting_subject = '勞務成本'
FROM public.kols k
WHERE qi.kol_id = k.id
  AND ((k.bank_info->>'bankType') IS NULL OR (k.bank_info->>'bankType') != 'company')
  AND qi.expense_type = '勞務報酬'
  AND qi.accounting_subject IS NULL;
