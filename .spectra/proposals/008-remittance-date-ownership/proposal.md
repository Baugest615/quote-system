# Proposal: 匯款日期管理權責重設計
spec-id: 008-remittance-date-ownership
日期：2026-03-10
狀態：approved
來源討論：.spectra/discussions/2026-03-10-remittance-date-ownership-refactor.md

## 問題描述

目前系統中「匯款日期」存在 5 個填寫入口點：

1. `quotation_items.expected_payment_month` ← 請款人填（月份）
2. RemittanceGroupCard（群組級）← 確認清單匯款總覽
3. PaymentRecordRow（逐筆）← 確認清單確認紀錄（Spec-007）
4. `accounting_expenses.payment_date` ← 進項管理頁面
5. `accounting_payroll.payment_date` ← 薪資表

同時存在兩個月份概念並行（請款人的「預計月份」vs 財務的「實際匯款日」），
導致已確認清單顯示月份不同步，衍生大量難以根治的 bug。

## 提案方案

**將匯款日期的決定權完全交給審核人**：

- 請款人送出時只需備妥完整請款資料（成本、發票等），無需決定匯款時間
- 審核人在工作台核准時，透過確認 Modal 填入匯款日期
- 此日期在建立 `payment_confirmation_items` 時直接寫入 `payment_date`
- `accounting_expenses.expense_month` 改為從 `payment_date` 的**自然月份**派生（移除 10日切點補償邏輯）

## 影響範圍

- 影響的模組：payment-workbench、confirmed-payments、accounting/expenses
- 影響的主要檔案（預估）：
  - `src/components/payment-workbench/ReviewSection.tsx`
  - `src/hooks/payment-workbench/useWorkbenchReview.ts`
  - `src/lib/payments/aggregation.ts`
  - `src/components/payments/confirmed/RemittanceGroupCard.tsx`
  - `src/app/dashboard/confirmed-payments/page.tsx`
  - DB migration（accounting_expenses expense_month 計算邏輯）
- 變更等級：**Level 3（架構）** — 跨多模組、涉及核心資料流

## 矛盾偵測結果

- ✅ 與 `001-merged-payment-workbench` 無衝突（審核流程擴充，合併邏輯不受影響）
- ✅ 與 `002-large-component-split` 無衝突
- ✅ 與 `003-tax-reform` 無衝突
- ✅ 與 `004-zod-upgrade` 無衝突
- ✅ 與 `005-remittance-grouping-refactor` 無衝突
- ⚠️ **部分取代 `006-remittance-date-split`**（006 已被 007 實質取代）
- ⚠️ **局部取代 `007-payment-date-per-item`**：
  - **取代** FR-2（007 移除審核時日期輸入 → 008 重新加入，但語意不同）
  - **保留** FR-1（payment_confirmation_items.payment_date 欄位，008 沿用）
  - **保留** FR-4（PaymentRecordRow 的逐筆日期欄位，作為事後微調）
  - **語意調整** FR-5（RemittanceGroupCard 群組日期從「主要輸入」降級為「批次調整」）

## 風險與替代方案

- **風險 1**：若審核 RPC 未直接建立 confirmation_items，可能需要中間暫存欄位（`quotation_items.approved_payment_date`）
  - 緩解：apply 階段先確認 approve action 的實際資料流
- **風險 2**：現有已確認資料的 `expense_month` 與新邏輯不一致
  - 緩解：僅對新確認的項目套用新邏輯；既有資料不 retroactive 修改
- **替代方案**：若審核時強制填入日期反而造成工作流阻塞，可改為「核准時可選填，若未填則確認清單中要求補填才能設為已付」
