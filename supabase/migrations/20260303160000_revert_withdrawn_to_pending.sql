-- ============================================================
-- Data Migration: 將所有「已撤回」項目改回「待請款」狀態
--
-- 說明：先前的 limbo 修復（20260303150001）範圍過廣，
--       將 177 筆項目標記為「已撤回（系統自動修復）」，
--       但這些項目應回到「待請款」狀態讓使用者自行處理。
--
-- 操作：清除 rejected_at / rejected_by / rejection_reason，
--       使項目回到 pending 狀態。
-- ============================================================

UPDATE public.quotation_items SET
  rejected_at = NULL,
  rejected_by = NULL,
  rejection_reason = NULL
WHERE rejection_reason LIKE '%已撤回%';
