# Spec: 匯款日期逐筆管理
spec-id: 007-payment-date-per-item
版本：1.0
最後更新：2026-03-07
取代：006-remittance-date-split

## 功能需求

### 必要（Must Have）

- **FR-1**: `payment_confirmation_items` 表新增 `payment_date` (date, nullable) 欄位
- **FR-2**: 移除請款工作台 ReviewSection 的匯款日期選擇器（核准時不再填日期）
- **FR-3**: 移除 useWorkbenchReview 中核准後的 `payment_requests.payment_date` UPDATE 邏輯
- **FR-4**: 已確認請款清單每筆項目（PaymentRecordRow）新增匯款日期欄位，可獨立編輯
- **FR-5**: RemittanceGroupCard 保留群組層級的日期設定，改為「統一設定」功能 — 點擊後將群組內所有項目的 payment_date 設為同一天
- **FR-6**: 逐筆修改 payment_date 後，同步更新對應的 `accounting_expenses.payment_date`
- **FR-7**: 移除 Spec-006 的 groupKey 日期維度分組邏輯（不再按日期拆分群組）

### 可選（Nice to Have）

- **FR-N1**: 群組「統一設定」按鈕可快速清除所有項目的匯款日
- **FR-N2**: 匯款日欄位旁顯示付款狀態標記（已付/未付）

## 技術規格

### 資料模型

#### 新增欄位
```sql
ALTER TABLE payment_confirmation_items
ADD COLUMN IF NOT EXISTS payment_date date;

COMMENT ON COLUMN payment_confirmation_items.payment_date
  IS '匯款日期，在已確認請款清單中逐筆填入';
```

#### 保留但不再使用
- `payment_requests.payment_date` — Spec-006 加入的欄位，保留不移除，但不再寫入/讀取

#### 既有欄位不變
- `accounting_expenses.payment_date` — 由前端同步，已有 trigger 自動設定 payment_status
- `accounting_payroll.payment_date` — 獨立管理，不受影響
- `remittance_settings` JSONB 中的 `paymentDate` — 保留作為群組「統一設定」的值

### API / 儲存設計

#### 逐筆更新 payment_date
前端直接 UPDATE `payment_confirmation_items`：
```typescript
await supabase
  .from('payment_confirmation_items')
  .update({ payment_date: newDate })
  .eq('id', itemId)
```

#### 同步到 accounting_expenses
更新 payment_confirmation_items.payment_date 後，同步對應的 accounting_expenses：
```typescript
// quotation 來源：透過 quotation_item_id 關聯
await supabase
  .from('accounting_expenses')
  .update({ payment_date: newDate })
  .eq('quotation_item_id', item.quotation_item_id)

// personal 來源：透過 expense_claim_id 關聯
await supabase
  .from('accounting_expenses')
  .update({ payment_date: newDate })
  .eq('expense_claim_id', item.expense_claim_id)

// project 來源：透過 payment_request_id 關聯
await supabase
  .from('accounting_expenses')
  .update({ payment_date: newDate })
  .eq('payment_request_id', item.payment_request_id)
```

#### 群組「統一設定」
群組的日期選擇器改為觸發批次更新：
```typescript
// 1. 更新群組內所有 confirmation_items
for (const item of group.items) {
  await updateItemPaymentDate(item.id, groupDate)
}
// 2. 同步 remittance_settings（保持現有 RPC 相容）
```

### 前端元件

#### 修改：PaymentRecordRow.tsx
- 每行新增一個 `<input type="date">` 欄位
- Props 新增 `onUpdatePaymentDate?: (itemId: string, date: string | null) => void`
- 表格新增「匯款日」欄位（在「匯款金額」之前）

#### 修改：RemittanceGroupCard.tsx
- 群組層級的日期選擇器改為「統一設定」語意
- onChange 時呼叫 parent 的批次更新函數
- 表頭新增「匯款日」欄位
- 傳遞 onUpdatePaymentDate 給每個 PaymentRecordRow

#### 修改：ReviewSection.tsx
- 移除 `paymentDates` state 和日期選擇器 UI
- `approveMergeGroup` / `approveSingleItem` 呼叫不再傳遞 paymentDate 參數

#### 修改：useWorkbenchReview.ts
- `approveMergeGroup` 和 `approveSingleItem` 移除 paymentDate 參數
- 移除核准後的 `payment_requests.payment_date` UPDATE 邏輯

#### 修改：types.ts
- `PaymentConfirmationItem` 新增 `payment_date: string | null`
- `PaymentConfirmationItem.payment_requests` 移除 `payment_date` 欄位

#### 修改：confirmed-payments/page.tsx
- 查詢時不再需要 JOIN payment_requests.payment_date
- 新增 `handleItemPaymentDateChange` 函數
- 傳遞 handler 到 RemittanceGroupCard

#### 修改：aggregation.ts
- 移除 Spec-006 的 `_d{date}` groupKey 邏輯（如有）
- PaymentOverviewTab 初始化時不再從 payment_requests.payment_date 推導預設值
- 改為從 confirmation_items.payment_date 讀取

## 驗收標準

- [ ] AC-1: `payment_confirmation_items` 表有 `payment_date` 欄位
- [ ] AC-2: 請款工作台核准時不再出現日期選擇器
- [ ] AC-3: 已確認請款清單每筆項目顯示可編輯的匯款日期
- [ ] AC-4: 修改單筆項目的匯款日後，對應的 `accounting_expenses.payment_date` 同步更新
- [ ] AC-5: 群組「統一設定日期」功能正常 — 一鍵設定群組內所有項目為同一天
- [ ] AC-6: 不再按日期拆分群組（同一匯款對象維持一張卡片）
- [ ] AC-7: 匯費、代扣稅額等計算不受影響
- [ ] AC-8: 未設定匯款日的項目正常顯示（向後相容）
- [ ] AC-9: TypeScript 編譯通過，無型別錯誤

## 非功能需求

- 效能：逐筆更新使用單次 UPDATE，不批次（資料量小，每次只改一筆）
- 安全：UPDATE 受 RLS 保護（繼承 payment_confirmation_items 既有 RLS）
- 向後相容：既有資料的 payment_date 為 null，顯示為空白，行為不變
