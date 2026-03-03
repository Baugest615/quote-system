# Tasks: 合併請款工作台（統一請款入口）
spec-id: 001-merged-payment-workbench
預估任務數：16
可平行任務：6

## 任務清單

### Phase 1: DB 層 — RPC 與 Migration
> 建立所有工作台需要的後端邏輯

- [P] (✓) T-1: 建立 migration — `get_workbench_items()` RPC
  — `supabase/migrations/新檔案`
  — 查詢所有已簽約報價單的 quotation_items（pending / requested / rejected）
  — JOIN quotations、kols 取得專案名、KOL 名、bank_info
  — 確保 RLS 安全（Admin/Editor 全部，Member 限自己相關）

- [P] (✓) T-2: 建立 migration — 合併操作 RPC
  — `supabase/migrations/新檔案`
  — `create_quotation_merge_group(p_item_ids, p_leader_id)`: 驗證 + 建組
  — `dissolve_quotation_merge_group(p_group_id)`: 驗證 + 拆組
  — 包含驗證邏輯：同帳戶、同狀態、未加入其他組

- [P] (✓) T-3: 建立 migration — 送出/撤回/審核 RPC
  — `supabase/migrations/新檔案`
  — `submit_merge_group()` / `submit_single_item()`: 團進送出
  — `withdraw_merge_group()` / `withdraw_single_item()`: 撤回
  — `approve_merge_group()`: 逐筆呼叫 approve_quotation_item 邏輯，transaction 包裹
  — `reject_merge_group()`: 團出駁回

### Phase 2: 前端基礎 — Types、Hooks
> 建立工作台的資料層

- [S] (✓) T-4: 更新型別定義（依賴 T-1）
  — `src/types/custom.types.ts`: 新增 payment_workbench 頁面權限
  — `src/lib/payments/types.ts`: 新增 WorkbenchItem、MergeGroup 型別

- [P] (✓) T-5: 建立 useWorkbenchItems hook（依賴 T-4）
  — `src/hooks/payment-workbench/useWorkbenchItems.ts`
  — React Query 包裝 get_workbench_items() RPC
  — 資料分組邏輯：按匯款對象、按狀態

- [P] (✓) T-6: 建立 useWorkbenchMerge hook（依賴 T-4）
  — `src/hooks/payment-workbench/useWorkbenchMerge.ts`
  — 勾選狀態管理、合併驗證（canMergeWith）、跨月偵測
  — mutation: create/dissolve merge group
  — 快取失效：invalidate workbenchItems

- [P] (✓) T-7: 建立 useWorkbenchSubmission hook（依賴 T-4）
  — `src/hooks/payment-workbench/useWorkbenchSubmission.ts`
  — mutation: submit/withdraw merge group & single item
  — 快取失效：invalidate workbenchItems

- [P] (✓) T-8: 建立 useWorkbenchReview hook（依賴 T-4）
  — `src/hooks/payment-workbench/useWorkbenchReview.ts`
  — mutation: approve/reject merge group
  — 快取失效：invalidate workbenchItems, paymentConfirmations, accountingExpenses

### Phase 3: 工作台 UI — 核心頁面
> 建立工作台頁面與主要元件

- [S] (✓) T-9: 建立工作台頁面骨架（依賴 T-5）
  — `src/app/dashboard/payment-workbench/page.tsx`
  — `src/components/payment-workbench/WorkbenchPage.tsx`
  — `src/components/payment-workbench/WorkbenchFilters.tsx`
  — Tab 結構：待處理 / 審核中 / 被駁回
  — 篩選列：匯款對象、專案、月份

- [S] (✓) T-10: 建立「待處理」Tab 元件（依賴 T-6, T-7, T-9）
  — `src/components/payment-workbench/PendingSection.tsx`
  — `src/components/payment-workbench/RemitteeGroup.tsx`
  — `src/components/payment-workbench/PaymentItemRow.tsx`
  — `src/components/payment-workbench/MergeGroupCard.tsx`
  — `src/components/payment-workbench/ExpenseClaimSection.tsx`
  — 勾選、合併、送出操作 UI
  — 合併確認 Dialog + 跨月警告 Dialog

- [S] (✓) T-11: 建立「審核中」Tab 元件（依賴 T-8, T-9）
  — `src/components/payment-workbench/ReviewSection.tsx`
  — 可展開卡片：合併組、單筆、個人請款
  — 核准/駁回按鈕（Admin/Editor 才可見）
  — 撤回按鈕（送出者 / Admin 可見）
  — 駁回 Dialog

- [S] (✓) T-12: 建立「被駁回」Tab 元件（依賴 T-9）
  — `src/components/payment-workbench/RejectedSection.tsx`
  — 顯示駁回原因
  — 可重新編輯（金額、發票、附件）
  — 可拆分合併組
  — 可重新送出

### Phase 4: 整合 — 既有介面修改
> 修改現有頁面，整合工作台

- [P] (✓) T-13: 修改報價單 DataGrid（依賴 T-9）
  — `src/components/quotes/v2/QuotationItemsList.tsx`
  — 移除：handleRequestPayment(), handleApprovePayment(), handleRejectPayment() 及對應按鈕
  — 新增：MergeBadge 元件（色點 + 圖示 + hover tooltip + 點擊跳轉）
  — 保留：成本欄位編輯功能

- [P] (✓) T-14: 修改個人請款頁面（依賴 T-9）
  — `src/app/dashboard/expense-claims/page.tsx`
  — 移除：送出審核、核准/駁回按鈕
  — 新增：提示訊息「請至請款工作台送出審核」
  — 保留：建立/編輯/刪除草稿

- [P] (✓) T-15: 修改側邊欄導覽
  — `src/components/dashboard/Sidebar.tsx`
  — 新增「請款工作台」導覽項
  — 使用 Wallet icon
  — 權限：Admin / Editor / Member 皆可見

- [P] (✓) T-16: 修改已確認請款頁面（依賴 T-9）
  — `src/components/payments/confirmed/RemittanceGroupCard.tsx`
  — 合併群組標籤映射已支援新流程（quotation_items 路徑）
  — 既有色帶 + badge 指標已涵蓋新舊流程

## 標記說明
- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消

## Phase 依賴圖

```
Phase 1 (DB)        Phase 2 (Hooks)       Phase 3 (UI)          Phase 4 (Integration)
─────────────       ──────────────        ──────────────        ──────────────────────
T-1 ─────────┐
T-2 ─────────┼──→ T-4 ──→ T-5 ──┐
T-3 ─────────┘         ├─→ T-6 ──┼──→ T-9 ──→ T-10 ──→ T-11 ──→ T-12
                       ├─→ T-7 ──┘         │
                       └─→ T-8 ────────────┘    T-13 ─┐
                                                 T-14 ─┼──（可平行）
                                                 T-15 ─┤
                                                 T-16 ─┘
```
