# Design: 匯款日期分日架構
spec-id: 006-remittance-date-split

## 架構決策

### 決策 1: 分層 groupKey（在 005 基礎上擴展）
- 選擇：不修改 005 的 groupKey，而是在 aggregation 階段做 sub-grouping
- 原因：005 的 groupKey 已穩定運行，直接修改 remittee.ts 影響面過大
- 替代方案：修改 makeGroupKey() 加入 paymentDate → 被否決，因為會影響所有使用 groupKey 的地方（工作台篩選、確認清單匹配）
- 實作：aggregation.ts 中在 mergedMap 建構時，key 使用 `${groupKey}_d${paymentDate}` 或純 `${groupKey}`

### 決策 2: payment_date 欄位放在 payment_requests 而非 confirmation_items
- 選擇：新增在 payment_requests 表
- 原因：匯款日是「這筆請款何時付」的屬性，語意上屬於請款層級
- 替代方案：放在 confirmation_items → 被否決，因為 confirmation_items 是確認關聯表，不該承載業務屬性
- 替代方案：只用 remittance_settings → 被否決，因為審核階段尚無 confirmation，需要獨立存儲

### 決策 3: 確認清單可覆寫審核日期
- 選擇：確認清單的 remittance_settings.paymentDate 為最終值，覆寫 payment_requests.payment_date
- 原因：實際匯款日可能因銀行假日、資金調度調整
- 同步方向：payment_requests.payment_date → 預設值（初始化時讀取） → remittance_settings.paymentDate → 最終值（同步下游）

### 決策 4: 無日期 fallback 行為
- 選擇：未填日期的請款不加日期後綴，維持原 groupKey
- 原因：向後相容，舊資料不受影響
- 效果：有日期的分開顯示，無日期的按原邏輯合併

## 資料流

```
[請款工作台 - 審核]
     │
     │ 核准 + 填入匯款日
     ▼
payment_requests.payment_date = '2026-03-05'
payment_requests.status = 'confirmed'
     │
     │ 建立確認單（現有流程）
     ▼
payment_confirmations + confirmation_items
     │
     │ 載入確認清單
     ▼
[已確認請款清單 - PaymentOverviewTab]
     │
     │ 初始化：讀取 payment_requests.payment_date 作為預設
     │ 使用者可修改
     ▼
remittance_settings[groupKey].paymentDate = '2026-03-05'
     │
     │ aggregation：groupKey + paymentDate → 分組
     ▼
mergedMap key = "acct_1234567890_d2026-03-05"
     │
     │ 儲存設定 → RPC update_remittance_settings()
     ▼
accounting_expenses.payment_date = '2026-03-05'（自動同步）
```

## 元件結構

```
ReviewSection.tsx（修改）
  └─ 新增：PaymentDatePicker（日期選擇器，內嵌於核准區域）

PaymentOverviewTab.tsx（修改）
  └─ initializeSettings()：新增讀取 payment_requests.payment_date 邏輯

aggregation.ts（修改）
  └─ aggregateMonthlyRemittanceGroups()
       └─ Phase 1：mergedMap key 加入 paymentDate 維度
       └─ Phase 4 consolidateEmployeeGroups()：需適配新 key 格式

confirmed-payments/page.tsx（修改）
  └─ 查詢時 JOIN payment_requests 取得 payment_date
```

## 依賴關係

```
006 依賴 005（groupKey 定義）
006 不影響 001-004（已完成，無交集）
006 修改的 aggregation.ts 剛被當前 session 修改過（consolidateEmployeeGroups）
  → 需注意 consolidateEmployeeGroups 中的 key matching 邏輯
     可能需要 strip 日期後綴再比對 displayName
```
