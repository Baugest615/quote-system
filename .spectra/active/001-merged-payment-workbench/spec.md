# Spec: 合併請款工作台（統一請款入口）
spec-id: 001-merged-payment-workbench
版本：1.1
最後更新：2026-03-03

## 版本歷程

- **v1.0**（2026-03-02）：基礎功能 — 合併/送出/審核/駁回流程 + 整合既有介面
- **v1.1**（2026-03-03）：增強 — 行內上傳、帳戶類型分組、合併流程優化、進項管理合併標示

## v1.1 Delta 摘要

| 變更 | 原本 | 變更後 |
|------|------|--------|
| 工作台編輯能力 | 只能看和操作流程 | 行內編輯發票號碼 + 上傳附件 |
| 分組邏輯 | `remittance_name` 分組 | 依 `bankType` 分三區（勞報/公司行號/未填寫） |
| 成本 0 合併 | `cost_amount <= 0` 擋住 | 只擋 `NULL`，允許 0 |
| 合併 dialog | 選主項 → 確認 | 選主項 → 選月份 → 確認 |
| RPC 參數 | `create_quotation_merge_group(ids, leader)` | 新增 `p_payment_month TEXT` 可選參數 |
| 進項管理合併標示 | 只讀舊流程 `payment_requests` 路徑 | 新增 `quotation_items` 路徑 + 主項標記 |

## 功能需求

### v1.0 已完成（FR-1 ~ FR-15）

- **FR-1**: 請款工作台頁面 ✅
- **FR-2**: 待請款項目總覽 ✅
- **FR-3**: 跨報價單合併 ✅
- **FR-4**: 跨月份警告 ✅
- **FR-5**: 合併組主項 ✅
- **FR-6**: 單筆/整組送出 ✅
- **FR-7**: 審核介面 ✅
- **FR-8**: 撤回機制 ✅
- **FR-9**: 合併拆分 ✅
- **FR-10**: 報價單 DataGrid 簡化 ✅
- **FR-11**: 合併狀態 badge ✅
- **FR-12**: badge 跳轉 ✅
- **FR-13**: 個人請款整合 ✅
- **FR-14**: 已確認請款標示 ✅
- **FR-15**: 側邊欄導覽 ✅

### v1.1 新增（Must Have）

- **FR-16**: 工作台行內上傳 — 單筆項目可行內編輯發票號碼 + 上傳附件；合併組主項展開後可編輯，成員唯讀（送出時自動繼承）
- **FR-17**: 帳戶類型分組 — 依 KOL 的 `bankType` 分三大區塊：勞報（個人戶）以 `personalAccountName` 分組、公司行號以 `companyAccountName` 分組、未填寫資料（提醒補齊）
- **FR-18**: 成本 0 允許合併/送出 — `cost_amount = 0` 是合法場景（贈品、交換合作），只擋 `NULL`（未填寫）
- **FR-19**: 合併時指定請款月份 — 合併確認 dialog 新增「選月份」步驟，月份寫入所有成員項的 `expected_payment_month`
- **FR-20**: 進項管理合併標示 — 進項管理表格支援新流程的合併標示（色帶 + 標籤 + 主項標記），查詢同時 join `payment_requests` 和 `quotation_items`

## 技術規格

### 資料模型（v1.1 無新增欄位）

沿用 v1.0 的 `quotation_items` 既有欄位。`kol_bank_info`（JSONB）的 `bankType` 欄位用於前端分組。

### RPC 變更

#### 修改的 RPC

```sql
-- create_quotation_merge_group：新增可選參數
create_quotation_merge_group(
  p_item_ids UUID[],
  p_leader_id UUID,
  p_payment_month TEXT DEFAULT NULL   -- v1.1 新增
)
  -- 若 p_payment_month 不為空，更新所有成員的 expected_payment_month

-- submit_merge_group：放寬成本驗證
submit_merge_group(p_group_id UUID)
  -- 原本：cost_amount IS NULL OR cost_amount <= 0 → 報錯
  -- v1.1：cost_amount IS NULL → 報錯，cost_amount = 0 → 允許

-- submit_single_item：放寬成本驗證（同上邏輯）
submit_single_item(p_item_id UUID)
  -- 原本：cost_amount IS NULL OR cost_amount <= 0 → 報錯
  -- v1.1：cost_amount IS NULL → 報錯，cost_amount = 0 → 允許
```

### 前端變更

#### 修改的元件

```
src/components/payment-workbench/PendingSection.tsx
  — FR-16: 單筆項目行加入發票號碼 inline 編輯 + AttachmentUploader
  — FR-17: 改用帳戶類型分組邏輯
  — FR-18: 送出按鈕 disabled 條件放寬（允許 0）

src/components/payment-workbench/ReviewSection.tsx
  — FR-17: 改用帳戶類型分組邏輯

src/components/payment-workbench/RejectedSection.tsx
  — FR-17: 改用帳戶類型分組邏輯

src/components/payment-workbench/MergeGroupCard.tsx
  — FR-16: 展開後主項可編輯發票/上傳附件，成員唯讀

src/hooks/payment-workbench/useWorkbenchItems.ts
  — FR-17: groupByRemittee() 改用 bankType + 對應戶名分組

src/hooks/payment-workbench/useWorkbenchMerge.ts
  — FR-19: createMergeGroup() 新增 paymentMonth 參數

src/app/dashboard/accounting/expenses/page.tsx
  — FR-20: 查詢加 join quotation_items、合併標示雙路徑 fallback、主項標記
```

#### 複用的既有元件

```
src/components/quotes/v2/AttachmentUploader.tsx
  — 上傳/預覽/刪除附件，儲存路徑 quotation-items/{itemId}/
  — 被 MergeGroupCard 和 PendingSection 引用
```

## 驗收標準

### v1.0 已通過（AC-1 ~ AC-19）— 略

### v1.1 新增

#### 行內上傳
- [ ] AC-20: 待處理 Tab 的單筆項目可直接編輯發票號碼並即時儲存
- [ ] AC-21: 待處理 Tab 的單筆項目可上傳/預覽/刪除附件
- [ ] AC-22: 合併組展開後，主項可編輯發票/上傳附件，成員行顯示「送出時自動繼承」
- [ ] AC-23: 被駁回 Tab 的項目同樣支援行內編輯發票和上傳附件

#### 帳戶類型分組
- [ ] AC-24: 項目依 bankType=individual 分為「勞報（個人戶）」區塊，以 personalAccountName 分組
- [ ] AC-25: 項目依 bankType=company 分為「公司行號」區塊，以 companyAccountName 分組
- [ ] AC-26: bankType 為空或對應戶名為空的項目歸入「未填寫資料」區塊，並顯示提醒

#### 合併流程
- [ ] AC-27: cost_amount = 0 的項目可被合併且可送出
- [ ] AC-28: 合併確認 dialog 有「選月份」步驟，預設帶入組內已填寫的月份
- [ ] AC-29: 確認合併後，選定月份寫入所有成員的 expected_payment_month

#### 進項管理
- [ ] AC-30: 新流程核准的合併組在進項管理中顯示色帶和合併標籤
- [ ] AC-31: 合併組的主項在進項管理中顯示「★主項」標記
- [ ] AC-32: 預設排序時同一合併組的項目相鄰

## 非功能需求

沿用 v1.0。
