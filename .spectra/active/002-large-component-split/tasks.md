# Tasks: 大型元件拆分 — QuotationItemsFlatView + QuotationItemsList

spec-id: 002-large-component-split
預估任務數：10
可平行任務：4

## 任務清單

### Phase 1: 共用層提取（消除重複）

- [P] T-1: 建立 `shared/payment-status.ts` — `src/components/quotes/v2/shared/payment-status.ts`
  - 從 FlatView 提取 PaymentStatus type、PAYMENT_STATUS_CONFIG、getPaymentStatus()、isVerificationPassed()、INVOICE_REGEX
  - 泛化型別約束（PaymentStatusFields interface）使兩邊都能使用

- [P] T-2: 建立 `shared/useReferenceData.ts` — `src/components/quotes/v2/shared/useReferenceData.ts`
  - 合併兩邊相同的 kols + categories useEffect
  - 包含 categoryOptions、kolOptions、getServiceOptionsForKol 的 useMemo

- [P] T-3: 建立 `shared/quotation-item-utils.ts` — `src/components/quotes/v2/shared/quotation-item-utils.ts`
  - 提取 isDataLocked()、isPaymentLocked()
  - 提取 FlatView 的 getSortValue()（僅 FlatView 用，但邏輯上屬於工具函數）

- [S] T-4: 更新兩個元件使用 shared 模組（依賴 T-1, T-2, T-3）— `src/components/quotes/v2/QuotationItemsFlatView.tsx`, `src/components/quotes/v2/QuotationItemsList.tsx`
  - 刪除重複定義，改為 import from shared/
  - 執行 `npx tsc --noEmit` 驗證

### Phase 2: FlatView 拆分

- [P] T-5: 提取 `flat-view/useFlatViewState.ts` — `src/components/quotes/v2/flat-view/useFlatViewState.ts`
  - 搜尋、篩選、選取、分頁、欄位顯示狀態
  - processedItems + paginatedItems 計算邏輯

- [P] T-6: 提取 `flat-view/FlatViewRow.tsx` + `flat-view/ColumnVisibilityPopover.tsx` — `src/components/quotes/v2/flat-view/FlatViewRow.tsx`, `src/components/quotes/v2/flat-view/ColumnVisibilityPopover.tsx`
  - FlatViewRow：18 欄渲染邏輯 + sticky cell helpers + React.memo
  - ColumnVisibilityPopover：從 FlatView 原封不動移出

- [S] T-7: 重構 `QuotationItemsFlatView.tsx` 為組裝層（依賴 T-4, T-5, T-6）— `src/components/quotes/v2/QuotationItemsFlatView.tsx`
  - 組裝 useFlatViewState + useReferenceData + mutation hooks
  - 保留表頭渲染（SortableHeader 綁定）+ handlers + modals
  - 目標 ≤ 300 行

### Phase 3: ItemsList 拆分

- [P] T-8: 提取 `items-list/useItemsListState.ts` + `items-list/useSaveItems.ts` + `items-list/PasteProcessor.ts` — `src/components/quotes/v2/items-list/useItemsListState.ts`, `src/components/quotes/v2/items-list/useSaveItems.ts`, `src/components/quotes/v2/items-list/PasteProcessor.ts`
  - useItemsListState：fetchItems、items/originalItems/deletedItemIds、isDirty、CRUD handlers
  - useSaveItems：完整 save 邏輯（auto-create KOL + service + upsert + delete + 總額計算 + 銷項同步）
  - PasteProcessor：processPasteData 純函數

- [P] T-9: 提取 `items-list/ItemsListRow.tsx` — `src/components/quotes/v2/items-list/ItemsListRow.tsx`
  - 單列渲染 + 追加模式樣式 + 合併標記 badge + 請款狀態
  - React.memo

- [S] T-10: 重構 `QuotationItemsList.tsx` 為組裝層（依賴 T-4, T-8, T-9）— `src/components/quotes/v2/QuotationItemsList.tsx`
  - 組裝 useItemsListState + useSaveItems + useReferenceData
  - 保留 toolbar + sort + modals
  - 目標 ≤ 300 行

### Phase 4: 驗證

- [S] T-11: 全面驗證（依賴 T-7, T-10）
  - `npx tsc --noEmit` 零錯誤
  - `npm run build` 通過
  - 手動測試試算表模式（搜尋/篩選/排序/分頁/欄位隱藏/編輯/批量發票/附件/請款/審核/駁回）
  - 手動測試報價模式（展開→編輯/新增/刪除/Excel 貼上/追加模式/儲存/取消）

## 標記說明

- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消
