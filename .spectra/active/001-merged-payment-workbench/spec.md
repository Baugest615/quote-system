# Spec: 合併請款工作台（統一請款入口）
spec-id: 001-merged-payment-workbench
版本：1.0
最後更新：2026-03-02

## 功能需求

### 必要（Must Have）

- **FR-1**: 請款工作台頁面 — 新增 `/dashboard/payment-workbench` 頁面，Admin/Editor/Member 皆可存取
- **FR-2**: 待請款項目總覽 — 顯示所有已簽約報價單中尚未送出（或被駁回）的項目，按匯款對象分組
- **FR-3**: 跨報價單合併 — 可從不同報價單選取項目合併為一組，條件：同匯款對象 + 同銀行帳戶
- **FR-4**: 跨月份警告 — 合併時若項目的預計請款月份不同，跳出警告對話框，確認後可繼續
- **FR-5**: 合併組主項 — 使用者選擇一筆作為主項（leader），主項持有發票號碼和附件
- **FR-6**: 單筆/整組送出 — 未合併的項目可單筆送出；合併組整組送出（團進）
- **FR-7**: 審核介面 — Admin/Editor 可在工作台審核請款，合併組以可展開卡片呈現，整組核准/駁回（團出）
- **FR-8**: 撤回機制 — 送出者可在審核前撤回已送出的項目/組，回到草稿狀態
- **FR-9**: 合併拆分 — 草稿或被駁回狀態的合併組可拆分；已送出（未撤回）和已核准的不可拆分
- **FR-10**: 報價單 DataGrid 簡化 — 移除送出請款/核准/駁回按鈕，僅保留成本資訊編輯
- **FR-11**: 合併狀態 badge — 報價單 DataGrid 上用小圖示 + 色點標示合併狀態，hover 顯示詳情
- **FR-12**: badge 跳轉 — 點擊 badge 跳轉至工作台並聚焦到該合併組
- **FR-13**: 個人請款整合 — 個人請款（expense_claims）的送出與審核移至工作台，原頁面僅保留建立/編輯功能
- **FR-14**: 已確認請款標示 — confirmed-payments 頁面的匯款群組顯示合併組資訊
- **FR-15**: 側邊欄導覽 — 新增「請款工作台」導覽項目

### 可選（Nice to Have）

- **FR-N1**: 批次設定 — 一次對多個項目設定費用類別、會計科目、預計請款月份
- **FR-N2**: 工作台儀表板 — 頂部統計卡片（待請款總額、待審核數、本月已核准金額）
- **FR-N3**: 合併組備註 — 建立合併時可附加一段說明文字

## 技術規格

### 資料模型

#### 既有欄位（不需修改 schema）

`quotation_items` 已有的合併欄位：
```
merge_group_id    UUID          — 合併組識別碼
is_merge_leader   BOOLEAN       — 是否為主項
merge_color       TEXT          — UI 色帶顏色
```

`quotation_items` 已有的請款欄位：
```
cost_amount       NUMERIC       — 請款金額
invoice_number    TEXT          — 發票號碼
attachments       JSONB         — 附件檔案
expense_type      TEXT          — 費用類別
accounting_subject TEXT         — 會計科目
expected_payment_month TEXT     — 預計請款月份
requested_at      TIMESTAMPTZ   — 送出時間
requested_by      UUID          — 送出人
approved_at       TIMESTAMPTZ   — 核准時間
approved_by       UUID          — 核准人
rejected_at       TIMESTAMPTZ   — 駁回時間
rejected_by       UUID          — 駁回人
rejection_reason  TEXT          — 駁回原因
remittance_name   TEXT          — 匯款對象名稱
```

#### 不新增表格

利用既有的 `merge_group_id`（全域 UUID）作為合併組識別。合併組的狀態由組內項目的狀態一致推導：
- 全部 `requested_at = NULL` → 草稿
- 全部 `requested_at != NULL` 且 `approved_at = NULL` 且 `rejected_at = NULL` → 已送出
- 全部 `approved_at != NULL` → 已核准
- 全部 `rejected_at != NULL` → 被駁回

團進團出保證組內狀態一致，無需額外狀態欄位。

### RPC 設計

#### 新增 RPC

```sql
-- 1. 取得工作台項目（跨所有已簽約報價單）
get_workbench_items()
  RETURNS TABLE(
    -- quotation_items 欄位
    id, quotation_id, kol_id, service, price, quantity,
    cost_amount, invoice_number, attachments,
    expense_type, accounting_subject, expected_payment_month,
    requested_at, requested_by, approved_at, approved_by,
    rejected_at, rejected_by, rejection_reason,
    remittance_name, merge_group_id, is_merge_leader, merge_color,
    -- 關聯資訊
    quotation_project_name, quotation_client_name,
    kol_name, kol_bank_info
  )
  -- 條件：quotation.status = '已簽約'
  -- 包含：pending（未送出）、requested（待審核）、rejected（被駁回）
  -- 不含：approved（已核准）

-- 2. 建立合併組
create_quotation_merge_group(
  p_item_ids UUID[],
  p_leader_id UUID
)
  -- 驗證：同 remittance_name + 同 bank_info + 全部 pending + 全部未加入其他組
  -- 執行：產生 UUID，設定 merge_group_id、is_merge_leader、merge_color
  -- 回傳：merge_group_id

-- 3. 拆分合併組
dissolve_quotation_merge_group(p_group_id UUID)
  -- 驗證：全部 pending 或全部 rejected
  -- 執行：清除 merge_group_id、is_merge_leader、merge_color
  -- 非主項清除繼承的 invoice_number、attachments

-- 4. 送出合併組（團進）
submit_merge_group(p_group_id UUID, p_submitted_by UUID)
  -- 驗證：全部 pending + 主項有 invoice 或 attachments
  -- 執行：所有項目設定 requested_at = NOW(), requested_by
  -- 非主項複製主項的 invoice_number、attachments

-- 5. 送出單筆項目
submit_single_item(p_item_id UUID, p_submitted_by UUID)
  -- 驗證：pending + 有 invoice 或 attachments + 未加入合併組
  -- 執行：設定 requested_at、requested_by

-- 6. 撤回合併組
withdraw_merge_group(p_group_id UUID, p_user_id UUID)
  -- 驗證：全部 requested（未核准）+ 撤回人 = 送出人 或 Admin
  -- 執行：清除 requested_at、requested_by
  -- 非主項清除繼承的 invoice_number、attachments

-- 7. 撤回單筆
withdraw_single_item(p_item_id UUID, p_user_id UUID)
  -- 同上，針對未加入合併組的單筆

-- 8. 核准合併組（團進）
approve_merge_group(p_group_id UUID, p_approver_id UUID)
  -- 驗證：全部 requested + 核准人為 Admin/Editor
  -- 執行：逐筆呼叫 approve_quotation_item() 邏輯
  --   → 每筆建立 accounting_expenses + payment_confirmation_items
  -- 整組在同一 transaction 內完成

-- 9. 駁回合併組（團出）
reject_merge_group(p_group_id UUID, p_rejector_id UUID, p_reason TEXT)
  -- 驗證：全部 requested + 駁回人為 Admin/Editor
  -- 執行：所有項目設定 rejected_at、rejected_by、rejection_reason
  -- 清除 requested_at、requested_by
```

#### 修改既有 RPC

- `get_available_pending_payments()` — 標記為 deprecated，由 `get_workbench_items()` 取代

### 前端元件

#### 新增

```
src/app/dashboard/payment-workbench/
  page.tsx                              — 頁面入口

src/components/payment-workbench/
  WorkbenchPage.tsx                     — 主容器（tab 分割：待處理 / 審核中 / 被駁回）
  WorkbenchFilters.tsx                  — 篩選列（匯款對象、專案、月份、狀態）
  PendingSection.tsx                    — 待請款區塊（可勾選、可合併）
  ReviewSection.tsx                     — 待審核區塊（核准/駁回操作）
  RejectedSection.tsx                   — 被駁回區塊（可重新編輯、重送）
  RemitteeGroup.tsx                     — 按匯款對象分組的容器
  PaymentItemRow.tsx                    — 單筆項目行
  MergeGroupCard.tsx                    — 合併組可展開卡片
  MergeConfirmDialog.tsx                — 合併確認對話框（選主項）
  CrossMonthWarningDialog.tsx           — 跨月份警告對話框
  WithdrawConfirmDialog.tsx             — 撤回確認對話框
  RejectDialog.tsx                      — 駁回原因填寫對話框
  ExpenseClaimSection.tsx               — 個人請款區塊

src/hooks/payment-workbench/
  useWorkbenchItems.ts                  — React Query：get_workbench_items()
  useWorkbenchMerge.ts                  — 合併/拆分操作 + 狀態管理
  useWorkbenchSubmission.ts             — 送出/撤回操作
  useWorkbenchReview.ts                 — 核准/駁回操作
  useWorkbenchFilters.ts                — 篩選狀態管理
```

#### 修改

```
src/components/quotes/v2/QuotationItemsList.tsx
  — 移除：handleRequestPayment(), handleApprovePayment(), handleRejectPayment()
  — 移除：送出/核准/駁回按鈕 UI
  — 新增：MergeBadge 元件（顯示合併狀態 + 點擊跳轉）
  — 保留：成本欄位編輯（cost_amount, invoice_number, attachments, expense_type 等）

src/app/dashboard/expense-claims/page.tsx
  — 移除：送出審核按鈕、核准/駁回按鈕
  — 保留：建立/編輯/刪除草稿

src/components/dashboard/Sidebar.tsx
  — 新增：「請款工作台」導覽項（icon: Wallet 或 ClipboardList）
  — 位置：在「已確認請款清單」之前

src/app/dashboard/confirmed-payments/page.tsx
  — 新增：合併組標示（N 筆合併 badge）

src/types/custom.types.ts
  — 新增：payment_workbench 頁面權限設定
```

## 驗收標準

### 核心流程
- [ ] AC-1: 工作台顯示所有已簽約報價單中待請款、待審核、被駁回的項目
- [ ] AC-2: 可從不同報價單選取同帳戶的項目進行合併，產生合併組
- [ ] AC-3: 合併時若跨月份，顯示警告對話框，確認後繼續
- [ ] AC-4: 合併組可整組送出請款（團進），非主項自動繼承主項發票/附件
- [ ] AC-5: 合併組可整組核准（團進），每筆自動建立 accounting_expenses
- [ ] AC-6: 合併組可整組駁回（團出），附駁回原因
- [ ] AC-7: 送出者可撤回已送出（未核准）的項目/組
- [ ] AC-8: 草稿或被駁回的合併組可拆分；已送出/已核准的不可拆分

### 現有介面整合
- [ ] AC-9: 報價單 DataGrid 無送出/核准/駁回按鈕，成本編輯正常運作
- [ ] AC-10: 報價單 DataGrid 上已合併項目顯示 badge，hover 看詳情，點擊跳轉工作台
- [ ] AC-11: 個人請款頁面僅可建立/編輯草稿，送出/審核在工作台操作
- [ ] AC-12: 已確認請款頁面顯示合併組標示
- [ ] AC-13: 側邊欄有「請款工作台」導覽項

### 權限與安全
- [ ] AC-14: Member 只能看到自己參與的項目和自己的個人請款
- [ ] AC-15: 只有 Admin/Editor 可核准/駁回
- [ ] AC-16: 撤回限制：僅送出者本人或 Admin 可撤回
- [ ] AC-17: 合併驗證：不同帳戶不能合併（硬性阻擋）

### 資料一致性
- [ ] AC-18: 核准後的帳務記錄（accounting_expenses）每筆獨立，可用 merge_group_id 關聯
- [ ] AC-19: 已核准項目不可拆分、不可撤回、不可重新合併

## 非功能需求

- **效能**：工作台項目查詢需在 500ms 內回應（建議 merge_group_id 加 index）
- **安全**：所有 RPC 使用 `auth.uid()` 驗證，RLS 政策限制存取範圍
- **相容性**：不影響已存在的 payment_requests 資料（舊資料保留但不再新增）
