# 討論：大型元件拆分 — QuotationItemsFlatView + QuotationItemsList

日期：2026-03-04
狀態：已收斂

## 背景

`quotes/v2/` 模組有兩個超過 1,000 行的巨型元件，已成為維護瓶頸：

| 元件 | 行數 | 資料策略 | 功能定位 |
|------|------|----------|----------|
| `QuotationItemsFlatView.tsx` | 1,195 | React Query (逐欄即時存) | 跨報價攤平試算表 |
| `QuotationItemsList.tsx` | 1,109 | Local state (批次存) | 單報價明細編輯 |

### 結構分析

**FlatView 職責拆解（1,195 行）**：
- 常數/型別/工具函數（~95 行）：ColumnKey、PaymentStatus、COLUMN_DEFS、排序值、鎖定判斷
- ColumnVisibilityPopover 子元件（~70 行）
- 主元件狀態宣告（~65 行）：11 useState + 5 hooks
- 篩選器 helpers + processedItems（~80 行）
- 選取邏輯（~30 行）
- 欄位更新 handlers（~90 行）：updateField、kolChange、serviceChange、batchInvoice、attachment
- 請款操作 handlers（~55 行）：request、approve、reject
- Sticky helpers（~15 行）
- Toolbar 渲染（~30 行）
- **表頭渲染（~160 行）**：18 欄 SortableHeader + ColumnFilterPopover
- **表體渲染（~310 行）**：18 欄 × locked/editable 雙路徑
- 分頁渲染（~30 行）
- Modals（~45 行）：附件 + 駁回

**ItemsList 職責拆解（1,109 行）**：
- 型別定義（~30 行）
- 資料載入（~45 行）：fetchItems + fetchReferenceData
- 本地編輯狀態管理（~50 行）：items/originalItems/deletedItemIds/isDirty
- CRUD handlers（~30 行）：add、update、delete
- **Save handler（~180 行！）**：自動建立 KOL → 建立服務 → upsert → 刪除 → 計算總額 → 銷項同步
- Excel 貼上邏輯（~80 行）：parsePaste + handlePaste + modal
- 排序邏輯（~65 行）：自製 sort（未用 useTableSort）
- 請款管理（~80 行）：PaymentStatus 重複定義、verification 操作
- **表格渲染（~260 行）**：header + body（含追加模式 + 合併標記）
- Toolbar 渲染（~50 行）：add、paste、save/cancel
- Verification Modal（~60 行）：發票 + 附件

### 重複代碼（兩元件之間）

| 重複項 | 行數（×2） | 說明 |
|--------|-----------|------|
| `PaymentStatus` type + `PAYMENT_STATUS_CONFIG` | ~10 | 完全相同 |
| `getPaymentStatus()` | ~6 | 邏輯相同 |
| `isVerificationPassed()` | ~6 | 邏輯相同 |
| Reference data fetch（kols, categories） | ~15 | 相同 useEffect |
| `categoryOptions` / `kolOptions` useMemo | ~6 | 相同 |
| 可編輯欄位渲染模式（locked → span / unlocked → EditableCell） | ~200 | 模式相同，欄位不同 |

## 關鍵問題

- [x] Q1: 拆分策略 → **C 混合方案**
- [x] Q2: 共用邏輯 → 提取到 `quotes/v2/shared/`
- [x] Q3: 資料管理策略 → **維持不統一**
- [x] Q4: 表格列渲染 → **抽出 + React.memo**
- [x] Q5: 拆分粒度 → **每模組 ≤ 300 行**

## 討論紀錄

### Q1: 拆分策略

**選項 A：水平切（邏輯層 / 渲染層 分離）**
```
useQuotationFlatView.ts     ← 所有 state + handlers（~400 行）
QuotationItemsFlatView.tsx  ← 純渲染（~700 行，仍偏大）

useQuotationItemsEdit.ts    ← 所有 state + handlers（~500 行）
QuotationItemsList.tsx      ← 純渲染（~600 行，仍偏大）
```
- 優點：最低風險，不改 UI 結構，只搬邏輯
- 缺點：渲染層仍然很大，表頭/表體的 JSX 密度高

**選項 B：垂直切（按職責拆子元件）**
```
FlatView/
├── FlatViewToolbar.tsx        ← 搜尋 + 批量發票 + 欄位管理
├── FlatViewTableHeader.tsx    ← 18 欄表頭
├── FlatViewTableRow.tsx       ← 單列渲染（React.memo）
├── FlatViewPagination.tsx     ← 分頁
├── FlatViewModals.tsx         ← 附件 + 駁回 Modal
└── QuotationItemsFlatView.tsx ← 組裝層（state + composition）

ItemsList/
├── ItemsListToolbar.tsx       ← 新增 + 貼上 + 儲存/取消
├── ItemsListTableRow.tsx      ← 單列渲染
├── ItemsListModals.tsx        ← 檢核 + 貼上 Modal
├── PasteProcessor.ts          ← Excel 貼上解析邏輯
└── QuotationItemsList.tsx     ← 組裝層
```
- 優點：每個子元件職責清晰、可測試、可 React.memo
- 缺點：需要在子元件間傳遞較多 props

**選項 C：混合（先抽共用 → 再各自切）** ← 建議
```
shared/
├── payment-status.ts          ← PaymentStatus + config + helpers
├── useReferenceData.ts        ← kols + categories fetch hook
├── quotation-item-utils.ts    ← lock 判斷、sort helpers

FlatView/
├── useFlatViewState.ts        ← 搜尋/篩選/選取/分頁 state
├── FlatViewToolbar.tsx
├── FlatViewRow.tsx             ← React.memo
└── QuotationItemsFlatView.tsx  ← 組裝層

ItemsList/
├── useItemsListState.ts       ← 本地編輯 + dirty detection
├── useSaveItems.ts            ← 複雜的 save 邏輯
├── PasteProcessor.ts
├── ItemsListRow.tsx            ← React.memo
└── QuotationItemsList.tsx      ← 組裝層
```
- 優點：消除重複 + 各自垂直切 + 邏輯層分離
- 缺點：改動量最大，需仔細確保不破壞

### Q2: 共用邏輯提取

**必須提取（重複代碼）**：
1. `payment-status.ts` — PaymentStatus type + PAYMENT_STATUS_CONFIG + getPaymentStatus() + isVerificationPassed()
2. `useReferenceData.ts` — kols + categories 的 fetch + options generation（兩邊完全相同的 useEffect + useMemo）

**可選提取**：
3. `quotation-item-utils.ts` — isDataLocked、isPaymentLocked（FlatView 已有，ItemsList 用不同命名但邏輯近似）
4. INVOICE_REGEX 常數

**放置位置選項**：
- **A**: `src/components/quotes/v2/shared/` — 就近放在 v2 目錄下
- **B**: `src/lib/quotation-items/` — 放到 lib 層，表示是業務邏輯
- **建議 A**：這些邏輯只被 v2 元件使用，就近管理更直覺

### Q3: 資料管理策略是否統一

**現狀**：
- FlatView：React Query mutations（逐欄即時存，`useUpdateQuotationItem`）
- ItemsList：Local state + batch save（`handleSave` 一次性 upsert）

**選項 A：維持現狀（不統一）**
- 理由：兩者場景不同
  - FlatView = 跨報價大表，逐欄存更適合（避免全部重存）
  - ItemsList = 單報價編輯，支援新增/刪除/貼上，需要 batch save
- 風險：低（各自已穩定運作）

**選項 B：統一為 React Query**
- ItemsList 改為逐欄 mutation + optimistic update
- 理由：一致性、cache 自動同步
- 風險：高（ItemsList 的新增/刪除/貼上邏輯需要大改，save 流程完全重寫）

**建議 A**：維持不統一。兩者的使用場景確實不同，強制統一的收益不值得風險。

### Q4: 表格列渲染是否抽出

**FlatView 單列 ~30 行 JSX**（但有 18 欄 × 條件顯示 = 實際 ~290 行）
**ItemsList 單列 ~25 行 JSX**（10 欄 × 條件顯示 = 實際 ~170 行）

**建議：抽出 + React.memo**
```tsx
// FlatViewRow.tsx
const FlatViewRow = memo(function FlatViewRow({
  item, locked, paymentLocked, paymentStatus, ...handlers
}: FlatViewRowProps) {
  // ~200 行渲染邏輯
})
```

**好處**：
- React.memo 可防止非必要重渲染（FlatView 50 行/頁，只有被編輯的那行需要 re-render）
- 單列邏輯集中，更容易理解和測試

### Q5: 拆分粒度

**目標**：每個模組 ≤ 300 行（理想 150-250 行）

**預估結果（選項 C）**：

FlatView 拆分後：
| 模組 | 預估行數 | 說明 |
|------|---------|------|
| `useFlatViewState.ts` | ~120 | 搜尋/篩選/選取/分頁 state |
| `FlatViewToolbar.tsx` | ~50 | 搜尋 + 批量 + 欄位管理 |
| `FlatViewRow.tsx` | ~250 | 18 欄 × 雙路徑 + memo |
| `ColumnVisibilityPopover.tsx` | ~70 | 已是獨立元件，只需移出 |
| `QuotationItemsFlatView.tsx` | ~250 | 組裝層 + 表頭 + handlers + modals |

ItemsList 拆分後：
| 模組 | 預估行數 | 說明 |
|------|---------|------|
| `useItemsListState.ts` | ~100 | items/dirty/CRUD |
| `useSaveItems.ts` | ~200 | 自動建立 KOL + 服務 + upsert + 銷項同步 |
| `PasteProcessor.ts` | ~80 | Excel 解析 |
| `ItemsListRow.tsx` | ~170 | 10 欄 + 追加模式 + memo |
| `QuotationItemsList.tsx` | ~200 | 組裝層 + toolbar + modals |

共用層：
| 模組 | 預估行數 | 說明 |
|------|---------|------|
| `shared/payment-status.ts` | ~30 | type + config + helpers |
| `shared/useReferenceData.ts` | ~40 | kols + categories + options |
| `shared/quotation-item-utils.ts` | ~30 | lock 判斷 |

**總計**：~1,590 行（原 2,304 行 → 淨減 ~700 行 + 消除重複 + 結構清晰）

## 收斂結論

1. **拆分策略**：選擇 **C 混合方案** — 先抽共用層 → 再抽 hooks → 再拆子元件
2. **資料管理策略**：**維持不統一** — FlatView 繼續 React Query，ItemsList 繼續 local state
3. **共用邏輯**：提取到 `quotes/v2/shared/`（payment-status、useReferenceData、quotation-item-utils）
4. **表格列渲染**：抽出 `FlatViewRow` / `ItemsListRow` + React.memo
5. **拆分粒度**：每模組 ≤ 300 行，預估 13 個檔案，淨減 ~700 行

## 下一步

→ 進入 `/spectra propose` 產出正式規格（proposal + spec + design + tasks）
