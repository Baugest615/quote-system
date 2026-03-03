# Spec: 大型元件拆分 — QuotationItemsFlatView + QuotationItemsList

spec-id: 002-large-component-split
版本：1.0
最後更新：2026-03-04

## 功能需求

### 必要（Must Have）

- FR-1: 提取 `payment-status.ts` 共用模組 — PaymentStatus type、PAYMENT_STATUS_CONFIG、getPaymentStatus()、isVerificationPassed()、INVOICE_REGEX
- FR-2: 提取 `useReferenceData.ts` hook — kols + categories fetch + categoryOptions + kolOptions generation
- FR-3: 提取 `quotation-item-utils.ts` — isDataLocked()、isPaymentLocked() lock 判斷
- FR-4: 提取 `useFlatViewState.ts` hook — 搜尋/篩選/選取/分頁/欄位顯示狀態管理
- FR-5: 提取 `FlatViewRow.tsx` 子元件 — 單列渲染 + React.memo
- FR-6: 提取 `ColumnVisibilityPopover.tsx` — 從 FlatView 移出為獨立檔案
- FR-7: 提取 `useItemsListState.ts` hook — items/originalItems/deletedItemIds/isDirty/CRUD handlers
- FR-8: 提取 `useSaveItems.ts` hook — 完整 save 邏輯（auto-create KOL/service + upsert + delete + sync）
- FR-9: 提取 `PasteProcessor.ts` — Excel 貼上解析邏輯（processPasteData）
- FR-10: 提取 `ItemsListRow.tsx` 子元件 — 單列渲染 + React.memo
- FR-11: 重構後的 `QuotationItemsFlatView.tsx` 為組裝層 ≤ 300 行
- FR-12: 重構後的 `QuotationItemsList.tsx` 為組裝層 ≤ 300 行

### 可選（Nice to Have）

- FR-N1: 提取 `FlatViewToolbar.tsx` — 搜尋 + 批量發票 + 欄位管理
- FR-N2: 提取 `ItemsListToolbar.tsx` — 新增 + 貼上 + 儲存/取消
- FR-N3: 提取 `FlatViewModals.tsx` — 附件 + 駁回 Modal

## 技術規格

### 目錄結構（重構後）

```
src/components/quotes/v2/
├── shared/
│   ├── payment-status.ts          ← FR-1
│   ├── useReferenceData.ts        ← FR-2
│   └── quotation-item-utils.ts    ← FR-3
├── flat-view/
│   ├── useFlatViewState.ts        ← FR-4
│   ├── FlatViewRow.tsx            ← FR-5
│   └── ColumnVisibilityPopover.tsx ← FR-6
├── items-list/
│   ├── useItemsListState.ts       ← FR-7
│   ├── useSaveItems.ts            ← FR-8
│   ├── PasteProcessor.ts          ← FR-9
│   └── ItemsListRow.tsx           ← FR-10
├── QuotationItemsFlatView.tsx     ← FR-11 (重構)
├── QuotationItemsList.tsx         ← FR-12 (重構)
├── QuotesDataGrid.tsx             ← 不動
├── EditableCell.tsx               ← 不動
├── SearchableSelectCell.tsx       ← 不動
├── AttachmentUploader.tsx         ← 不動
└── BatchInvoicePopover.tsx        ← 不動
```

### shared/payment-status.ts

```typescript
export type PaymentStatus = 'pending' | 'requested' | 'approved' | 'rejected'

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; className: string }>

export const INVOICE_REGEX: RegExp

// 通用型別約束：只需有這些欄位的物件即可
interface PaymentStatusFields {
  approved_at: string | null
  requested_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
}

export function getPaymentStatus(item: PaymentStatusFields): PaymentStatus
export function isVerificationPassed(item: { attachments: unknown; invoice_number: string | null }): boolean
```

### shared/useReferenceData.ts

```typescript
// 合併兩邊相同的 kols + categories fetch + options generation
export function useReferenceData(): {
  kols: KolWithServices[]
  categories: QuoteCategory[]
  categoryOptions: { label: string; value: string }[]
  kolOptions: { label: string; value: string; subLabel?: string }[]
  getServiceOptionsForKol: (kolId: string | null) => { label: string; value: string }[]
}
```

### shared/quotation-item-utils.ts

```typescript
// FlatView 版本
export function isDataLocked(item: { approved_at: string | null; quotations?: { status: string }; is_supplement?: boolean }): boolean
export function isPaymentLocked(item: { approved_at: string | null }): boolean

// ItemsList 版本的鎖定邏輯整合
// isLocked = !!item.approved_at || isOriginalInSupplement
// isApproved = !!item.approved_at
// canDelete = 組合判斷
```

### flat-view/FlatViewRow.tsx

```typescript
interface FlatViewRowProps {
  item: FlatQuotationItem
  // 狀態
  selected: boolean
  isActionLoading: boolean
  isEditor: boolean
  // 欄位顯示
  isColVisible: (key: ColumnKey) => boolean
  // handlers
  onToggleSelect: (id: string) => void
  onUpdateField: (id: string, field: string, value: unknown) => void
  onKolChange: (item: FlatQuotationItem, value: string) => void
  onServiceChange: (item: FlatQuotationItem, value: string) => void
  onOpenAttachment: (item: FlatQuotationItem) => void
  onRequestPayment: (item: FlatQuotationItem) => void
  onApprovePayment: (item: FlatQuotationItem) => void
  onOpenReject: (id: string) => void
  // 參考資料
  categoryOptions: { label: string; value: string }[]
  kolOptions: { label: string; value: string; subLabel?: string }[]
  getServiceOptionsForKol: (kolId: string | null) => { label: string; value: string }[]
}

export const FlatViewRow = memo(function FlatViewRow(props: FlatViewRowProps) { ... })
```

### items-list/ItemsListRow.tsx

```typescript
interface ItemsListRowProps {
  item: QuotationItemWithPayments
  kols: KolWithServices[]
  // 狀態
  isLocked: boolean
  isApproved: boolean
  canDelete: boolean
  isOriginalInSupplement: boolean
  isItemLoading: boolean
  readOnly: boolean
  // handlers
  onUpdateItem: (id: string, updates: Partial<QuotationItem>) => void
  onKolChange: (id: string, value: string) => void
  onServiceChange: (id: string, value: string, data?: { price: number; cost: number }) => void
  onDeleteItem: (id: string) => void
  onOpenVerification: (item: QuotationItemWithPayments) => void
  // 參考資料
  categoryOptions: { label: string; value: string }[]
  kolOptions: { label: string; value: string; subLabel?: string }[]
  serviceOptions: { label: string; value: string; data?: { price: number; cost: number } }[]
}

export const ItemsListRow = memo(function ItemsListRow(props: ItemsListRowProps) { ... })
```

### items-list/useSaveItems.ts

```typescript
interface UseSaveItemsOptions {
  quotationId: string
  isSupplementMode: boolean
  kols: KolWithServices[]
  onSuccess: () => void  // fetchItems + onUpdate callback
}

export function useSaveItems(options: UseSaveItemsOptions): {
  handleSave: (items: QuotationItemWithPayments[], originalItems: QuotationItemWithPayments[]) => Promise<void>
  isSaving: boolean
}
```

## 驗收標準

- [ ] AC-1: `npx tsc --noEmit` 零錯誤
- [ ] AC-2: `npm run build` 通過
- [ ] AC-3: 報價單頁面「試算表模式」功能正常（搜尋、篩選、排序、分頁、欄位隱藏、單欄編輯、批量發票、附件上傳、請款/審核/駁回）
- [ ] AC-4: 報價單頁面「報價模式」展開明細功能正常（編輯、新增、刪除、Excel 貼上、排序、追加模式、鎖定、儲存、取消）
- [ ] AC-5: 請款管理功能正常（狀態顯示、檢核 modal、合併標記 badge、合併組連結）
- [ ] AC-6: 每個新模組 ≤ 300 行
- [ ] AC-7: `QuotationItemsFlatView.tsx` 重構後 ≤ 300 行
- [ ] AC-8: `QuotationItemsList.tsx` 重構後 ≤ 300 行
- [ ] AC-9: 零重複的 PaymentStatus/getPaymentStatus/isVerificationPassed 定義
- [ ] AC-10: FlatViewRow 和 ItemsListRow 使用 React.memo

## 非功能需求

- **效能**：FlatViewRow + React.memo 應減少不必要重渲染（可用 React DevTools Profiler 驗證）
- **向後相容**：QuotationItemsFlatView 和 QuotationItemsList 的 export 介面不變，消費者（page.tsx、QuotesDataGrid）無需修改
- **安全**：純重構，不涉及新的資料存取或權限邏輯
