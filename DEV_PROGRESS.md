# 開發進度追蹤

> 最後更新：2026-02-26
> 分支：`feature/phase1-security-hardening`

## 已完成

### 待請款專案管理 — UI 重構 + 智慧預設（2026-02-22）

將 177 筆項目 / 49 個專案的待請款頁面從每列 ~100px 降至 ~40px，大幅減少垂直捲動量。

#### UI 重構：批量預設 + 精簡列

**新增元件（5 個）**：
- [x] `BatchSettingsBar.tsx` — 可收合批次設定面板（支出種類/會計科目/月份）+ 一鍵套用
- [x] `CompactItemRow.tsx` — 精簡列（取代 ItemRow），內嵌匯款/成本/發票編輯
- [x] `ExpandedItemPanel.tsx` — 點擊展開的 inline 編輯面板（3 下拉選單 + 駁回原因）
- [x] `StatusDot.tsx` — 狀態圓點指示器（🔴駁回/🟡不完整/🟢就緒/⬜未開始）
- [x] `useBatchSettings.ts` — 批次設定狀態管理 hook

**表格重構**：
- [x] 表頭 7 欄→5 欄（合併模式 6 欄），移除每列 3 個 dropdown
- [x] 非預設值以小 badge 提示，點擊展開可修改
- [x] 合併欄僅在合併模式時顯示
- [x] 刪除舊 `ItemRow.tsx`

#### 智慧支出分類預設

根據 KOL 資訊自動推算支出種類與會計科目，減少手動操作：

| 條件 | 支出種類 | 會計科目 |
|------|----------|----------|
| 無 KOL（非 KOL 項目） | 專案費用 | 廣告費用 |
| KOL 公司帳戶 | 外包服務 | 外包費用 |
| KOL 個人帳戶或未設定 | 勞務報酬 | 勞務成本 |

- [x] `getDefaultExpenseByBankType()` helper（`custom.types.ts`）
- [x] `page.tsx` 三處項目初始化（available / rejected / draft）套用智慧預設
- [x] `usePendingItems.ts` 兩處初始化同步更新
- [x] `isSettingsModified` 判斷改為對比智慧預設（非硬編碼值）

驗證結果：TypeScript 零錯誤、Production build 成功（31 頁面）

---

### 架構優化 — 6 階段重構（2026-02-22）

專案已成長至 167+ TS/TSX 檔案、31 頁面、25+ hooks，進行全面架構優化以提升可維護性、效能與穩定性。

#### Phase 1：基礎設施層

**1.1 集中式環境變數管理**（`src/lib/env.ts`）：
- [x] 將散佈 5+ 檔案的 `process.env` 集中為 `clientEnv` / `serverEnv` / `isDev` / `isProd`
- [x] 修改 `client.ts`、`server.ts`、`admin.ts`、`route.ts`、`ErrorBoundary.tsx`、`middleware.ts`

**1.2 React Query 快取差異化**（`src/lib/queryClient.ts`）：
- [x] 新增 `staleTimes` 四級策略：static(1hr)、dictionary(30min)、standard(5min)、realtime(1min)
- [x] 套用至 `useReferenceData`、`usePaymentData`、`usePendingItems`、`useWithholdingSettings`

**1.3 路由保護強化**（`middleware.ts`）：
- [x] `/print/*` 路由增加角色檢查（至少 Member），防止已停用帳號存取

#### Phase 2：通用 CRUD Hook Factory

**建立** `src/hooks/useEntityMutations.ts`：
- [x] `useCreateEntity<TInsert>` / `useUpdateEntity<TUpdate>` / `useDeleteEntity` factory
- [x] 統一 supabase CRUD + invalidateQueries + toast 邏輯
- [x] `useClients.ts` — 全部 CRUD 替換為 factory
- [x] `useKols.ts` — 僅 `useDeleteKol` 替換（Create/Update 有關聯表邏輯）
- [x] `useProjects.ts` — 僅 `useDeleteProject` 替換

#### Phase 3：Client-side 分頁

- [x] 共用 `Pagination` 元件從 `accounting/` 提升至 `ui/`（`src/components/ui/Pagination.tsx`）
- [x] `accounting/Pagination.tsx` 改為 re-export
- [x] `clients/page.tsx` 新增分頁（PAGE_SIZE=20）
- [x] `kols/page.tsx` 新增分頁（PAGE_SIZE=20）
- [x] `useCRUDTable.ts` 新增 `serverSidePagination` 選項（未來可用）

#### Phase 4：大型元件拆分

**4.1 QuoteForm.tsx 拆分**（1048→123 行）：
- [x] `src/hooks/quotes/useQuoteFormData.ts`（283 行）— 資料載入 + 狀態管理
- [x] `src/hooks/quotes/useQuoteFormSubmit.ts`（263 行）— 提交邏輯 + 自動建實體
- [x] `src/components/quotes/form/types.ts`（165 行）— 共享型別 + schema + 常數
- [x] `src/components/quotes/form/QuoteFormBasicInfo.tsx` — 基本資訊區塊
- [x] `src/components/quotes/form/QuoteFormItemsTable.tsx` — 報價項目表格
- [x] `src/components/quotes/form/QuoteFormSummary.tsx` — 金額計算 + 優惠
- [x] `src/components/quotes/form/QuoteFormTerms.tsx` — 合約條款 + 備註

**4.2 SpreadsheetEditor.tsx 拆分**（656→287 行）：
- [x] `src/hooks/accounting/useSpreadsheetOperations.ts` — 全部狀態管理、行操作、貼上、鍵盤導航

**4.3 useMonthlySettlement.ts 拆分**：
- [x] `src/lib/settlement/groupEmployeeData.ts` — 員工分組純函式
- [x] `src/lib/settlement/calculateKpi.ts` — KPI 計算純函式
- [x] `useMonthlySettlement.ts` 引用純函式 + markPaid/markUnpaid 合併為 `togglePaidMutation`

#### Phase 5：錯誤邊界細粒度化

- [x] `src/components/ModuleErrorBoundary.tsx` — 輕量封裝，模組名稱顯示 + 重試按鈕
- [x] 包裹 accounting、payment-requests、confirmed-payments、quotes 頁面

#### Phase 6：測試基礎建設

- [x] `jest.config.js` + `jest.setup.ts` — jsdom + ts-jest + mock supabase/sonner
- [x] `src/lib/payments/__tests__/validation.test.ts` — 發票/成本/附件驗證規則
- [x] `src/lib/settlement/__tests__/groupEmployeeData.test.ts` — 員工分組邏輯
- [x] `src/lib/settlement/__tests__/calculateKpi.test.ts` — KPI 計算
- [x] **85 個測試全部通過**

驗證結果：TypeScript 零錯誤、Production build 成功（31 頁面）、85/85 測試通過

---

### 匯費分配修復（2026-02-22）

修復進項管理中匯費重複計算的問題（勞務報酬 + 獨立匯費記錄 = 雙重計算）。

**Migration**（`20260222970000_fix_remittance_fee_distribution.sql`）：
- [x] `accounting_expenses` 新增 `remittance_fee` 欄位
- [x] 改寫 `update_remittance_settings` RPC：匯費分配到對應匯款群組的第一筆勞務記錄
- [x] `total_amount = amount + tax_amount - remittance_fee`（反映實付金額）
- [x] 不再建立獨立的「銀行匯款手續費」記錄（消除重複計算）
- [x] 群組匹配邏輯與前端 `groupItemsByRemittance()` 完全一致
- [x] 回填既有資料 + 清理舊匯費記錄 + 移除不需要的 UNIQUE index

**前端變更**：
- [x] `AccountingExpense` 型別新增 `remittance_fee`
- [x] 進項管理表頭「總額（含稅）」改為「實付金額」
- [x] 有匯費扣除時顯示小字提示「匯費 -30」

驗證結果：TypeScript 零錯誤、Production build 成功（31 頁面）

---

### v2.5 — 帳務進階：代扣代繳系統 + 月結總覽 + 已確認請款重構（2026-02-22）

全面建構代扣代繳應付追蹤系統，新增月結總覽頁面，並將已確認請款頁面重構為三分頁架構。

#### Phase 1：費用分類重構 + 請款審核強化

**Migration**（`20260222000001_refactor_expense_classification.sql`）：
- [x] `expense_type` CHECK 擴展：新增「員工代墊」「營運費用」「代扣代繳」
- [x] `accounting_expenses` 新增 `payment_target_type`、`payment_status`、`paid_at`、`submitted_by` 欄位
- [x] `expense_claims` 新增 `payment_target_type`、`payment_status` 欄位
- [x] `approve_expense_claim` RPC 更新：支援付款對象推斷

**Migration**（`20260222200000_fix_approve_payment_request_role_query.sql`）：
- [x] 修復 `approve_payment_request` RPC 角色查詢邏輯

**前端變更**：
- [x] `ExpenseClaimModal` 支援「員工代墊」「營運費用」等新類型 + 付款對象欄位
- [x] `KolModal` 新增免扣狀態（withholding_exempt）管理
- [x] 進項管理頁面支援 `payment_target_type` 篩選
- [x] 待請款頁面新增預計付款月份欄位

#### Phase 2：代扣代繳應付追蹤 + 沖銷機制

**Migration**（`20260222400000_add_withholding_settings.sql`）：
- [x] 新建 `withholding_settings` 表（所得稅率、健保費率、免稅門檻、匯費預設值）
- [x] 全域設定管理（非 per-confirmation）

**Migration**（`20260222500000_add_withholding_settlements.sql`）：
- [x] 新建 `withholding_settlements` 表（繳納紀錄：公司直繳/員工代墊）
- [x] `approve_expense_claim` RPC 代扣代繳路徑：不建 `accounting_expense`，改建 `withholding_settlement`
- [x] RLS 政策完整（SELECT 全員、INSERT/UPDATE Admin+Editor、DELETE Admin）

**Migration**（`20260222600000_repair_missing_withholding_settlements.sql`）：
- [x] 回填舊版 RPC 核准的代扣代繳報帳（補建 settlement、清理錯誤的 expense）

**Migration**（`20260222700000_add_withholding_month_column.sql`）：
- [x] `expense_claims` 新增 `withholding_month` 欄位（代扣所屬月份 ≠ 報帳月份）
- [x] RPC 優先使用 `withholding_month`，fallback `claim_month`

**Hooks**：
- [x] `useWithholdingSettings` — 全域費率設定 CRUD
- [x] `useWithholdingSettlements` — 按月查詢繳納紀錄 + 新增繳納

#### Phase 3：月結總覽頁面

**Migration**（`20260222100000_add_monthly_settlement.sql`）：
- [x] `get_monthly_settlement_summary` RPC：跨表匯總月份收支

**新增頁面**（`/dashboard/accounting/monthly-settlement`）：
- [x] 月份選擇器 + 收入/支出/損益 KPI 卡片
- [x] 收入明細（銷項發票列表）
- [x] 支出明細（進項支出列表）
- [x] 勞務報酬追蹤（按 KOL 歸戶、小計彙總）
- [x] 代扣代繳月報（應扣/已繳/差額 + 繳納紀錄 + 新增繳納功能）

#### Phase 4：已確認請款頁面三分頁重構

將原本混合統計/代扣報表/清單明細的頁面重構為三個 Tab，大幅提升使用體驗。

**新增工具函數**（`src/lib/payments/aggregation.ts`）：
- [x] `aggregateMonthlyRemittanceGroups()` — 跨清單按月彙總匯款群組
- [x] `splitRemittanceGroups()` — 分為個人/公司群組
- [x] `checkWithholdingApplicability()` — 代扣條件判斷（個人報帳/公司戶/免扣/未達門檻）
- [x] `getAvailableMonths()` — 從確認清單提取可用月份
- [x] `exportBankTransferCsv()` — 匯款明細 CSV 匯出

**新增工具函數**（`src/lib/payments/withholding-export.ts`）：
- [x] `computeMonthlyWithholding()` — 月代扣彙總（排除個人報帳）
- [x] `generateNhiDetailCsv()` / `generateTaxWithholdingCsv()` / `generateFullWithholdingCsv()` — 三種 CSV 匯出

**Tab 1：匯款總覽**（`PaymentOverviewTab.tsx`）：
- [x] 月份選擇器 + 彙總卡片（匯款總額/代扣所得稅/代扣健保/匯費合計/實付總額）
- [x] 個人匯款/公司匯款分區顯示
- [x] `RemittanceGroupCard` 元件（展開：銀行資訊+項目明細+扣除明細+實付金額）
- [x] CSV 匯出整月銀行匯款明細

**Tab 2：代扣代繳**（`WithholdingTab.tsx`）：
- [x] 薄包裝層，`WithholdingReport` 以 `alwaysExpanded` 模式顯示

**Tab 3：確認紀錄**（`ConfirmationHistoryTab.tsx`）：
- [x] 搜尋/日期篩選/排序控制
- [x] `ConfirmationRow` 清單 + 展開 → `ConfirmationDetails`
- [x] 代扣設定條件化：只有勞務報酬+超門檻的群組才顯示代扣勾選框
- [x] 不適用代扣的群組顯示原因說明（個人報帳/公司戶/免扣/未達門檻）+ 僅保留匯費設定
- [x] 退回功能完整保留

**頁面主體重構**（`confirmed-payments/page.tsx`）：
- [x] Tab 切換（匯款總覽/代扣代繳/確認紀錄）
- [x] 個人報帳項目顯示申請人姓名（透過 employees 表查詢，避開 profiles RLS）
- [x] `PaymentStats` 統計面板保留在 Tab 上方

#### Phase 5：Bug 修復

**修復 1：代扣代繳繳納紀錄重複**

**Migration**（`20260222950000_fix_duplicate_withholding_settlements.sql`）：
- [x] 清理現有重複記錄（保留最早一筆）
- [x] UNIQUE partial index `idx_withholding_settlements_unique_claim` 防止未來重複
- [x] `approve_expense_claim` RPC 加入 `NOT EXISTS` 檢查再 INSERT
- [x] `handleRevert` 退回時同步刪除 `withholding_settlements`（避免再次核准產生重複）

**修復 2：匯費未同步到進項管理**

**Migration**（`20260222960000_sync_remittance_fee_to_accounting.sql`）：
- [x] `accounting_expenses` 新增 `payment_confirmation_id` 欄位
- [x] UNIQUE partial index 確保每個確認清單只有一筆匯費記錄
- [x] `update_remittance_settings` RPC 自動同步匯費到 `accounting_expenses`（expense_type=營運費用, accounting_subject=銀行手續費）
- [x] 匯費為 0 時自動刪除記錄；匯費 > 0 時 upsert
- [x] 回填既有確認清單的匯費記錄
- [x] `handleRevert` 退回時先刪匯費記錄（在刪 confirmation 之前，避免 FK 衝突）

#### 其他 Migration

- [x] `20260222300000_add_expected_payment_month.sql` — 待請款項目新增「預計付款月份」
- [x] `20260222800000_expense_claims_payment_status.sql` — 個人報帳新增付款狀態追蹤
- [x] `20260222900000_add_expense_claims_profiles_fk.sql` — expense_claims.submitted_by FK 到 profiles

#### 新增檔案清單

```
src/app/dashboard/accounting/monthly-settlement/page.tsx
src/components/accounting/monthly-settlement/
  ├── IncomeSection.tsx
  ├── ExpenseSection.tsx
  ├── LaborPaymentSection.tsx
  └── WithholdingSection.tsx
src/components/payments/confirmed/RemittanceGroupCard.tsx
src/components/payments/confirmed/WithholdingReport.tsx
src/components/payments/confirmed/tabs/
  ├── PaymentOverviewTab.tsx
  ├── WithholdingTab.tsx
  └── ConfirmationHistoryTab.tsx
src/hooks/useMonthlySettlement.ts
src/hooks/useWithholdingSettings.ts
src/hooks/useWithholdingSettlements.ts
src/lib/payments/aggregation.ts
src/lib/payments/withholding-export.ts
supabase/migrations/20260222*.sql (12 migrations)
```

#### 修改檔案清單

```
src/app/dashboard/confirmed-payments/page.tsx（三分頁重構 + 申請人姓名注入）
src/app/dashboard/accounting/expenses/page.tsx（payment_target_type 篩選）
src/app/dashboard/accounting/page.tsx（月結連結）
src/app/dashboard/accounting/reports/page.tsx（報表更新）
src/app/dashboard/expense-claims/page.tsx（付款狀態）
src/app/dashboard/pending-payments/page.tsx（預計付款月份）
src/components/dashboard/Sidebar.tsx（月結選單項）
src/components/expense-claims/ExpenseClaimModal.tsx（新支出類型 + 付款對象）
src/components/kols/KolModal.tsx（免扣狀態）
src/components/payments/confirmed/ConfirmationDetails.tsx（代扣條件化）
src/components/payments/confirmed/ConfirmationRow.tsx（更新 props）
src/components/payments/confirmed/ExportControls.tsx（匯出功能更新）
src/components/payments/confirmed/PaymentRecordRow.tsx（顯示申請人姓名）
src/components/pending-payments/ItemRow.tsx（預計付款月份）
src/components/pending-payments/ProjectGroupView.tsx（UI 微調）
src/hooks/pending-payments/usePendingItems.ts（查詢欄位擴展）
src/lib/payments/grouping.ts（個人報帳分組用申請人姓名）
src/lib/payments/types.ts（新增 submitter、MergedRemittanceGroup 等型別）
src/lib/queryKeys.ts（新增 withholdingSettings、withholdingSettlements）
src/types/custom.types.ts（AccountingExpense + WithholdingSettings + WithholdingSettlement）
src/types/database.types.ts（Supabase 自動生成型別同步）
```

驗證結果：TypeScript 零錯誤、Production build 成功（29 頁面）、12 個 Migration 全部推送至遠端 DB

---

### 使用者管理優化 — 角色管理 + 員工綁定（2026-02-21）

將「權限管理」頁面升級為「使用者管理」中心，建立可靠的帳號與員工 1:1 綁定機制。

**資料庫 Migration**（`20260221200001_add_user_id_to_employees.sql`）：
- [x] `employees` 新增 `user_id` 欄位（UNIQUE、ON DELETE SET NULL）
- [x] 自動透過 email 比對填入現有綁定
- [x] 部分索引 `idx_employees_user_id`
- [x] RLS 政策：使用者可讀取自己綁定的員工記錄（含留停/離職）

**使用者管理頁面重寫**（`settings/permissions/page.tsx`）：
- [x] KPI 統計卡片：總帳號數、管理員、編輯者、已綁定員工
- [x] 搜尋 + 角色篩選 + 綁定狀態篩選
- [x] 使用者列表：帳號、角色 Badge、綁定員工、建立時間、操作
- [x] 「本人」標籤顯示
- [x] Admin/非 Admin 刪除保護

**UserEditModal 元件**（`components/settings/UserEditModal.tsx`）：
- [x] 角色選擇（管理員/編輯者/成員）— 視覺化按鈕
- [x] 員工綁定：SearchableSelect 搜尋未綁定員工 + 確認綁定
- [x] 員工解綁：顯示綁定員工資訊 + 解除綁定按鈕
- [x] Cache invalidation：userManagement + unlinkedEmployees + employees

**useMyEmployeeData Hook 優化**：
- [x] 移除脆弱的 email 比對（`.or(email.eq, created_by.eq)`）
- [x] 改用 `user_id` 直接查詢（`.eq('user_id', userId).maybeSingle()`）
- [x] 移除 `.eq('status', '在職')` 限制（新 RLS 已允許讀取自己的記錄）

**員工管理頁面微調**：
- [x] 表格新增「綁定帳號」欄位（顯示 email 或「未綁定」）

驗證結果：TypeScript 零錯誤、Production build 成功（29 頁面）、E2E 20/20 全通過

### 個人請款功能 Code Review + 安全修復 + E2E 驗證（2026-02-21）

全面審查個人請款功能的程式碼品質、安全性與功能完整性。

**Code Review 發現與修復**

前端修復：
- [x] **React Hooks 規則違反**：`payment-requests/page.tsx` FileViewerModal 的 `useState` 在條件式 return 之後 → 移至條件式之前
- [x] **前端/RLS 權限不一致**：`expense-claims/page.tsx` 前端允許刪除 rejected 狀態但 RLS 只允許 draft → 新增 `canDelete` 邏輯分離
- [x] **any 型別消除**：`payment-requests/page.tsx` 和 `confirmed-payments/page.tsx` 的 `any` → 具體型別
- [x] **Query Key 硬編碼**：新增 `queryKeys.expenseClaimsPending`，替換所有硬編碼字串
- [x] **使用者空值檢查**：`expense-claims/page.tsx` mutations 加入 `if (!user) throw new Error('未登入')`

Migration 安全修復（`20260221100000_fix_expense_claims_security.sql`）：
- [x] **CRITICAL: search_path 劫持防護** — `approve_expense_claim` 和 `reject_expense_claim` RPC 加入 `SET search_path = ''`
- [x] **CRITICAL: approver_id 偽造防護** — 移除外部傳入的 approver_id/rejector_id，改用 `auth.uid()` 強制取得
- [x] **CRITICAL: 並發核准防護** — SELECT 加入 `FOR UPDATE` 鎖定
- [x] **唯一約束** — `payment_confirmation_items` 加入 `(payment_confirmation_id, expense_claim_id)` 唯一索引
- [x] **RLS 命名規範化** — 政策名稱加上 `_policy` 後綴

**E2E 測試（Playwright headless Chromium）— 全部通過**
- [x] 認證：Supabase REST API + cookie 注入
- [x] 儀表板：KPI 卡片、營收圖表、報價單狀態圖
- [x] 個人請款申請頁：KPI 統計、表格列表、新增報帳 Modal（表單欄位、稅額自動計算）
- [x] 請款審核：專案請款 Tab + 個人報帳 Tab（3 筆待審核、核准/駁回按鈕）
- [x] 已確認請款清單：統計面板、搜尋、排序功能
- [x] 回歸測試：客戶管理、KOL 管理、報價單、待請款、費用管理 — 全部 OK
- [x] Console 錯誤：0

驗證結果：TypeScript 零錯誤、Production build 成功（29 頁面）、E2E 全通過

### 個人請款申請功能 + UX 重構（2026-02-21）

新增「個人報帳」申請機制，整合進現有的審核與帳務流程。包含兩階段：功能建構 + UX 優化。

**Phase 1：功能建構**
- [x] **資料庫 Migration** (`supabase/migrations/20260220000002_create_expense_claims.sql`)
  - 新建 `expense_claims` 表（完整審核流程欄位）
  - 擴展 `accounting_expenses` 新增 `expense_claim_id` 外鍵
  - 擴展 `payment_confirmation_items` 新增 `expense_claim_id` + `source_type`
  - RLS 政策：全員可讀、INSERT 限自己、UPDATE 自己的 draft/rejected + Admin/Editor 審核、DELETE 自己的 draft + Admin
  - RPC `approve_expense_claim`：角色驗證 → 更新狀態 → 建立 payment_confirmation_items → 自動建立 accounting_expenses
  - RPC `reject_expense_claim`：角色驗證 → 更新狀態 + 記錄原因
- [x] **型別定義**：`ExpenseClaim` interface、`CLAIM_STATUS` 常量、`PAGE_KEYS.EXPENSE_CLAIMS`
- [x] **Query Keys + useProjectNames Hook**：從 projects + quotations 取得不重複專案名稱
- [x] **個人請款申請頁面**：KPI 卡片、狀態篩選、試算表/表格雙模式、送出審核
- [x] **請款審核頁面 Tab 擴展**：「專案請款」vs「個人報帳」Tab 切換 + 批量核准/駁回
- [x] **已確認請款清單擴展**：個人報帳以「個人」badge 標示，支援退回
- [x] **進項管理 + 銷項管理**：project_name 欄位加入搜尋功能
- [x] **側邊欄 + 權限配置更新**

**Phase 2：UX 重構 — 表單模式 + SearchableSelect 統一**
- [x] **ExpenseClaimModal 元件**（`src/components/expense-claims/ExpenseClaimModal.tsx`）
  - 改用 Modal 表單模式（react-hook-form + zod）取代試算表
  - 自動計算：有發票 → 5% 稅額；無發票 → 稅額 0
  - 專案名稱使用 SearchableSelect（與其他頁面一致）
- [x] **個人請款頁面重構**：移除 SpreadsheetEditor，改為「新增報帳」按鈕 + Modal + 表格（含編輯/刪除操作欄）
- [x] **進項管理 Modal**：datalist → SearchableSelect
- [x] **銷項管理 Modal**：datalist → SearchableSelect
- [x] **SpreadsheetEditor autocomplete 升級**：原生 datalist → SearchableSelectCell（Portal 渲染）

驗證結果：TypeScript 零錯誤、Production build 成功（28 頁面）、Migration 已套用至遠端 DB

### 權限安全防護補強（2026-02-20）

全面安全稽核後修復 5 個缺口，建立分層防禦架構。

- [x] **Middleware 資料驅動化**
- [x] **列印頁面身份驗證**
- [x] **請款頁面權限守衛**
- [x] **PDF API 權限檢查**

驗證結果：TypeScript 零錯誤、Production build 成功（28 頁面）

### 專案進度管理頁面（2026-02-20）

新增「專案進度管理」功能，追蹤專案從洽談到結案的完整生命週期。

驗證結果：TypeScript 零錯誤、Production build 成功（28 頁面）、Migration 已套用至遠端 DB

### React Query 全面遷移 + 跨頁快取失效 + DB 索引補強（2026-02-19）

全部 23 個 Dashboard 頁面從直接 Supabase 呼叫遷移至 React Query 快取管理。

驗證結果：TypeScript 零錯誤、Production build 成功（27 頁面全部通過）

### 全專案 UI/UX 全面優化 — 9 階段計畫（2026-02-19）

共修改 **45+ 個檔案**，涵蓋全部 19 個 dashboard 頁面。

驗證結果：TypeScript 檢查通過、Production build 成功

### 先前版本（v1.0 ~ v2.1）
- [x] V2.1 全面優化（安全加固、共用元件、React Query、型別安全、效能）
- [x] 儀表板改版 — Executive Overview 風格
- [x] RLS 政策全面整理與標準化
- [x] CLAUDE.md 文件完善
- [x] V2.0.1 UI 深色主題優化與行動裝置響應式改善
- [x] 會計模組新增
- [x] 報價單檢視頁面暗色主題優化 & PDF 生成修復

### 月結總覽 Bug 修復 + UI 優化（2026-02-26）

修復月結總覽頁面員工分組錯誤，並將 UI 從手風琴卡片改為摘要表格。

**Bug 修復：員工分組邏輯**（`src/lib/settlement/groupEmployeeData.ts`）：
- [x] 根因：薪資用 `employee_id`、報帳用 `submitted_by` → `user_id`，當缺少對應 ID 時同一員工被拆成多個群組
- [x] 新增 `employeeNameToEmployee` 映射作為第三層 fallback（名字唯一時啟用）
- [x] 薪資：`employee_id` miss → 用 `employee_name` 匹配員工
- [x] 報帳/代扣：`submitted_by` miss → 用 `vendor_name` 匹配員工
- [x] 安全機制：同名員工不啟用 name fallback（避免誤合併）
- [x] 新增 5 個測試案例，全部 20/20 通過

**UI 優化：摘要表格**（`src/app/dashboard/accounting/monthly-settlement/page.tsx`）：
- [x] EmployeeTab 從手風琴卡片改為表格式排版
- [x] 欄位：員工 | 薪資 | 報帳 | 代扣代繳 | 合計 | 狀態
- [x] 點擊行展開明細子行（checkbox + badge + 付款狀態）
- [x] 表尾顯示各欄合計（人數 + 分項小計）

驗證結果：TypeScript 零錯誤、Production build 成功、20/20 測試通過

---

### 多項 Bug 修復 — 快取同步、稅額計算、效能、審核狀態（2026-02-26）

一次性修復多個跨頁面的 Bug。

**1. 個人請款刪除後我的薪資頁未更新**（`expense-claims/page.tsx`）：
- [x] 三個 mutation（新增/刪除/送出）加入 `invalidateQueries({ queryKey: ['my-employee'] })`

**2. 進項管理儲存後 UI 未重置**（`useSpreadsheetOperations.ts`）：
- [x] 成功儲存後重置所有 row 為 clean 狀態、移除已刪除列
- [x] 新增 `useEffect` 同步 `initialRows` 變化（React Query refetch 後自動更新）

**3. 進項管理稅額自動計算錯誤**（`accounting/expenses/page.tsx`）：
- [x] 修正：有發票號碼才自動計算 5% 稅額，無發票則稅額為 0
- [x] `invoice_number` 欄位加入 `autoCalcTrigger`，填入/清除發票時即時重算
- [x] Modal 表單同步修正

**4. Modal 開啟時操作遲鈍**（4 個檔案）：
- [x] 移除 `backdrop-blur-sm` CSS 濾鏡（GPU 密集型重繪）
- [x] 影響：`modal.tsx`、`AccountingModal.tsx`、`ConfirmDialog.tsx`、`Sidebar.tsx`

**5. 請款審核後狀態未更新**（`payment-requests/page.tsx`）：
- [x] 單筆核准/駁回 + 批量核准/駁回 4 個操作加入 `invalidateQueries(['expense-claims'])`

**6. 空白確認清單無法刪除**（`confirmed-payments/page.tsx`）：
- [x] `handleRevert` 偵測無項目的確認清單時，提供直接刪除選項

驗證結果：TypeScript 零錯誤、Production build 成功

---

### 待請款專案管理 — 篩選功能 + 成案日期 + 排序增強 + Bug 修復（2026-02-26）

為待請款專案管理頁面增加多維度篩選、排序增強、DB 持久化，並修復多個潛在 Bug。

#### 篩選功能

- [x] **KOL 篩選**（item-level）：下拉選單選取特定 KOL，僅顯示該 KOL 的項目（非整個專案）
- [x] **專案篩選**：下拉選單選取特定專案
- [x] **成案月份篩選**：從 `quotations.created_at` 提取不重複月份，支援按月份篩選
- [x] **清除篩選按鈕**：有啟用篩選時顯示，一鍵重置
- [x] **搜尋精確度優化**：文字搜尋僅比對 KOL 名稱、服務內容、客戶名稱（移除專案名稱避免過度匹配）
- [x] **兩層篩選架構**：`filteredItems`（item-level，分組前）→ `displayGroups`（group-level，分組後）

#### 排序增強

- [x] **成案日期排序**：新增「成案日期（新→舊）」「成案日期（舊→新）」選項
- [x] `ProjectGroup` 型別新增 `quotationCreatedAt: string | null`
- [x] `groupItemsByProject()` 提取 `quotationCreatedAt`

#### 成案日期顯示

- [x] 專案標題列顯示成案日期（CalendarDays icon + `YYYY/MM/DD` 格式）

#### 批次設定 UX 改進

- [x] **批次套用不再依賴付款勾選**：`applyToSelected` → `applyToFiltered`，套用至所有可見項目
- [x] **按鈕文字動態顯示**：有篩選時「套用至篩選結果 N 筆」；無篩選時「套用至全部 N 筆」
- [x] **DB 持久化**：套用批次/個別修改帳務設定後自動儲存至 `payment_requests`（draft record）

#### ExpandedItemPanel 精簡

- [x] 從多行佈局壓縮為單行 inline flex（3 下拉 + 重置/銀行/合併按鈕）
- [x] 移除與 CompactItemRow 重複的成本/匯款名稱輸入框

#### CompactItemRow 標籤優化

- [x] 帳務標籤（支出種類/會計科目/月份）與 KOL 名稱並排同一行
- [x] 預計付款月份標籤永遠顯示：與批次相同時淡色、不同時藍色高亮

#### Bug 修復（主動偵測 + 修復）

- [x] **upsert 失效**：`payment_requests.quotation_item_id` 無 UNIQUE 約束（故意允許多筆記錄），改用 INSERT + payment_request_id 判斷
- [x] **快速連續操作重複 INSERT**：新增 `pendingInserts` ref 防護同一 item 並發 INSERT
- [x] **React 反模式**：將 `saveAccountingSettings` 移出 `setItems()` updater 函數（避免 Strict Mode 雙重執行副作用）
- [x] **批次套用效能**：sequential `for-await` → `Promise.all` 並行呼叫
- [x] **清理未使用的 import**：ExpandedItemPanel 移除 `useState`、`useRef`、`Button`、`Input`、`Save`

**修改檔案**：
```
src/app/dashboard/pending-payments/page.tsx（篩選/排序/DB持久化/bug修復）
src/components/pending-payments/BatchSettingsBar.tsx（applyToFiltered + 動態按鈕）
src/components/pending-payments/CompactItemRow.tsx（標籤並排 + 月份永遠顯示）
src/components/pending-payments/ExpandedItemPanel.tsx（單行佈局）
src/components/pending-payments/ProjectGroupView.tsx（成案日期 + 清理 props）
src/hooks/pending-payments/useBatchSettings.ts（applyToFiltered）
src/hooks/payments/usePaymentGrouping.ts（泛型約束更新）
src/lib/payments/types.ts（quotationCreatedAt）
src/lib/payments/grouping.ts（提取 quotationCreatedAt）
src/lib/pending-payments/grouping-utils.ts（同步更新）
```

驗證結果：TypeScript 零錯誤、Production build 成功

---

### 全專案權限修復 — RLS 政策 + 前端守衛（2026-02-26）

修復 Member/Editor 角色在執行操作時遇到的多個權限錯誤（編輯報價單、新增項目、送出請款等），涵蓋 DB RLS 政策與前端權限控制。

**Migration**（`20260226100000_fix_permission_gaps.sql`）：

DB 層面修復 5 大類問題：
- [x] **payment_requests 擴展**：新增 `created_by` 欄位 + trigger；INSERT 開放全員；UPDATE 改為 Admin/Editor + 擁有者
- [x] **歷史記錄 NULL 處理**：`quotations`、`quotation_items`、`kols`、`clients` 的 UPDATE/DELETE 政策加入 `OR created_by IS NULL`
- [x] **approve_expense_claim 安全修復**：補回 `SET search_path = ''`、`public.` 前綴、`FOR UPDATE` 鎖定、`v_actual_approver_id`
- [x] **accounting 三表改制**：`accounting_sales`/`expenses`/`payroll` 從 owner-only 改為 Admin 角色 CRUD
- [x] **is_admin() 修復**：從查不存在的 `user_roles` 表改為查 `profiles` 表

前端層面修復 4 處權限缺口：
- [x] **QuotesDataGrid inline 編輯**：3 個 EditableCell（專案名稱/客戶/狀態）加入 `canEditQuote` 判斷，無權限時渲染唯讀文字
- [x] **報價單 View 頁面**：編輯按鈕加入 `hasRole('Editor') || created_by === userId` 條件
- [x] **報價單 Edit 頁面**：新增 `usePermission` 路由守衛，無權限顯示「權限不足」提示
- [x] **QuotationItemsList**：新增 `readOnly` prop，隱藏新增/刪除/貼上操作

**修改檔案**：
```
supabase/migrations/20260226100000_fix_permission_gaps.sql（新增）
src/components/quotes/v2/QuotesDataGrid.tsx
src/components/quotes/v2/QuotationItemsList.tsx
src/app/dashboard/quotes/view/[id]/page.tsx
src/app/dashboard/quotes/edit/[id]/page.tsx
```

驗證結果：TypeScript 零錯誤

---

### 待請款檢核文件上傳 Bug 修復（2026-02-26）

修復檢核文件上傳後顯示成功但 F5 重整後消失的問題。

**根因**：`handleFileUpdate` 只更新前端狀態，未對無 `payment_request_id` 的新項目寫入 DB。

- [x] 新項目上傳時自動 INSERT draft `payment_request` 記錄（含 `attachment_file_path`）
- [x] `pendingInserts` ref 防護並發 INSERT
- [x] 清理 27 筆 Supabase Storage 孤立檔案（無 DB 參照）

修改檔案：`src/app/dashboard/pending-payments/page.tsx`

---

### 成本明細表格排序功能（2026-02-23）

報價單管理的成本明細（報價項目）表格新增 Excel 風格欄位排序功能，方便檢視與校對。

- [x] 點擊欄位標題可排序：升序 → 降序 → 取消（三段式切換）
- [x] 支援所有 7 個欄位：類別、KOL/服務、執行內容、數量、單價、成本、小計
- [x] 中文字串使用 `localeCompare('zh-Hant')` 正確排序
- [x] 懸停時顯示淡色排序圖示提示，啟用排序時以主色箭頭標示方向
- [x] 純前端視覺排序，不影響資料儲存順序

修改檔案：`src/components/quotes/v2/QuotationItemsList.tsx`

驗證結果：TypeScript 零錯誤

---

## 目前狀態

- `npm run build` 通過，零型別錯誤（31 頁面）
- `npm test` 通過，90/90 測試（新增 5 個 groupEmployeeData 測試）
- **✅ 全專案權限修復已完成**：RLS 政策 5 大類修復 + 前端 4 處權限守衛
- **✅ 待請款檢核文件上傳已修復**：draft record 自動建立 + 孤立檔案清理
- **✅ 待請款篩選/排序/成案日期已完成**：KOL/專案/月份篩選 + 成案日期排序 + 批次設定 DB 持久化
- **✅ 月結總覽已優化**：分組 Bug 修復（name fallback）+ 摘要表格 UI
- **✅ 多項 Bug 已修復**：快取同步、稅額計算、Modal 效能、審核狀態、空白清單刪除
- **✅ 成本明細排序功能已完成**：Excel 風格欄位標題排序（類別/KOL/執行內容/數量/單價/成本/小計）
- **✅ 待請款 UI 重構已完成**：批量預設面板 + 精簡列 + 智慧支出分類（bankType 自動推算）
- **✅ 架構優化已完成**：6 階段重構（env 集中化、CRUD Factory、分頁、元件拆分、錯誤邊界、測試）
- **✅ 匯費分配已修復**：匯費分配到勞務記錄，消除重複計算
- **✅ v2.5 帳務進階已完成**：代扣代繳全流程 + 月結總覽 + 三分頁重構 + Bug 修復
- **✅ 使用者管理已優化**：角色管理 + 員工綁定 + user_id 直接查詢
- **✅ 個人請款功能已驗證**：Code Review + 安全修復 + E2E 測試全通過
- **✅ 個人請款申請已完成**：expense_claims 表 + 表單模式 + 審核整合 + 帳務自動建立
- **✅ 權限安全防護已補強**：Middleware 資料驅動化、列印頁面身份驗證、請款頁面守衛
- **✅ 專案進度管理已完成**：projects + project_notes 表、KPI 卡片 + 備註系統
- **✅ React Query 全面遷移已完成**：全部頁面快取管理，切換頁面瞬間顯示
- **✅ UI/UX 全面優化已完成**：深色主題統一、骨架屏、空狀態元件
- **✅ RLS 政策整理已完成**：16 張核心表 100% 標準化
- **✅ GitHub CLI 已設定**：認證完成，可直接推送
- 開發時若遇 `.next` 快取問題，刪除 `.next` 資料夾後重啟即可

## 待辦 / 下一步

### 🔴 優先執行
- [ ] **推送 migration 至遠端 DB**：`20260226100000_fix_permission_gaps.sql`
- [ ] **全面功能回歸測試**：各頁面 CRUD + 權限分級（Admin/Editor/Member）
- [ ] **快取行為驗證**：跨頁失效（核准 → 已確認清單、儲存報價 → 列表頁）

### 🟡 部署與整合
- [ ] 建立 PR 合併 `feature/v2.5-accounting-withholding` → `main`
- [ ] 部署至正式環境
- [ ] 確認所有 migration 已套用

### 🟢 功能擴充
- [ ] 儀表板依角色顯示不同內容（Admin 可看財務摘要）
- [ ] 擴充測試覆蓋率（目前 85 個測試，可增加 hook 整合測試）
- [ ] 建立 RLS 政策文檔

## 備註

### 資料庫相關
- **RLS 政策標準命名**：`{table}_{operation}_{scope}_policy`
- **權限函式**：統一使用 `get_my_role()` 取得當前用戶角色
- **特殊設計**：employees 表有 3 個 SELECT 政策（Admin 全部、其他僅在職、user_id 綁定可讀自己）
- **DB 備份指令**：`supabase db dump -f supabase/backups/schema_YYYYMMDD.sql`（結構）/ 加 `--data-only`（資料）
- **代扣代繳防重複**：`withholding_settlements` 有 UNIQUE partial index on `expense_claim_id`
- **匯費分配**：`update_remittance_settings` RPC 將匯費分配到對應勞務記錄的 `remittance_fee` 欄位，`total_amount = amount + tax_amount - remittance_fee`
- **測試框架**：Jest + ts-jest + @testing-library/jest-dom，執行 `npm test`

### 開發相關
- `.next` 快取問題：`rm -rf .next` 後重啟 dev server
- 新增表單時：遵循 RLS 標準模板建立政策
- 修改權限時：保持命名格式一致
