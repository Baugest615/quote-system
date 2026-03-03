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

- [P] (✓) T-17: 修改 `create_quotation_merge_group` — 新增 `p_payment_month TEXT DEFAULT NULL` 參數
  — `supabase/migrations/20260303100000_workbench_v1_1_rpc_updates.sql`
  — AC-28, AC-29

- [P] (✓) T-18: 修改 `submit_merge_group` + `submit_single_item` — 放寬成本驗證
  — `supabase/migrations/20260303100000_workbench_v1_1_rpc_updates.sql`
  — AC-27

### Phase 6: 前端 — 分組重構 + 合併 dialog
> 帳戶類型分組 + 月份選擇步驟

- [S] (✓) T-19: 重構分組邏輯 — `grouping.ts` 的 `groupByRemittee()`
  — `src/hooks/payment-workbench/grouping.ts`（deriveAccountInfo + 三類分組）
  — AC-24, AC-25, AC-26

- [S] (✓) T-20: 更新三個 Section 元件的分組渲染
  — PendingSection / ReviewSection / RejectedSection 按帳戶類型三區塊渲染
  — AC-24, AC-25, AC-26

- [S] (✓) T-21: 合併 dialog 增加月份步驟 + hook 修改
  — PendingSection merge dialog 兩步驟（選主項 → 選月份）
  — AC-28, AC-29

### Phase 7: 前端 — 行內上傳
> 工作台的發票/附件編輯能力

- [S] (✓) T-22: PendingSection 行內上傳
  — `src/components/payment-workbench/InlineItemEditor.tsx`（共用元件）
  — AC-20, AC-21, AC-27

- [S] (✓) T-23: MergeGroupCard 主項上傳
  — MergeGroupCard 展開時主項顯示 InlineItemEditor
  — AC-22

- [S] (✓) T-24: RejectedSection 行內上傳
  — RejectedSection 展開列含 InlineItemEditor
  — AC-23

### Phase 8: 進項管理 — 合併標示修復
> 讓新流程核准的合併組在進項管理中可辨識

- [P] (✓) T-25: 進項管理查詢 + 渲染修復
  — `src/app/dashboard/accounting/expenses/page.tsx`（雙路徑 fallback + merge_color 視覺指示）
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
