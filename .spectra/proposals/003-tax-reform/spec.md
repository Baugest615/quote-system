# Spec: 營業稅計算改革

spec-id: 003-tax-reform
版本：1.0
最後更新：2026-03-05

## 功能需求

### 必要（Must Have）

- **FR-1**: 資料遷移 — 反算 ej@（574bc155）的公司行號 quotation_items.cost 為未稅（`Math.round(cost / 1.05)`），共 17 筆有成本的項目
- **FR-2**: 請款計算邏輯 — FlatView 的 `handleRequestPayment` 在送出時依 KOL bankType 計算 cost_amount：公司 `Math.round(cost * 1.05)`，個人 `cost`
- **FR-3**: 請款計算邏輯 — 待請款頁 `usePendingItems` 載入 cost 到 `cost_amount_input` 時，公司行號自動轉含稅
- **FR-4**: 請款計算邏輯 — `usePaymentSubmission` 送出時確保 cost_amount 是含稅金額
- **FR-5**: UI 標示 — 報價單明細的成本欄標題改為「成本（未稅）」
- **FR-6**: UI 標示 — 請款相關頁面的金額顯示標為「請款金額（含稅）」

### 不做（Out of Scope）

- payment_requests 表的 cost_amount 不改（已存的是實際請款金額）
- portia@ 和 franky@ 的資料不反算（已經是未稅）
- 已核准項目的 cost_amount 不動（只有 1 筆且是個人）

## 技術規格

### 資料遷移

**對象**：`quotation_items` 表中 `requested_by = '574bc155-08f4-4e10-8cbe-33ecfe3da07f'` 且 KOL 的 `bankType = 'company'` 且 `cost > 0` 的項目

**公式**：`cost = Math.round(cost / 1.05)`

**受影響項目 ID 與預期結果**：

| cost（含稅） | cost（未稅） | 整除 |
|-------------|-------------|------|
| 6,300 | 6,000 | Y |
| 13,650 | 13,000 | Y |
| 53,550 | 51,000 | Y |
| 126,000 | 120,000 | Y |
| 47,250 | 45,000 | Y |
| 42,000 | 40,000 | Y |
| 28,350 × 2 | 27,000 | Y |
| 30,450 | 29,000 | Y |
| 36,750 | 35,000 | Y |
| 44,300 | 42,190 | N |
| 23,300 | 22,190 | N |
| 65,000 | 61,905 | N |
| 25,000 | 23,810 | N |
| 250,000 | 238,095 | N |
| 53,000 | 50,476 | N |
| 35,000 | 33,333 | N |

### 請款計算公式

```typescript
// 稅金計算工具函數（新增）
function calculatePaymentAmount(cost: number, bankType: string | undefined): number {
  if (bankType === 'company') {
    return Math.round(cost * 1.05)
  }
  return cost
}
```

### 修改的前端元件/Hook

| 檔案 | 修改內容 |
|------|---------|
| `src/hooks/useQuotationItemsFlat.ts` | `useRequestPayment` 的 costAmount 計算加入稅率 |
| `src/components/quotes/v2/QuotationItemsFlatView.tsx` | `handleRequestPayment` 傳入 bankType 判斷 |
| `src/hooks/pending-payments/usePendingItems.ts` | cost → cost_amount_input 轉換時加稅 |
| `src/hooks/pending-payments/usePaymentSubmission.ts` | 確認送出金額是含稅 |
| `src/components/quotes/v2/flat-view/FlatViewRow.tsx` | 成本欄標題加「（未稅）」 |
| `src/components/quotes/v2/flat-view/flat-view-constants.ts` | 欄位名稱調整 |
| `src/components/quotes/v2/QuotationItemsList.tsx` | 成本欄標題加「（未稅）」 |
| `src/components/quotes/v2/items-list/ItemsListRow.tsx` | 成本欄標題加「（未稅）」 |
| `src/components/pending-payments/CompactItemRow.tsx` | 成本輸入 placeholder 加「（未稅）」 |
| `src/components/pending-payments/ProjectGroupView.tsx` | 欄位標題調整 |
| `src/components/payments/requests/RequestItemRow.tsx` | 請款金額標為「（含稅）」 |

### 新增的共用工具

| 檔案 | 內容 |
|------|------|
| `src/lib/tax-utils.ts` | `calculatePaymentAmount(cost, bankType)` 工具函數 |

## 驗收標準

- [ ] AC-1: ej@ 的 17 筆公司行號 cost 已反算為未稅（可驗證：`cost * 1.05` 約等於原含稅金額）
- [ ] AC-2: 在 FlatView 對公司行號 KOL 按「請款」，cost_amount 自動為 `Math.round(cost * 1.05)`
- [ ] AC-3: 在 FlatView 對個人 KOL 按「請款」，cost_amount = cost（不加稅）
- [ ] AC-4: 待請款頁載入時，公司行號的 cost_amount_input 顯示含稅金額
- [ ] AC-5: 報價單明細的成本欄標題顯示「成本（未稅）」
- [ ] AC-6: 請款金額顯示處標為「（含稅）」
- [ ] AC-7: TypeScript 編譯通過（`npx tsc --noEmit`）
- [ ] AC-8: 既有測試通過（`npm test`）

## 非功能需求

- 效能：無影響（計算為簡單乘除法）
- 安全：資料遷移需備份（已完成）
