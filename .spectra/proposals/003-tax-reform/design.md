# Design: 營業稅計算改革

spec-id: 003-tax-reform

## 架構決策

### 決策 1: 稅率計算位置 — 集中式工具函數

- 選擇：新增 `src/lib/tax-utils.ts`，所有稅率計算統一呼叫此函數
- 原因：避免散落在多處的 `* 1.05` 硬編碼，未來稅率變更只改一處
- 替代方案：在各請款入口各自計算 → 拒絕，因為重複邏輯且容易遺漏

### 決策 2: cost 存未稅，cost_amount 存含稅

- 選擇：DB 中 `cost` = 未稅，`cost_amount` = 含稅（實際匯款金額）
- 原因：`cost_amount` 的語意本來就是「實際要付的錢」，符合業務需求
- 替代方案：兩者都存未稅，前端顯示時才算 → 拒絕，因為已確認的帳務金額會對不上

### 決策 3: 只反算 ej@ 的資料

- 選擇：只反算 ej@（574bc155）的公司行號 cost
- 原因：portia@ 和 franky@ 已確認是未稅金額
- 風險：依賴使用者的判斷，但已在討論中確認

## 資料流

### 報價單 → 請款（FlatView 路徑）

```
使用者輸入 cost（未稅）
  → 存入 quotation_items.cost
  → 按「請款」
  → 讀取 KOL bankType
  → calculatePaymentAmount(cost, bankType)
    → company: Math.round(cost * 1.05)
    → individual: cost
  → 存入 quotation_items.cost_amount
  → 存入 quotation_items.requested_at / requested_by
```

### 待請款頁路徑

```
載入 quotation_items.cost
  → 讀取 KOL bankType
  → cost_amount_input = calculatePaymentAmount(cost, bankType)
  → 使用者可手動調整
  → 送出時 → payment_requests.cost_amount = cost_amount_input
```

## 新增檔案

```
src/lib/tax-utils.ts          ← 稅率計算工具函數
```

## 修改檔案清單

```
src/hooks/useQuotationItemsFlat.ts                     ← 請款 mutation
src/components/quotes/v2/QuotationItemsFlatView.tsx     ← handleRequestPayment
src/hooks/pending-payments/usePendingItems.ts           ← cost 載入轉換
src/hooks/pending-payments/usePaymentSubmission.ts      ← 送出驗證
src/components/quotes/v2/flat-view/FlatViewRow.tsx      ← UI 標示
src/components/quotes/v2/flat-view/flat-view-constants.ts ← 欄位名稱
src/components/quotes/v2/QuotationItemsList.tsx         ← UI 標示
src/components/quotes/v2/items-list/ItemsListRow.tsx    ← UI 標示
src/components/pending-payments/CompactItemRow.tsx      ← UI 標示
src/components/pending-payments/ProjectGroupView.tsx    ← UI 標示
src/components/payments/requests/RequestItemRow.tsx     ← UI 標示
```

## 依賴關係

- `tax-utils.ts` 被 `useQuotationItemsFlat.ts`、`usePendingItems.ts`、`QuotationItemsFlatView.tsx` 引用
- KOL 的 `bankType` 資料來自 `kols.bank_info` JSONB 欄位
- `getSmartDefaults`（`useExpenseDefaults.ts`）已有讀取 bankType 的邏輯，可複用其取值方式
