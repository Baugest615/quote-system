# Design: 大型元件拆分 — QuotationItemsFlatView + QuotationItemsList

spec-id: 002-large-component-split

## 架構決策

### 決策 1: 混合拆分策略（C 方案）

- 選擇：先提取共用層 → 再提取 hooks → 再拆子元件
- 原因：
  - 單純水平切（只抽 hook）無法解決渲染層 700+ 行的問題
  - 單純垂直切（只拆子元件）無法消除重複代碼
  - 混合方案同時解決兩個問題
- 替代方案：
  - A 水平切 — 拒絕：渲染層仍然過大
  - B 垂直切 — 拒絕：不消除重複

### 決策 2: 維持資料管理策略不統一

- 選擇：FlatView 繼續 React Query，ItemsList 繼續 local state
- 原因：場景本質不同
  - FlatView：跨報價只讀+逐欄編輯，React Query 的 cache invalidation 正好適用
  - ItemsList：單報價 CRUD，支援新增/刪除/貼上/批次儲存，需要 local state 的靈活性
- 替代方案：
  - 統一為 React Query — 拒絕：ItemsList 的 save 流程（auto-create KOL + service + upsert + delete）太複雜，改為逐欄 mutation 不現實

### 決策 3: 共用邏輯放在 v2/shared/ 而非 lib/

- 選擇：`src/components/quotes/v2/shared/`
- 原因：這些邏輯僅被 v2 元件使用，就近管理更直覺
- 替代方案：
  - `src/lib/quotation-items/` — 拒絕：過度抽象，這不是跨模組共用的業務邏輯

### 決策 4: Row 元件的 props 設計

- 選擇：扁平 props（每個 handler 獨立傳入）
- 原因：
  - 方便 React.memo 的 shallow compare
  - 避免物件 prop 導致不必要重渲染
- 替代方案：
  - 傳入 context — 拒絕：Row 元件數量多（50/頁），context 不如 memo + props 精確控制

### 決策 5: PasteProcessor 為純函數模組

- 選擇：`PasteProcessor.ts`（非 React 元件/hook）
- 原因：Excel 解析是純資料轉換，不需要 React 生命週期
- 好處：可獨立單元測試

## 資料流

### FlatView 資料流（重構後）

```
useQuotationItemsFlat() → items (React Query)
         ↓
useFlatViewState(items) → { processedItems, paginatedItems, searchTerm,
                            selectedIds, visibleColumns, sortState, filters }
         ↓
useReferenceData() → { kols, categories, categoryOptions, kolOptions, getServiceOptionsForKol }
         ↓
QuotationItemsFlatView (組裝層)
├── FlatViewToolbar ← { searchTerm, selectedIds, visibleColumns, onBatchInvoice }
├── <thead> (表頭仍在組裝層，因為 SortableHeader + ColumnFilterPopover 的 state 綁定)
├── FlatViewRow × N ← { item, handlers, options } (React.memo)
├── Pagination ← { currentPage, totalPages }
└── Modals ← { attachmentItem, rejectingItemId }
```

### ItemsList 資料流（重構後）

```
useItemsListState(quotationId) → { items, originalItems, isDirty,
                                    handleUpdateItem, handleAddItem,
                                    handleDeleteItem, setItems }
         ↓
useSaveItems({ quotationId, kols, isSupplementMode }) → { handleSave, isSaving }
         ↓
useReferenceData() → { kols, categories, categoryOptions, kolOptions }
         ↓
QuotationItemsList (組裝層)
├── Toolbar ← { isDirty, isSaving, readOnly, isSupplementMode }
├── <thead> (表頭 + sort icons)
├── ItemsListRow × N ← { item, handlers, options } (React.memo)
├── Verification Modal
└── Paste Modal + PasteProcessor
```

## 元件結構（重構後）

```
quotes/v2/
├── shared/
│   ├── payment-status.ts           30 行  常數+工具
│   ├── useReferenceData.ts         40 行  hook
│   └── quotation-item-utils.ts     30 行  工具
├── flat-view/
│   ├── useFlatViewState.ts        120 行  hook
│   ├── FlatViewRow.tsx            250 行  React.memo
│   └── ColumnVisibilityPopover.tsx 70 行  子元件
├── items-list/
│   ├── useItemsListState.ts       100 行  hook
│   ├── useSaveItems.ts            200 行  hook
│   ├── PasteProcessor.ts           80 行  純函數
│   └── ItemsListRow.tsx           170 行  React.memo
├── QuotationItemsFlatView.tsx     250 行  組裝層
├── QuotationItemsList.tsx         200 行  組裝層
├── QuotesDataGrid.tsx             586 行  不動
├── EditableCell.tsx                 -     不動
├── SearchableSelectCell.tsx         -     不動
├── AttachmentUploader.tsx           -     不動
└── BatchInvoicePopover.tsx          -     不動
```

## 依賴關係

```
QuotationItemsFlatView
├── shared/payment-status
├── shared/useReferenceData
├── shared/quotation-item-utils
├── flat-view/useFlatViewState
├── flat-view/FlatViewRow
├── flat-view/ColumnVisibilityPopover
├── hooks/useQuotationItemsFlat (不動)
├── hooks/useTableSort (不動)
├── hooks/useColumnFilters (不動)
└── lib/permissions (不動)

QuotationItemsList
├── shared/payment-status
├── shared/useReferenceData
├── items-list/useItemsListState
├── items-list/useSaveItems
├── items-list/PasteProcessor
├── items-list/ItemsListRow
└── lib/kol/auto-create-kol (不動，但 save hook 內部使用)
```

## 移除/清理項

重構完成後從原檔案中移除的重複代碼：
- QuotationItemsList 中的 `PaymentStatus` type、`PAYMENT_STATUS_CONFIG`、`getPaymentStatus()`、`isVerificationPassed()` → 改從 shared/ import
- 兩邊的 kols/categories useEffect → 改用 useReferenceData()
- 兩邊的 categoryOptions/kolOptions useMemo → 改從 useReferenceData() 取得
