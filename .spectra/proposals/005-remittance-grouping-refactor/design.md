# Design: 匯款分組（Remittance Grouping）完整重構

spec-id: 005-remittance-grouping-refactor

## 架構決策

### 決策 1: 分組 key 策略

- 選擇：帳號為主、kol_id 為輔、名稱為末（三級 fallback）
- 原因：帳號是最穩定的識別符，不受名稱修改影響；kol_id 補充無帳號場景
- 替代方案：
  - 純 kol_id → 個人報帳無 kol_id，同一 KOL 多帳號應分開匯款
  - 引入 remittee 實體 → 工程量最大，短期 ROI 不高

### 決策 2: 共用推導函數的位置

- 選擇：放在 `src/lib/payments/remittee.ts`（新檔案）
- 原因：工作台 (`hooks/payment-workbench/`) 和確認清單 (`lib/payments/`) 都需要引用，放在 `lib/payments/` 下讓兩邊都能 import
- 替代方案：
  - 放在 `hooks/payment-workbench/grouping.ts` → 確認清單無法引用 hooks 層
  - 放在 `lib/payments/grouping.ts` → 該檔案已經很長，職責混雜

### 決策 3: normalize 策略

- 選擇：在 `groupItemsByRemittance()` 內部實作 normalize，不暴露中間型別
- 原因：normalize 是分組的實作細節，不需要被外部使用；減少 public API 面積
- 替代方案：
  - 暴露 `normalizeItems()` 公開函數 → 增加維護負擔，目前無外部使用場景

### 決策 4: settings key 遷移策略

- 選擇：漸進遷移（讀取時嘗試 groupKey，fallback 到 remittanceName）
- 原因：避免一次性 migration 的風險；前端新寫入一律用 groupKey，舊資料逐步淘汰
- 替代方案：
  - 一次性 DB migration → 風險高，需要 downtime 或複雜的雙寫機制

## 資料流

### 現有流程（重構前）

```
PaymentConfirmationItems
  │
  ├── source_type = 'personal' ──→ 各自推導 remittanceName ──┐
  ├── source_type = 'quotation' ─→ 各自推導 remittanceName ──┤
  └── source_type = 'project' ──→ 各自推導 remittanceName ──┘
                                                              │
                                          groupItemsByRemittance()
                                              key = remittanceName
                                                              │
                                                     RemittanceGroup[]
                                                              │
                                          aggregateMonthlyRemittanceGroups()
                                              key = remittanceName
                                              settings = confirmations[*].remittance_settings[remittanceName]
                                                              │
                                                  MergedRemittanceGroup[]
                                                              │
                                              splitRemittanceGroups()
                                                              │
                                    ┌───────────┼──────────────┐
                              個人/勞報      公司行號        員工
```

### 重構後流程

```
PaymentConfirmationItems
  │
  ├── source_type = 'personal' ──┐
  ├── source_type = 'quotation' ─┤──→ normalizeItem() ──→ NormalizedRemitteeItem
  └── source_type = 'project' ──┘        │
                                          │ deriveRemitteeInfo(kol, bankInfo)  ← 共用函數
                                          │
                                    groupByKey()
                                        key = groupKey (acct_xxx / kol_xxx / personal_xxx)
                                          │
                                  RemittanceGroup[] (含 groupKey)
                                          │
                              aggregateMonthlyRemittanceGroups()
                                  key = groupKey
                                  settings = sameConfirmation.remittance_settings[groupKey]
                                  fallback: settings[remittanceName] (向下相容)
                                          │
                              MergedRemittanceGroup[] (含 groupKey)
                                          │
                              splitRemittanceGroups()  ← 邏輯不變
                                          │
                        ┌───────────┼──────────────┐
                  個人/勞報      公司行號        員工
```

### 工作台流程（重構後）

```
WorkbenchItems
  │
  deriveRemitteeInfo(kol, bankInfo)  ← 同一個共用函數
  │
  groupByRemittee()
      key = groupKey
  │
  RemitteeGroup[]
  │
  groupByCategory()  ← 邏輯不變（individual / company / unknown）
  │
  CategorySection[]
```

## 元件結構

不新增元件。修改的模組關係：

```
src/lib/payments/
├── remittee.ts          ← 新增：deriveRemitteeInfo(), makeGroupKey()
├── grouping.ts          ← 修改：groupItemsByRemittance() 改用 normalize + group
├── aggregation.ts       ← 修改：mergedMap key 改用 groupKey, settings 讀取修正
└── types.ts             ← 修改：新增 RemitteeInfo, NormalizedRemitteeItem; RemittanceGroup/MergedRemittanceGroup 加 groupKey

src/hooks/payment-workbench/
├── grouping.ts          ← 修改：deriveAccountInfo() 改為引用 deriveRemitteeInfo()
└── types.ts             ← 可能微調（若 groupKey 需要暴露到 RemitteeGroup）
```

## 依賴關係

```
remittee.ts (新)
  ↑ 被引用
  ├── lib/payments/grouping.ts
  ├── lib/payments/aggregation.ts
  └── hooks/payment-workbench/grouping.ts

types.ts (修改)
  ↑ 被引用
  ├── lib/payments/grouping.ts
  ├── lib/payments/aggregation.ts
  ├── components/payments/confirmed/tabs/PaymentOverviewTab.tsx
  ├── components/payments/confirmed/tabs/WithholdingTab.tsx
  └── hooks/payment-workbench/types.ts（間接）
```
