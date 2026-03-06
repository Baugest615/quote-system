# Spec: 匯款日期分日架構
spec-id: 006-remittance-date-split
版本：1.0
最後更新：2026-03-07

## 功能需求

### 必要（Must Have）

- **FR-1**: `payment_requests` 表新增 `payment_date` (date, nullable) 欄位，記錄審核通過時的預計匯款日
- **FR-2**: 請款工作台「審核中」區塊，核准動作旁新增日期選擇器，核准時將日期寫入 `payment_requests.payment_date`
- **FR-3**: 已確認請款清單的 aggregation 邏輯，在現有 groupKey 基礎上加入 paymentDate 維度：同一匯款對象 + 不同匯款日 → 分開為不同群組
- **FR-4**: 已確認請款清單 PaymentOverviewTab 初始化時，讀取 `payment_requests.payment_date` 作為該筆請款的預設匯款日
- **FR-5**: 確認清單的匯款日期修改後，自動同步到 `accounting_expenses.payment_date`（利用現有 RPC）
- **FR-6**: 未填匯款日的請款維持現行行為（按月合併）

### 可選（Nice to Have）

- **FR-N1**: 審核時可批次設定同一匯款對象的匯款日（多筆請款同時核准時）
- **FR-N2**: 確認清單 UI 按匯款對象摺疊，展開後顯示各匯款日分組

## 技術規格

### 資料模型

#### 新增欄位
```sql
ALTER TABLE payment_requests
ADD COLUMN payment_date date;

COMMENT ON COLUMN payment_requests.payment_date IS '預計匯款日期，審核通過時填入';
```

#### 現有結構不變
- `payment_confirmations.remittance_settings` (JSONB)：key 格式不變，paymentDate 欄位繼續使用
- `accounting_expenses.payment_date`：由 RPC 同步，不需改
- `accounting_payroll.payment_date`：獨立管理，不需改

### API / RPC 設計

#### 修改：核准請款 API
目前核准動作的 API（workbench 中的 approve action），新增 `payment_date` 參數：

```typescript
// 核准時帶入日期
await supabase
  .from('payment_requests')
  .update({
    status: 'confirmed',
    payment_date: selectedDate, // 新增：可為 null
    confirmed_at: new Date().toISOString(),
  })
  .eq('id', requestId)
```

#### 不變：update_remittance_settings RPC
現有 RPC 已支援 paymentDate 同步到 accounting_expenses，不需修改。

### 前端元件

#### 修改：ReviewSection.tsx（請款工作台審核區）
- 在核准按鈕旁新增 `<input type="date">` 日期選擇器
- 標籤：「預計匯款日」
- 可選填（nullable）
- 核准時連同日期一起送出

#### 修改：aggregation.ts（確認清單分組邏輯）
- `aggregateMonthlyRemittanceGroups()` 中，Phase 1 建立 mergedMap 時：
  - 讀取每筆 confirmation_item 對應的 `payment_requests.payment_date`
  - 若有 paymentDate，groupKey 改為 `{originalGroupKey}_d{YYYY-MM-DD}`
  - 若無 paymentDate，維持原 groupKey（向後相容）
- `remittance_settings` 的 key 也需要對應調整（用新的含日期 groupKey）

#### 修改：PaymentOverviewTab.tsx（確認清單初始化）
- 初始化群組設定時，若 `remittance_settings` 中尚無 paymentDate：
  - 查詢群組內各 confirmation_item → payment_requests.payment_date
  - 若所有項目同日期 → 預設為該日期
  - 若日期不一 → 不預填（讓使用者手動設定）
  - 若已有 remittance_settings.paymentDate → 以此為準（覆寫優先）

#### 修改：confirmed-payments/page.tsx（資料查詢）
- 查詢 confirmation_items 時 JOIN payment_requests 取得 payment_date
- 傳遞給 aggregation 函數

### 分組 Key 設計

```
現行（005）：
  acct_1234567890          ← 帳號
  kol_uuid-xxx             ← KOL ID
  personal_user-uuid       ← 個人報帳

本 spec 新增（有匯款日時）：
  acct_1234567890_d2026-03-05    ← 帳號 + 日期
  kol_uuid-xxx_d2026-03-10      ← KOL ID + 日期
  personal_user-uuid_d2026-03-15 ← 個人報帳 + 日期

無匯款日時（向後相容）：
  acct_1234567890          ← 維持原 key
```

### remittance_settings key 格式

```jsonc
// 舊格式（無日期，繼續支援）
{
  "acct_1234567890": { "hasRemittanceFee": true, "paymentDate": "2026-03-05" }
}

// 新格式（有日期分組時）
{
  "acct_1234567890_d2026-03-05": { "hasRemittanceFee": true, "paymentDate": "2026-03-05" },
  "acct_1234567890_d2026-03-15": { "hasRemittanceFee": false, "paymentDate": "2026-03-15" }
}
```

## 驗收標準

- [ ] AC-1: 請款工作台核准時可填入匯款日期，日期寫入 payment_requests.payment_date
- [ ] AC-2: 不填日期核准仍正常運作（向後相容）
- [ ] AC-3: 已確認請款清單中，同一匯款對象的不同匯款日分開為不同群組
- [ ] AC-4: 未填匯款日的請款維持原行為（按月合併，不分日）
- [ ] AC-5: 確認清單初始化時自動讀取 payment_requests.payment_date 作為預設值
- [ ] AC-6: 確認清單修改匯款日後，accounting_expenses.payment_date 自動同步
- [ ] AC-7: 代扣門檻判斷按匯款日獨立計算（現有邏輯，確認不被破壞）
- [ ] AC-8: 合併請款中不同匯款日的項目正確分組

## 非功能需求

- 效能：aggregation 分組增加一個維度，但資料量不大（每月 < 200 筆），無效能顧慮
- 安全：payment_date 欄位需受 RLS 保護（繼承 payment_requests 表既有 RLS）
- 向後相容：無匯款日的舊資料行為完全不變
