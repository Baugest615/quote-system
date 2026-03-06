# Proposal: 匯款日期逐筆管理
spec-id: 007-payment-date-per-item
日期：2026-03-07
狀態：draft
來源討論：.spectra/discussions/2026-03-07-payment-date-per-item.md
取代：006-remittance-date-split（架構缺陷，payment_requests 路徑不通）

## 問題描述

Spec-006 設計的「核准時寫入 `payment_requests.payment_date`」架構有根本性缺陷：
- 工作台核准路徑走 `approve_quotation_item` RPC，直接操作 `quotation_items`
- 核准後嘗試 UPDATE `payment_requests.payment_date`，但該表可能沒有對應記錄
- UPDATE 命中 0 行靜默失敗，匯款日期從未被儲存
- 已確認請款清單和進項管理的匯款日期永遠空白

此外，Spec-006 的「按匯款日拆分群組」設計也不夠直覺 — 同一匯款對象的不同日期拆成不同群組卡片，操作上反而更複雜。

## 提案方案

將 `payment_date` 從 `payment_requests` 移到 `payment_confirmation_items`：
1. 每筆確認項目直接帶匯款日期，與來源無關（quotation_items / expense_claims / payment_requests）
2. 移除工作台核准時的日期選擇器（核准 ≠ 決定匯款日）
3. 已確認清單每筆項目有獨立日期欄位，群組提供「統一設定」快捷鍵
4. 不再按日期拆分群組（同一匯款對象維持一張卡片）
5. 修改匯款日後同步到 `accounting_expenses.payment_date`

## 影響範圍

- 影響的模組：DB schema、已確認請款清單（confirmed-payments）、請款工作台（payment-workbench）、匯款設定 RPC
- 影響的檔案（預估）：
  - `supabase/migrations/` — 新增 migration
  - `src/lib/payments/types.ts` — 型別更新
  - `src/lib/payments/aggregation.ts` — 移除日期分組邏輯
  - `src/lib/payments/grouping.ts` — 可能微調
  - `src/components/payments/confirmed/RemittanceGroupCard.tsx` — UI 改動
  - `src/components/payments/confirmed/PaymentRecordRow.tsx` — 新增日期欄位
  - `src/components/payments/confirmed/tabs/PaymentOverviewTab.tsx` — 初始化邏輯
  - `src/components/payment-workbench/ReviewSection.tsx` — 移除日期選擇器
  - `src/hooks/payment-workbench/useWorkbenchReview.ts` — 移除日期寫入
  - `src/app/dashboard/confirmed-payments/page.tsx` — 查詢和儲存
  - `update_remittance_settings` RPC — 同步邏輯
- 變更等級：Level 2（跨模組，但不涉及核心 RPC 簽名變更）

## 矛盾偵測結果

- ⚠️ 與 active/006-remittance-date-split：**直接取代** — 本 spec 是 006 的修正版，006 應標記為 superseded
- ✅ 與 active/001-merged-payment-workbench：無衝突（工作台核准邏輯反而簡化）
- ✅ 與 active/005-remittance-grouping-refactor：無衝突（groupKey 不再需要日期維度）
- ✅ 與 active/002-large-component-split、003-tax-reform、004-zod-upgrade：無衝突

## 風險與替代方案

- 風險 1：已有的 `remittance_settings` JSONB 中的 `paymentDate` 欄位 — 需決定是保留還是移除
  - 建議：保留作為群組預設值的「統一設定」來源，但每筆項目的實際日期以 `payment_confirmation_items.payment_date` 為準
- 風險 2：`update_remittance_settings` RPC 目前按群組同步 paymentDate → 需改為按逐筆項目同步
  - 建議：新增獨立的 RPC 或前端直接 UPDATE
- 替代方案：把 payment_date 放在 accounting_expenses（已有此欄位）— 但不是所有項目都有 accounting_expenses 記錄，不完整
