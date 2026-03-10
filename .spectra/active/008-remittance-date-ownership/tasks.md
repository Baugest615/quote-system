# Tasks: 匯款日期管理權責重設計
spec-id: 008-remittance-date-ownership
預估任務數：7
可平行任務：3

## 任務清單

### Phase 0: 資料流確認（必須先完成）

- (✓) T-0: 確認 approveMergeGroup / approveSingleItem 的實際資料流，決定路徑 A 或路徑 B
  → 結論：路徑 A，approve_quotation_item RPC 直接建立 payment_confirmation_items

### Phase 1: 工作台審核 Modal（依賴 T-0）

- (✓) T-1: DB Migration — approve_quotation_item/approve_merge_group 新增 p_payment_date 參數
  — `supabase/migrations/20260310100000_approve_with_payment_date.sql`

- (✓) T-2: ReviewSection.tsx — 核准按鈕改為觸發 Modal，Modal 含匯款對象/金額/日期（必填）
  — `src/components/payment-workbench/ReviewSection.tsx`

- (✓) T-3: useWorkbenchReview — approveMergeGroup / approveSingleItem 加 paymentDate 參數
  — `src/hooks/payment-workbench/useWorkbenchReview.ts`

### Phase 2: expense_month 計算邏輯（可與 Phase 1 平行）

- (✓) T-4: aggregation.ts — getItemBillingMonth 優先使用 payment_date 自然月份；薪資改為自然月份
  — `src/lib/payments/aggregation.ts`

- (✓) T-5: confirmed-payments/page.tsx — handleItemPaymentDate 同步寫入 expense_month
  — `src/app/dashboard/confirmed-payments/page.tsx`

### Phase 3: UI 語意調整（依賴 Phase 1、2）

- (✓) T-6: RemittanceGroupCard — 群組日期 label 改為「批次調整匯款日」
  — `src/components/payments/confirmed/RemittanceGroupCard.tsx`

### Phase 4: 驗收與整合

- (✓) T-7: TypeScript 型別檢查通過（僅有既有的 sanitize-html 型別宣告問題，與此次無關）

## 標記說明
- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消
