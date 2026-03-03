# Tasks: 合併請款工作台（統一請款入口）
spec-id: 001-merged-payment-workbench
版本：v1.1
預估任務數：16 (v1.0) + 8 (v1.1) = 24
可平行任務：6 (v1.0) + 4 (v1.1)

## v1.0 任務（全部已完成）

### Phase 1: DB 層 — RPC 與 Migration
- [P] (✓) T-1: 建立 migration — `get_workbench_items()` RPC
- [P] (✓) T-2: 建立 migration — 合併操作 RPC
- [P] (✓) T-3: 建立 migration — 送出/撤回/審核 RPC

### Phase 2: 前端基礎 — Types、Hooks
- [S] (✓) T-4: 更新型別定義
- [P] (✓) T-5: 建立 useWorkbenchItems hook
- [P] (✓) T-6: 建立 useWorkbenchMerge hook
- [P] (✓) T-7: 建立 useWorkbenchSubmission hook
- [P] (✓) T-8: 建立 useWorkbenchReview hook

### Phase 3: 工作台 UI — 核心頁面
- [S] (✓) T-9: 建立工作台頁面骨架
- [S] (✓) T-10: 建立「待處理」Tab 元件
- [S] (✓) T-11: 建立「審核中」Tab 元件
- [S] (✓) T-12: 建立「被駁回」Tab 元件

### Phase 4: 整合 — 既有介面修改
- [P] (✓) T-13: 修改報價單 DataGrid
- [P] (✓) T-14: 修改個人請款頁面
- [P] (✓) T-15: 修改側邊欄導覽
- [P] (✓) T-16: 修改已確認請款頁面

---

## v1.1 任務（新增）

### Phase 5: DB — RPC 修改
> 放寬驗證 + 新增月份參數

- [P] ( ) T-17: 修改 `create_quotation_merge_group` — 新增 `p_payment_month TEXT DEFAULT NULL` 參數
  — `supabase/migrations/新檔案`
  — 若 `p_payment_month` 不為空，`UPDATE expected_payment_month` 給所有成員
  — AC-28, AC-29

- [P] ( ) T-18: 修改 `submit_merge_group` + `submit_single_item` — 放寬成本驗證
  — `supabase/migrations/新檔案`（可與 T-17 同檔）
  — 原本 `cost_amount IS NULL OR cost_amount <= 0` → 改為 `cost_amount IS NULL`
  — 允許 `cost_amount = 0` 送出
  — AC-27

### Phase 6: 前端 — 分組重構 + 合併 dialog
> 帳戶類型分組 + 月份選擇步驟

- [S] ( ) T-19: 重構分組邏輯 — `useWorkbenchItems.ts` 的 `groupByRemittee()`（依賴 T-17）
  — `src/hooks/payment-workbench/useWorkbenchItems.ts`
  — parse `kol_bank_info` → `bankType` + 對應戶名
  — 分三區：勞報（individual + personalAccountName）、公司行號（company + companyAccountName）、未填寫
  — 回傳結構調整：`RemitteeGroup` 新增 `category: 'individual' | 'company' | 'unknown'`
  — AC-24, AC-25, AC-26

- [S] ( ) T-20: 更新三個 Section 元件的分組渲染（依賴 T-19）
  — `src/components/payment-workbench/PendingSection.tsx`
  — `src/components/payment-workbench/ReviewSection.tsx`
  — `src/components/payment-workbench/RejectedSection.tsx`
  — 每個 Section 按三區塊渲染（勞報標頭/公司行號標頭/未填寫提示）
  — AC-24, AC-25, AC-26

- [S] ( ) T-21: 合併 dialog 增加月份步驟 + hook 修改（依賴 T-17）
  — `src/components/payment-workbench/PendingSection.tsx`（合併確認 Modal 部分）
  — `src/hooks/payment-workbench/useWorkbenchMerge.ts`（`createMergeGroup` 新增 `paymentMonth` 參數）
  — dialog 流程：選主項 → 選月份（預設帶入組內一致月份）→ 確認
  — RPC 呼叫加上 `p_payment_month` 參數
  — AC-28, AC-29

### Phase 7: 前端 — 行內上傳
> 工作台的發票/附件編輯能力

- [S] ( ) T-22: PendingSection 行內上傳（依賴 T-20）
  — `src/components/payment-workbench/PendingSection.tsx`
  — 單筆項目行：展開區域含「發票號碼」input + `AttachmentUploader` 元件
  — 儲存：直接 update `quotation_items` 的 `invoice_number` / `attachments`
  — 送出按鈕 disabled 條件放寬（`cost_amount !== null` 而非 `> 0`）
  — AC-20, AC-21, AC-27

- [S] ( ) T-23: MergeGroupCard 主項上傳（依賴 T-22）
  — `src/components/payment-workbench/MergeGroupCard.tsx`
  — 展開詳情時，主項行顯示發票 input + AttachmentUploader
  — 非主項行顯示「送出時自動繼承主項發票/附件」提示文字
  — AC-22

- [S] ( ) T-24: RejectedSection 行內上傳（依賴 T-22）
  — `src/components/payment-workbench/RejectedSection.tsx`
  — 被駁回項目同樣支援發票 + 附件編輯（修正後重送）
  — AC-23

### Phase 8: 進項管理 — 合併標示修復
> 讓新流程核准的合併組在進項管理中可辨識

- [P] ( ) T-25: 進項管理查詢 + 渲染修復（可與 Phase 5-7 平行）
  — `src/app/dashboard/accounting/expenses/page.tsx`
  — 查詢：`.select('*, payment_requests(merge_group_id, merge_color), quotation_items!accounting_expenses_quotation_item_id_fkey(merge_group_id, merge_color, is_merge_leader)')`
  — 型別：`ExpenseWithMerge` 新增 `quotation_items` 欄位
  — 合併標示：雙路徑 fallback `qi?.merge_group_id || pr?.merge_group_id`
  — 主項標記：`is_merge_leader === true` → 顯示 `★主項` badge
  — 預設排序：新路徑的 `merge_group_id` 也納入分組排序
  — `mergeGroupLabelMap` 建立也加入新路徑
  — AC-30, AC-31, AC-32

## 標記說明
- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消

## v1.1 Phase 依賴圖

```
Phase 5 (DB)         Phase 6 (分組+合併)      Phase 7 (上傳)        Phase 8 (進項)
────────────         ──────────────────       ──────────────        ──────────────
T-17 ─────────┬──→ T-19 ──→ T-20 ──→ T-22 ──→ T-23
T-18 ─────────┘         │                └──→ T-24              T-25（可獨立平行）
                        └──→ T-21
```
