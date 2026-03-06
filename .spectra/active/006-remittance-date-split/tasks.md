# Tasks: 匯款日期分日架構
spec-id: 006-remittance-date-split
預估任務數：7
可平行任務：2

## 任務清單

### Phase 1: DB + 基礎設施
- [P] T-1: DB migration — payment_requests 新增 payment_date 欄位
  - `supabase/migrations/YYYYMMDD_add_payment_date_to_requests.sql`
  - ALTER TABLE + COMMENT + RLS 確認（繼承既有 policy）
- [P] T-2: 更新 TypeScript 型別
  - `src/types/database.types.ts`（重新生成）
  - `src/lib/payments/types.ts`（如需新增介面）

### Phase 2: 工作台審核 UI
- [S] T-3: ReviewSection 新增匯款日期選擇器（依賴 T-1, T-2）
  - `src/components/payment-workbench/ReviewSection.tsx`
  - 核准動作帶入 payment_date
  - 日期選擇器可選填，預設空值

### Phase 3: 確認清單 aggregation 改造
- [S] T-4: aggregation.ts 分組 key 加入 paymentDate 維度（依賴 T-1, T-2）
  - `src/lib/payments/aggregation.ts`
  - Phase 1 mergedMap 建構時讀取 payment_date
  - key 格式：`{groupKey}_d{YYYY-MM-DD}`（有日期）/ `{groupKey}`（無日期）
  - consolidateEmployeeGroups 適配新 key 格式
  - `src/lib/payments/__tests__/aggregation.test.ts`（新增測試）
- [S] T-5: confirmed-payments/page.tsx 查詢 JOIN payment_requests（依賴 T-1）
  - `src/app/dashboard/confirmed-payments/page.tsx`
  - 查詢 confirmation_items 時帶出 payment_requests.payment_date
  - 傳遞給 aggregation 函數

### Phase 4: 確認清單初始化 + 同步
- [S] T-6: PaymentOverviewTab 初始化讀取 payment_date 預設值（依賴 T-4, T-5）
  - `src/components/payments/confirmed/tabs/PaymentOverviewTab.tsx`
  - 初始化時：remittance_settings.paymentDate 優先 → 否則讀 payment_requests.payment_date
  - 日期修改後的同步邏輯不變（現有 RPC）

### Phase 5: 測試 + 驗證
- [S] T-7: 整合測試 + 驗收標準驗證（依賴 T-3~T-6）
  - 驗證 AC-1 ~ AC-8
  - 驗證舊資料向後相容
  - 驗證代扣門檻按日計算不被破壞
  - `src/lib/payments/__tests__/aggregation.test.ts`（補充測試）

## 標記說明
- `[P]` = Parallel — 可平行執行
- `[S]` = Sequential — 必須等依賴完成
- `( )` = 未開始  `(->)` = 進行中  `(v)` = 已完成  `(x)` = 已取消
