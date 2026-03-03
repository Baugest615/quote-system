-- ============================================================
-- Data Migration: 修復被舊版 withdraw RPC 撤回後消失的項目
--
-- 問題：舊版 withdraw_single_item/withdraw_merge_group 只清除
--       requested_at，不設定 rejected_at，導致項目從工作台消失。
--
-- 修復：找出所有「limbo」項目（三個 timestamp 都為 NULL，
--       但報價單狀態非「已簽約/已歸檔」且有 cost_amount），
--       設定 rejected_at + rejection_reason='已撤回'。
--
-- 注意：只修復有 cost_amount 的項目（代表曾準備請款），
--       避免影響真正的新項目。
-- ============================================================

UPDATE public.quotation_items qi SET
  rejected_at = NOW(),
  rejection_reason = '已撤回（系統自動修復）'
FROM public.quotations q
WHERE qi.quotation_id = q.id
  AND qi.approved_at IS NULL
  AND qi.requested_at IS NULL
  AND qi.rejected_at IS NULL
  AND q.status NOT IN ('已簽約', '已歸檔')
  AND qi.cost_amount IS NOT NULL;
