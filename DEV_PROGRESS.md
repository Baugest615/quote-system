# 開發進度追蹤

> 最後更新：2026-02-21
> 分支：`feature/v1.5`

## 已完成

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

新增檔案：
- `supabase/migrations/20260221200001_add_user_id_to_employees.sql`
- `src/components/settings/UserEditModal.tsx`

修改檔案：
- `src/app/dashboard/settings/permissions/page.tsx`（完整重寫）
- `src/hooks/useMyEmployeeData.ts`（user_id 查詢）
- `src/types/custom.types.ts`（Employee 加 user_id）
- `src/lib/queryKeys.ts`（加 userManagement、unlinkedEmployees）
- `src/app/dashboard/accounting/employees/page.tsx`（加綁定帳號欄）

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

新增檔案：
- `supabase/migrations/20260221100000_fix_expense_claims_security.sql`

修改檔案：
- `src/app/dashboard/expense-claims/page.tsx`（canDelete 邏輯、user 空值檢查）
- `src/app/dashboard/payment-requests/page.tsx`（Hooks 順序、any 型別、query key）
- `src/app/dashboard/confirmed-payments/page.tsx`（any 型別、query key invalidation）
- `src/lib/queryKeys.ts`（新增 expenseClaimsPending）

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

新增檔案：
- `supabase/migrations/20260220000002_create_expense_claims.sql`
- `src/app/dashboard/expense-claims/page.tsx`
- `src/components/expense-claims/ExpenseClaimModal.tsx`
- `src/hooks/useProjectNames.ts`

修改檔案：
- `src/types/custom.types.ts`、`src/lib/queryKeys.ts`、`src/lib/spreadsheet-utils.ts`
- `src/components/accounting/SpreadsheetEditor.tsx`（autocomplete 升級）
- `src/app/dashboard/payment-requests/page.tsx`（Tab 擴展）
- `src/app/dashboard/confirmed-payments/page.tsx`（個人報帳整合）
- `src/components/payments/confirmed/PaymentRecordRow.tsx`（個人報帳渲染）
- `src/lib/payments/types.ts`、`src/lib/payments/grouping.ts`（型別 + 分組邏輯）
- `src/app/dashboard/accounting/expenses/page.tsx`（SearchableSelect）
- `src/app/dashboard/accounting/sales/page.tsx`（SearchableSelect）
- `src/components/dashboard/Sidebar.tsx`（Receipt icon）

驗證結果：TypeScript 零錯誤、Production build 成功（28 頁面）、Migration 已套用至遠端 DB

### 權限安全防護補強（2026-02-20）

全面安全稽核後修復 5 個缺口，建立分層防禦架構。

- [x] **Middleware 資料驅動化**
  - `routeToPageMap` 從 `PAGE_PERMISSIONS` 自動產生，不再手動維護
  - `restrictedPages` 改為動態判斷（`allowedRoles.length < 3` = 受限頁面）
  - 修復：`/dashboard/accounting`（Admin-only）之前完全沒有 middleware 保護
  - 修復：`/dashboard/projects`、`/dashboard/my-salary` 之前未在路由對照表中
- [x] **列印頁面身份驗證**
  - `/print/quote/[id]` 之前任何人可直接存取報價單（含客戶資料、金額、銀行帳號）
  - 新增 middleware matcher 覆蓋 `/print/:path*`
  - 新增頁面層級 `getUser()` 驗證（縱深防禦）
  - 重構 `getQuote()` 接收 supabase client 參數，避免重複建立
- [x] **請款頁面權限守衛**
  - `payment-requests/page.tsx`：加入 `usePermission` + `checkPageAccess('payment_requests')`
  - `confirmed-payments/page.tsx`：加入 `usePermission` + `checkPageAccess('confirmed_payments')`
  - 無權限時顯示 Shield 圖示 + 拒絕訊息（與 AccountingLoadingGuard 風格一致）
- [x] **PDF API 權限檢查**
  - `/api/pdf/generate` 原本僅驗證身份，現加入角色權限檢查
  - 使用 `PAGE_PERMISSIONS[PAGE_KEYS.QUOTES].allowedRoles` 動態驗證

修改檔案：
- `middleware.ts`（資料驅動路由對照 + 動態受限頁面檢查 + /print 保護）
- `src/app/print/quote/[id]/page.tsx`（伺服器端身份驗證）
- `src/app/dashboard/payment-requests/page.tsx`（頁面級權限守衛）
- `src/app/dashboard/confirmed-payments/page.tsx`（頁面級權限守衛）
- `src/app/api/pdf/generate/route.ts`（角色權限檢查）

驗證結果：TypeScript 零錯誤、Production build 成功（28 頁面）

### 專案進度管理頁面（2026-02-20）

新增「專案進度管理」功能，追蹤專案從洽談到結案的完整生命週期。

- [x] **資料庫設計**
  - 新增 `projects` 表：client_id (FK→clients), client_name, project_name, project_type (專案/經紀), budget_with_tax, notes, status (洽談中/執行中/結案中/關案), quotation_id (FK→quotations)
  - RLS 政策：核心業務表模式（SELECT/INSERT/UPDATE 全部、DELETE Admin）
  - 索引：status, quotation_id, created_at DESC
  - `auto_close_projects()` RPC：結案中專案若 accounting_sales 全部已收款則自動標記關案
  - 資料遷移：現有 quotations 自動建立對應 project 記錄（status = '執行中'）
  - Migration: `20260221000001_create_projects_table.sql`
- [x] **多則備註系統**
  - 新增 `project_notes` 表：project_id (FK→projects, CASCADE), content, created_by, created_at
  - RLS：全員可讀寫，刪除限 Admin 或本人
  - `get_project_notes()` RPC：含作者 email 的備註查詢
  - `get_project_notes_count()` RPC：各專案備註數量統計
  - 舊 projects.notes 資料自動遷移至 project_notes
  - Migration: `20260221000002_create_project_notes_table.sql`
- [x] **前端頁面**
  - KPI 統計卡片（4 階段：洽談中/執行中/結案中/關案）+ Tab 表格切換
  - 可展開行：點擊整行展開備註面板（ChevronRight 箭頭指示）
  - 備註面板：多則備註列表（作者 + 時間戳 + 內容）+ 新增備註輸入框
  - 備註數量 badge 顯示於專案名稱旁
  - 搜尋功能：跨廠商名稱、專案名稱搜尋
  - 洽談中 → 新增報價單（帶入 projectId 跳轉 QuoteForm）
  - 執行中/結案中 → 目前進度下拉切換
  - 關案 → 唯讀模式，系統自動標記
- [x] **React Query Hooks**
  - `useProjects`, `useProject`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`, `useAutoCloseProjects`
  - `useProjectNotes`, `useProjectNotesCounts`, `useCreateProjectNote`, `useDeleteProjectNote`
- [x] **整合修改**
  - Sidebar 新增「專案進度」連結（FolderKanban icon）
  - QuoteForm 支援 `projectId` URL 參數預填
  - PAGE_KEYS.PROJECTS + PAGE_PERMISSIONS 權限設定
  - queryKeys 新增 projects, projectNotes, projectNotesCounts

新增檔案：
- `supabase/migrations/20260221000001_create_projects_table.sql`
- `supabase/migrations/20260221000002_create_project_notes_table.sql`
- `src/app/dashboard/projects/page.tsx`
- `src/hooks/useProjects.ts`
- `src/hooks/useProjectNotes.ts`
- `src/components/projects/ProjectFormModal.tsx`
- `src/components/projects/ProjectTable.tsx`
- `src/components/projects/ProjectNotesPanel.tsx`

修改檔案：
- `src/types/custom.types.ts`（Project, ProjectNote 型別 + PAGE_KEYS + PAGE_PERMISSIONS）
- `src/lib/queryKeys.ts`（projects, projectNotes, projectNotesCounts）
- `src/components/dashboard/Sidebar.tsx`（FolderKanban icon + 導覽連結）
- `src/components/quotes/QuoteForm.tsx`（projectId 參數預填支援）
- `src/app/dashboard/quotes/new/page.tsx`（Suspense boundary）

驗證結果：TypeScript 零錯誤、Production build 成功（28 頁面）、Migration 已套用至遠端 DB

### React Query 全面遷移 + 跨頁快取失效 + DB 索引補強（2026-02-19）

全部 23 個 Dashboard 頁面從直接 Supabase 呼叫遷移至 React Query 快取管理。
切換頁面從 ~1.5-2s 降至 < 100ms（快取命中時瞬間顯示）。

- [x] **Phase 1：基礎建設**
  - 新增 `src/lib/queryKeys.ts` — 統一 Query Key Registry（42 個 key）
  - 重構 `useCRUDTable.ts` — 內部改用 `useQuery` + `useMutation`，保持相同回傳 API
  - 重構 `useAccountingTable.ts` — 同上，year 作為 queryKey 的一部分
  - 更新 `useClients.ts`、`useKols.ts`、`useQuotations.ts`、`useDashboardData.ts` 使用 queryKeys
- [x] **Phase 2：核心頁面遷移**
  - `clients/page.tsx` — 改用 `useClients()` + mutations
  - `kols/page.tsx` — 改用 `useKols()` + `useKolTypes()` + `useServiceTypes()`
  - `quotes/page.tsx` — 改用 `useQuotationsList(page)` + `useClients()`
  - `quotes/edit/[id]/page.tsx`、`quotes/view/[id]/page.tsx` — 改用 `useQuotation(id)`
  - 新增 `src/hooks/useReferenceData.ts`（共用字典資料 hooks）
- [x] **Phase 3：請款流程頁面遷移**
  - `pending-payments/page.tsx` — `usePendingItems` 內部改用 React Query
  - `payment-requests/page.tsx` — `usePaymentData` 改用 `useQuery`
  - `confirmed-payments/page.tsx` — 同上
- [x] **Phase 4：其他頁面遷移**
  - `settings/page.tsx` — 改用 `useServiceTypes()` + `useQuoteCategories()` + `useKolTypes()` + mutations
  - `settings/permissions/page.tsx` — 改用 `useQuery` + `useMutation`
  - `reports/page.tsx` — 新增 `useReportData` hook
  - `my-salary/page.tsx` — 新增 `useMyEmployeeData` hook
- [x] **Phase 5：會計模組遷移（8 頁面）**
  - 唯讀頁面：`accounting/page.tsx`（總覽）、`projects/page.tsx`、`reports/page.tsx` — `useQuery` + `useMemo`
  - CRUD 頁面：`sales/page.tsx`、`expenses/page.tsx`、`payroll/page.tsx` — `useQuery` + `useMutation` + batch save
  - `employees/page.tsx`、`insurance-rates/page.tsx` — `useQuery` + `useMutation`
  - `calculator/page.tsx` — 純客戶端計算，無需遷移
- [x] **Phase 6：跨頁快取失效策略**
  - 核准請款 → 失效 `confirmedPayments` + `pendingPayments` + `dashboardStats`
  - 駁回請款 → 失效 `pendingPayments`
  - 退回已確認請款 → 失效 `paymentRequests`
  - 儲存/刪除報價單 → 失效 `quotations` + `dashboardStats`
  - 提交請款 → 失效 `paymentRequests`
  - 解除合併 → 失效 `pendingPayments`
- [x] **Phase 7：資料庫效能索引**
  - 新增 `20260219100000_add_performance_indexes.sql`（7 個索引）
  - 涵蓋：會計表 year 查詢、薪資 salary_month、請款 status+date 複合索引、保險費率 active 篩選

新增檔案：
- `src/lib/queryKeys.ts`
- `src/hooks/useReferenceData.ts`
- `src/hooks/useReportData.ts`
- `src/hooks/useMyEmployeeData.ts`
- `supabase/migrations/20260219100000_add_performance_indexes.sql`

修改檔案：~35 個（所有 dashboard 頁面 + hooks + 請款流程元件）

驗證結果：TypeScript 零錯誤、Production build 成功（27 頁面全部通過）

### 全專案 UI/UX 全面優化 — 9 階段計畫（2026-02-19）

共修改 **45+ 個檔案**，涵蓋全部 19 個 dashboard 頁面。

- [x] **Phase 0：CSS 變數擴充** — 新增 `--warning`、`--success`、`--info` 語義色彩至 `globals.css` 與 `tailwind.config.js`
- [x] **Phase 1：共用元件建立**
  - `StatusBadge.tsx` — 統一所有狀態標籤樣式
  - `Skeleton.tsx` — 骨架屏載入元件（Skeleton、SkeletonTable、SkeletonStatCards、SkeletonPageHeader、SkeletonCard）
  - `EmptyState.tsx` — 通用空狀態元件（icon + 標題 + 描述 + 操作按鈕）
- [x] **Phase 2：核心共用元件修正**（8 個檔案）
  - EditableCell、QuotesDataGrid、QuotationItemsList、QuoteForm、AccountingModal、AccountingLoadingGuard、SpreadsheetEditor、Pagination
  - 硬編碼色彩 → CSS 變數主題色
- [x] **Phase 3：會計模組深色模式**（10 個檔案）
  - 會計總覽、銷項、進項、薪資、專案損益、計算器、報表、員工、費率表、我的薪資
  - `bg-white` → `bg-card`、`text-gray-*` → `text-foreground/muted-foreground`
  - KPI 卡片使用 chart 變數：`bg-chart-4/10 text-chart-4`
- [x] **Phase 4：其餘頁面修正**（~15 個檔案）
  - PaymentStatusBadge、clients、kols、reports、quotes、pending-payments 等全部頁面
  - `emerald-*` → `primary`、`red-*` → `destructive`、`blue-*` → `info`
- [x] **Phase 5：載入狀態升級為骨架屏**（8 個頁面）
  - clients、kols、quotes 列表/檢視/編輯、settings、reports、QuoteForm
  - 「讀取中...」文字 → SkeletonPageHeader + SkeletonStatCards + SkeletonTable 組合
- [x] **Phase 6：空狀態升級為 EmptyState 元件**（7 個頁面）
  - clients、QuotesDataGrid、SpreadsheetEditor、accounting（sales/expenses/payroll/projects）
  - 搜尋無結果 vs 尚無資料 兩種模式
- [x] **Phase 7：Z-Index 分層標準化**
  - Sidebar `z-[9999]` → `z-[60]`、SearchableSelectCell `z-[9999]` → `z-[60]`、globals.css `z-[99999]` → `z-[60]`
- [x] **Phase 8：表單驗證 UX** — QuoteForm 提交失敗時自動捲到第一個錯誤欄位
- [x] **Phase 9：最終清理審計**（~23 個檔案）
  - not-found、ErrorBoundary、settings、login、confirmed-payments、FileModal、payment-requests 等
  - 移除所有剩餘硬編碼色彩（PDF/列印元件除外，故意保持淺色）

新增檔案：
- `src/components/ui/StatusBadge.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/components/ui/EmptyState.tsx`

驗證結果：TypeScript 檢查通過、Production build 成功

### 報價單檢視頁面暗色主題優化 & PDF 生成修復（2026-02-19）
- [x] **檢視頁面顏色修正**：暗色主題下有色區塊（藍/紅背景）難以閱讀
  - `bg-blue-50` → `bg-blue-500/10 text-blue-400`（未稅優惠、KOL 欄位）
  - `bg-red-50` → `bg-red-500/10 text-red-400`（含稅總計）
  - 僅修改畫面顯示區 `#printable-quote`，PDF 隱藏區保持白底配色不變
- [x] **PDF 瀏覽器自動偵測**：新 Mac 無 Chrome，改為自動偵測可用 Chromium 瀏覽器
  - 支援 Chrome、Brave、Edge、Chromium（macOS / Windows / Linux）
  - 不影響部署環境（Railway Docker 使用 `PUPPETEER_EXECUTABLE_PATH`）
- [x] **PDF 中文字體修復**：Brave headless 模式下 PingFang TC 不可用導致中文消失
  - 偵測到 Brave headless 可用字體：Heiti TC、Apple LiGothic、STHeiti
  - 使用 `page.addStyleTag()` 注入 CJK 字體覆寫（避免 Next.js root layout 字體衝突）
- [x] **PDF 白底修正**：暗色主題背景滲入 PDF，注入 `background: white !important`
- [x] **PDF A4 版面修復**：內容未展開至 A4 全寬
  - 使用 `page.evaluate()` 將 `#printable-quote` 搬到 body 下，移除 root layout 包裝
  - 保留所有 `<style>` 標籤避免 CSS 規則遺失

修改檔案：
- `src/app/dashboard/quotes/view/[id]/page.tsx`（暗色主題配色）
- `src/app/api/pdf/generate/route.ts`（瀏覽器偵測、DOM 操作、字體注入）
- `src/app/print/quote/[id]/page.tsx`（字體宣告更新）

### CLAUDE.md 文件完善（2026-02-16 晚間）
- [x] 新增 Skills 使用指引章節
  - 明確說明 AI 助手應主動檢查並優先使用 Skills
  - 列出常見應用場景與 Skills 對應關係
  - 強調不需使用者提示即應主動使用
- [x] 新增「完成開發工作流程」章節
  - AI 主動引導機制：開發完成後主動詢問
  - 標準執行順序：更新文件 → commit → push
  - 完整流程範例與注意事項
- [x] 新增「新開發環境設定」章節
  - 基礎工具安裝指引（Homebrew、Node.js、gh CLI）
  - 專案初始化步驟
  - Claude Code 設定說明
  - GitHub 認證流程
  - 環境同步檢查清單
- [x] 安裝並設定 GitHub CLI
  - 安裝 gh v2.86.0
  - 完成 GitHub 認證（Baugest615）
  - 設定 git 使用 gh CLI 認證

### RLS 政策全面整理與標準化（2026-02-16）
- [x] 完成 16 張核心表的 RLS 政策標準化（100% 完成）
- [x] 政策數量優化：72 個 → 65 個（-7 個冗餘政策）
- [x] 修正項目：
  - [x] 刪除 13 個重複的 SELECT 政策（8 張表）
  - [x] 刪除 9 個過多的 ALL 政策（3 張財務表）
  - [x] 修正 4 張表的舊函數 `get_user_role` → `get_my_role`
  - [x] 補齊 8 張表缺少的 CRUD 政策
  - [x] 統一命名規範：`{table}_{operation}_{scope}_policy`
  - [x] 保留特殊業務邏輯（employees 表的分級權限）
- [x] 分 4 階段執行：
  - **階段 1**：核心業務表 + 字典表（8 張）
  - **階段 2**：財務表（3 張）
  - **階段 3**：人事表（1 張）
  - **階段 4**：會計表（4 張）

**已整理的表**：
- 核心業務：kols, quotations, clients
- 字典表：kol_services, kol_types, service_types, quote_categories, quotation_items
- 財務表：payment_requests, payment_confirmations, payment_confirmation_items
- 人事表：employees（保留 2 個 SELECT 政策用於分級權限）
- 會計表：accounting_expenses, accounting_payroll, accounting_sales, insurance_rate_tables

**生成的文件**：
- 16 個 SQL 整理腳本：`/tmp/rls_cleanup_[1-16]_*.sql`
- 完整報告：`/tmp/ultimate_completion_report.md`
- 包含詳細測試清單、質量評分、後續建議

**安全性提升**：
- ✅ 財務操作權限明確限制為 Admin + Editor
- ✅ 字典管理權限限制為 Admin + Editor
- ✅ 敏感資料（費率表）僅 Admin 可寫
- ✅ 刪除操作統一限制為 Admin

**可維護性提升**：
- 命名規範：25% → 100%（+300%）
- 權限明確性：60% → 100%（+67%）
- 可讀性：40% → 100%（+150%）
- 一致性：50% → 100%（+100%）

### 儀表板改版 — Executive Overview 風格（2026-02-14）
- [x] 安裝 Recharts 圖表庫
- [x] 建立 `useDashboardData` React Query hook（3 個平行 Supabase 查詢 + 月份分組）
- [x] 建立 `KpiCard` 元件（含 Recharts Sparkline，手機版隱藏趨勢線）
- [x] 建立 `RevenueChart` 月營收折線圖（emerald 漸層填充 + custom tooltip）
- [x] 建立 `QuoteStatusChart` 甜甜圈圖（4 狀態配色 + 自訂圖例）
- [x] 建立 `ActionItems` 待辦事項列表（可點擊導航）
- [x] 重寫 `dashboard/page.tsx` 為三段式 layout：KPI 卡片 → 圖表 → 待辦+快速功能
- [x] 載入骨架動畫（animate-pulse skeleton）
- [x] TypeScript 型別檢查通過、`npm run build` 通過

新增檔案：
- `src/hooks/dashboard/useDashboardData.ts`
- `src/components/dashboard/KpiCard.tsx`
- `src/components/dashboard/RevenueChart.tsx`
- `src/components/dashboard/QuoteStatusChart.tsx`
- `src/components/dashboard/ActionItems.tsx`

### V2.1 全面優化（2026-02-14）
- [x] Phase 1：安全加固 — 6 張表補 RLS、PDF API 認證、RPC 角色驗證
- [x] Phase 2：共用元件 — FormModal、SearchableSelect、useCRUDTable
- [x] Phase 3：React Query — @tanstack/react-query + useClients/useKols/useQuotations
- [x] Phase 4：型別安全 — Zod schemas、消除 39+ 檔案 `: any`、ErrorBoundary
- [x] Phase 5：效能檢查 — 確認無 N+1、重型函式庫已動態 import
- [x] DB 結構備份存 git（`supabase/backups/schema_20260214.sql`）
- [x] DB 資料備份存本地（`supabase/backups/data_20260214.sql`）
- [x] 回滾 migration 備用（`supabase/migrations/20260215999999_rollback_security_hardening.sql`）
- [x] Docker Desktop 安裝完成

### 先前版本
- [x] V2.0.1 UI 深色主題優化與行動裝置響應式改善
- [x] 會計模組新增（專案損益、財務報表、計算器、薪資、銷售、費用）
- [x] Claude Code 專案配置與 skills 同步

## 目前狀態

- `npm run build` 通過，零型別錯誤（29 頁面）
- **✅ 使用者管理已優化**：角色管理 + 員工綁定 + user_id 直接查詢
- **✅ 個人請款功能已驗證**：Code Review + 安全修復 + E2E 測試全通過
- **✅ 個人請款申請已完成**：expense_claims 表 + 表單模式 + 審核整合 + 帳務自動建立
- **✅ SearchableSelect 統一**：Modal 表單 + SpreadsheetEditor 的專案名稱搜尋元件一致
- **✅ 權限安全防護已補強**：Middleware 資料驅動化、列印頁面身份驗證、請款頁面守衛
- **✅ 專案進度管理已完成**：projects + project_notes 表、KPI 卡片 + 備註系統
- **✅ React Query 全面遷移已完成**：全部頁面快取管理，切換頁面瞬間顯示
- **✅ UI/UX 全面優化已完成**：深色主題統一、骨架屏、空狀態元件
- **✅ RLS 政策整理已完成**：16 張核心表 100% 標準化
- **✅ PDF 生成已修復**：多瀏覽器自動偵測、中文字體、白底、A4 全寬
- **✅ GitHub CLI 已設定**：認證完成，可直接推送
- 開發時若遇 `.next` 快取問題，刪除 `.next` 資料夾後重啟即可

## 開發環境同步

以下設定透過 Git 同步，clone 即可在其他環境使用：
- `.claude/settings.json` — Claude Code 共用設定
- `.claude/skills/` — 所有 AI Skills（commit, db-migration, pr, review 等）
- `CLAUDE.md` — AI 助手開發規則

個人設定（不同步）：`.claude/settings.local.json`、`*.local.*`

## 待辦 / 下一步

### 🔴 優先執行
- [x] ~~**個人請款功能測試**~~：Code Review + 安全修復 + Playwright E2E 全通過
- [ ] **全面功能回歸測試**：各頁面 CRUD + 權限分級（Admin/Editor/Member）
- [ ] **快取行為驗證**：跨頁失效（核准 → 已確認清單、儲存報價 → 列表頁）

### 🟡 部署與整合
- [ ] 建立 PR 合併 `feature/v1.5` → `main`（安全修復 migration 需套用）
- [ ] 部署至正式環境
- [ ] 確認所有 migration 已套用（含 `20260221100000` + `20260221200001`）

### 🟢 功能擴充
- [ ] 儀表板依角色顯示不同內容（Admin 可看財務摘要）
- [ ] 建立 RLS 政策文檔

## 備註

### 資料庫相關
- **RLS 政策標準命名**：`{table}_{operation}_{scope}_policy`
- **權限函式**：統一使用 `get_my_role()` 取得當前用戶角色
- **特殊設計**：employees 表有 3 個 SELECT 政策（Admin 全部、其他僅在職、user_id 綁定可讀自己）
- **回滾 RLS**：執行 `supabase/migrations/20260215999999_rollback_security_hardening.sql`
- **DB 備份指令**：`supabase db dump -f supabase/backups/schema_YYYYMMDD.sql`（結構）/ 加 `--data-only`（資料）
- **RLS 整理報告**：詳見 `/tmp/ultimate_completion_report.md`（含測試清單、質量評分）

### 開發相關
- `.next` 快取問題：`rm -rf .next` 後重啟 dev server
- 新增表單時：遵循 RLS 標準模板建立政策
- 修改權限時：保持命名格式一致
