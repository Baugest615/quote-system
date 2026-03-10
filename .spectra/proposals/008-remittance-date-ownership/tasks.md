# Tasks: 匯款日期管理權責重設計
spec-id: 008-remittance-date-ownership
預估任務數：7
可平行任務：3

## 任務清單

### Phase 0: 資料流確認（必須先完成）

- [S] T-0: 確認 approveMergeGroup / approveSingleItem 的實際資料流，決定路徑 A 或路徑 B
  → 讀取 `src/hooks/payment-workbench/useWorkbenchReview.ts` 和後端 RPC
  → 輸出決定結果，更新 spec.md 刪去未採用路徑
  — `src/hooks/payment-workbench/useWorkbenchReview.ts`

### Phase 1: 工作台審核 Modal（依賴 T-0）

- [S] T-1: 建立核准確認 Modal 元件，含匯款日期輸入（必填）、匯款對象顯示、確認/取消
  — `src/components/payment-workbench/ReviewSection.tsx`（或新增 ApproveModal 元件）

- [S] T-2: 修改 useWorkbenchReview — approveMergeGroup / approveSingleItem 接收 paymentDate 參數，並依 T-0 確認的路徑寫入
  — `src/hooks/payment-workbench/useWorkbenchReview.ts`
  （若路徑 B：`src/db/migrations/` 新增 quotation_items.approved_payment_date 欄位 migration）

### Phase 2: expense_month 計算邏輯（可與 Phase 1 平行）

- [P] T-3: 修改 aggregation.ts — 移除 getBillingMonthKey 的 10日切點邏輯，新增 getExpenseMonthFromPaymentDate
  — `src/lib/payments/aggregation.ts`

- [P] T-4: 修改 confirmed-payments/page.tsx — handleItemPaymentDateChange 同步寫入 accounting_expenses.expense_month
  — `src/app/dashboard/confirmed-payments/page.tsx`

### Phase 3: UI 語意調整（依賴 Phase 1、2）

- [S] T-5: 修改 RemittanceGroupCard — 群組日期設定 UI label 改為「批次調整匯款日」，新增說明文字
  — `src/components/payments/confirmed/RemittanceGroupCard.tsx`

### Phase 4: 驗收與整合

- [S] T-6: 對照 spec.md 驗收標準逐項確認（AC-1 ~ AC-9），修正發現的問題
  — 所有修改過的檔案

## 標記說明
- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消
