# Tasks: 匯款日期逐筆管理
spec-id: 007-payment-date-per-item
預估任務數：8
可平行任務：3

## 任務清單

### Phase 1: DB + 型別基礎
- [P] (✓) T-1: 新增 migration — `payment_confirmation_items` 加 `payment_date` 欄位
  — `supabase/migrations/20260307120000_add_payment_date_to_confirmation_items.sql`
- [P] (✓) T-2: 更新 TypeScript 型別 — `PaymentConfirmationItem` 新增 `payment_date`，移除 `payment_requests.payment_date`
  — `src/lib/payments/types.ts`

### Phase 2: 清除 Spec-006 殘留
- [P] (✓) T-3: 移除工作台日期選擇器 — 刪除 `paymentDates` state、日期 UI、核准時的 paymentDate 傳遞
  — `src/components/payment-workbench/ReviewSection.tsx`
- [P] (✓) T-4: 簡化核准 hook — 移除 `paymentDate` 參數和 `payment_requests.payment_date` UPDATE
  — `src/hooks/payment-workbench/useWorkbenchReview.ts`
- [P] (✓) T-5: 移除 aggregation 中的日期分組邏輯（移除 006 遺留的 `_d{date}` groupKey）
  — `src/lib/payments/aggregation.ts`

### Phase 3: 逐筆日期 UI + 儲存
- [S] (✓) T-6: PaymentRecordRow 新增匯款日期欄位 — 每行顯示 `<input type="date">`
  — `src/components/payments/confirmed/PaymentRecordRow.tsx`
- [S] (✓) T-7: RemittanceGroupCard 改造 — 群組日期改為「統一設定」語意，表頭加匯款日欄位，傳遞 handler
  — `src/components/payments/confirmed/RemittanceGroupCard.tsx`
- [S] (✓) T-8: confirmed-payments page 串接 — 查詢 payment_date、新增 handler、同步 accounting_expenses
  — `src/app/dashboard/confirmed-payments/page.tsx`
  — `src/components/payments/confirmed/tabs/PaymentOverviewTab.tsx`

## 標記說明
- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消
