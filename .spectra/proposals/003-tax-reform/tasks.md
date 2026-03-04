# Tasks: 營業稅計算改革

spec-id: 003-tax-reform
預估任務數：6
可平行任務：3

## 任務清單

### Phase 1: 基礎建設 + 資料遷移

- [P]( ) T-1: 建立稅率計算工具函數 — `src/lib/tax-utils.ts`
  - 新增 `calculatePaymentAmount(cost, bankType)` 函數
  - 新增 `TAX_RATE = 0.05` 常數
  - 新增 `removeBusinessTax(amount)` 反算函數（給資料遷移用）

- [P]( ) T-2: 資料遷移 — 反算 ej@ 公司行號 cost
  - 使用 Supabase REST API 逐筆更新 17 筆 cost
  - 公式：`cost = Math.round(cost / 1.05)`
  - 更新後驗證：每筆 `cost * 1.05` ≈ 原始含稅金額（誤差 < 1）

### Phase 2: 請款計算邏輯修改

- [S]( ) T-3: 修改 FlatView 請款流程（依賴 T-1）
  - `src/components/quotes/v2/QuotationItemsFlatView.tsx` — handleRequestPayment 加入 bankType 判斷
  - `src/hooks/useQuotationItemsFlat.ts` — useRequestPayment 無需改（接收已計算的 costAmount）

- [S]( ) T-4: 修改待請款頁載入與送出邏輯（依賴 T-1）
  - `src/hooks/pending-payments/usePendingItems.ts` — cost 載入時轉含稅
  - `src/hooks/pending-payments/usePaymentSubmission.ts` — 確認送出金額正確

### Phase 3: UI 標示調整

- [P]( ) T-5: 報價單相關 UI 標示「（未稅）」
  - `src/components/quotes/v2/flat-view/flat-view-constants.ts` — 欄位名稱
  - `src/components/quotes/v2/flat-view/FlatViewRow.tsx` — 成本欄
  - `src/components/quotes/v2/QuotationItemsList.tsx` — 成本欄
  - `src/components/quotes/v2/items-list/ItemsListRow.tsx` — 成本欄

- [P]( ) T-6: 請款相關 UI 標示「（含稅）」
  - `src/components/pending-payments/CompactItemRow.tsx` — 成本輸入
  - `src/components/pending-payments/ProjectGroupView.tsx` — 欄位標題
  - `src/components/payments/requests/RequestItemRow.tsx` — 請款金額

### Phase 4: 驗證

- [S]( ) T-7: TypeScript 編譯 + 測試驗證（依賴 T-3~T-6）
  - `npx tsc --noEmit` 通過
  - `npm test` 通過
  - 手動驗證資料遷移結果

## 標記說明
- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消
