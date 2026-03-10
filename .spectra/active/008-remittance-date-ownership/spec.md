# Spec: 匯款日期管理權責重設計
spec-id: 008-remittance-date-ownership
版本：1.0
最後更新：2026-03-10
局部取代：007-payment-date-per-item（FR-2、FR-5 語意）

## 功能需求

### 必要（Must Have）

- **FR-1**: 工作台「審核中 Tab」核准動作改為彈出確認 Modal，Modal 中包含：匯款日期輸入欄位（date picker，**必填**，未填不得核准）、匯款對象戶名、確認金額
- **FR-2**: 合併組核准時，Modal 填入一個日期，所有 merge_group 成員的 `payment_confirmation_items.payment_date` 統一設為該日期
- **FR-3**: 單筆項目核准時，Modal 填入日期後寫入對應的 `payment_confirmation_items.payment_date`
- **FR-4**: `accounting_expenses.expense_month` 的計算邏輯改為：`format(payment_date, "yyyy年M月")`（自然月份），移除現有的 10日切點補償邏輯
- **FR-5**: `accounting_expenses.payment_date` 同步邏輯不變 — 仍在逐筆更新 `payment_confirmation_items.payment_date` 時同步
- **FR-6**: 已確認清單「匯款總覽 Tab」的 RemittanceGroupCard 群組日期設定，語意改為「批次調整匯款日」（UI 標籤從主要輸入改為「如需調整可於此修改」）
- **FR-7**: 已確認清單「確認紀錄 Tab」的 PaymentRecordRow 逐筆日期欄位**保留**（沿用 Spec-007，仍可逐筆微調）

### 可選（Nice to Have）

- **FR-N1**: 核准 Modal 的日期欄位，預設帶入「今天」作為初始值

## 技術規格

### 資料模型

#### 不需新增欄位
`payment_confirmation_items.payment_date` 欄位已由 Spec-007 建立，本 spec 沿用。

#### 審核流程資料流（待 apply 時確認實作路徑）

核准動作（approveMergeGroup / approveSingleItem）有兩種可能的實作路徑：

**路徑 A**（審核直接建立 confirmation_items）：
```typescript
// useWorkbenchReview.ts
approveMergeGroup(groupId, paymentDate) → RPC → 建立 payment_confirmations + payment_confirmation_items(payment_date)
approveSingleItem(itemId, paymentDate)  → RPC → 建立 payment_confirmations + payment_confirmation_items(payment_date)
```

**路徑 B**（審核只更新狀態，confirmation 另行建立）：
```typescript
// 需要中間暫存欄位
quotation_items.approved_payment_date = paymentDate  // 暫存
// 之後建立 confirmation 時讀取此欄位填入 payment_confirmation_items.payment_date
```

> apply 階段第一步：確認目前 approveMergeGroup / approveSingleItem 的實際資料流，決定使用路徑 A 或 B。

#### expense_month 計算邏輯變更

**現行**（有 10日切點）：
```typescript
// src/lib/payments/aggregation.ts
function getBillingMonthKey(date: string): string {
  const d = new Date(date)
  if (d.getDate() < 10) d.setMonth(d.getMonth() - 1)  // ← 移除此邏輯
  return format(d, 'yyyy年M月')
}
```

**變更後**（自然月份）：
```typescript
function getExpenseMonthFromPaymentDate(paymentDate: string): string {
  return format(new Date(paymentDate), 'yyyy年M月')
}
```

同步點：在 `accounting_expenses.payment_date` 更新時，同步更新 `expense_month`。

### 前端元件

#### 修改：ReviewSection.tsx（工作台審核中 Tab）
- 核准按鈕改為觸發確認 Modal
- Modal 包含：
  - 匯款對象戶名（顯示用，只讀）
  - 匯款日期 `<input type="date">` （必填）
  - 確認 / 取消按鈕
- 合併組核准：同一個 Modal，填入日期後套用到所有成員
- 單筆核准：同上

#### 修改：useWorkbenchReview.ts（審核 Hook）
- `approveMergeGroup(groupId, paymentDate: string)` — 新增 paymentDate 參數
- `approveSingleItem(itemId, paymentDate: string)` — 新增 paymentDate 參數
- 依確認的路徑（A 或 B）寫入 payment_date

#### 修改：aggregation.ts（月份計算）
- 移除 `getBillingMonthKey` 的 10日切點邏輯（或提供新函數取代）
- `getExpenseMonthFromPaymentDate(paymentDate: string): string` — 新增

#### 修改：confirmed-payments/page.tsx
- `handleItemPaymentDateChange` 中，同步更新 `accounting_expenses.expense_month`（同步寫入自然月份）

#### 修改：RemittanceGroupCard.tsx（已確認清單）
- 群組日期設定的 UI label 改為「批次調整匯款日」
- 說明文字：「日期已於審核時帶入，如有異動可於此批次修改」
- 功能邏輯不變（仍可批次更新群組內所有項目的 payment_date）

#### 不變：PaymentRecordRow.tsx
- 逐筆日期欄位保留（沿用 Spec-007）

### DB Migration（若路徑 B）

若走路徑 B（暫存欄位），需新增 migration：
```sql
ALTER TABLE quotation_items
ADD COLUMN IF NOT EXISTS approved_payment_date date;

COMMENT ON COLUMN quotation_items.approved_payment_date
  IS '審核人核准時填入的預計匯款日期，建立 confirmation 時帶入 payment_confirmation_items.payment_date';
```

## 驗收標準

- [ ] AC-1: 工作台核准（單筆和合併組）彈出含日期輸入的確認 Modal
- [ ] AC-2: 核准後，對應的 `payment_confirmation_items.payment_date` 已正確寫入
- [ ] AC-3: 合併組核准後，組內所有成員的 `payment_confirmation_items.payment_date` 為同一日期
- [ ] AC-4: `accounting_expenses.expense_month` 顯示的是 payment_date 的自然月份（格式：2026年3月）
- [ ] AC-5: 移除 10日切點後，3月9日匯款的 expense_month 顯示為「2026年3月」（而非舊邏輯的「2026年2月」）
- [ ] AC-6: 已確認清單「匯款總覽」的群組日期欄位改為「批次調整」語意，UI label 已更新
- [ ] AC-7: 已確認清單「確認紀錄」的逐筆日期欄位仍可正常編輯（Spec-007 功能不受影響）
- [ ] AC-8: 逐筆調整 payment_date 後，accounting_expenses.payment_date 和 expense_month 同步更新
- [ ] AC-9: TypeScript 編譯通過，無型別錯誤

## 非功能需求

- 效能：Modal 開啟不需額外 API call；核准時一次更新，不影響現有效能
- 安全：沿用既有 RLS 規則，不新增欄位的情況下不需額外 policy
- 向後相容：既有已確認資料的 expense_month **不回溯修改**（避免影響已入帳帳務）；新確認的才套用新邏輯
- 進項管理同步：審核人填入的匯款日期，透過 payment_confirmation_items.payment_date 自動同步到 accounting_expenses.payment_date 和 expense_month，審核人/使用者**無需再手動填寫進項管理**
