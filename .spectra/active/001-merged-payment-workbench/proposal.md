# Proposal: 合併請款工作台（統一請款入口）
spec-id: 001-merged-payment-workbench
日期：2026-03-02
狀態：approved
來源討論：.spectra/discussions/2026-03-02-merged-payment-requests.md

## 問題描述

1. **合併請款功能消失**：精簡化後 `pending-payments` 和 `payment-requests` 頁面被封存，跨專案合併請款的入口隨之消失，但實務上此需求頻繁存在
2. **請款入口分散**：目前報價單項目的請款在 DataGrid 內操作，個人請款在 expense-claims 頁面操作，審核者需要在多個地方來回
3. **跨報價單合併無法實現**：即使舊系統有合併功能，也僅限單一報價單內；實務上同一 KOL 跨專案開同一張發票是常態

## 提案方案

建立「請款工作台」作為**唯一的請款送出與審核入口**：

- **報價單 DataGrid** 簡化為成本資訊填寫，不再有送出/審核按鈕
- **個人請款頁面** 簡化為報銷項目的建立/編輯，送出與審核移至工作台
- **工作台** 統一顯示所有待請款項目（專案 + 個人），支援跨報價單合併、單筆/整組送出、審核
- **團進團出**：合併組整組操作，不支援拆單

## 影響範圍

- **影響的模組**：payments、pending-payments、quotes/v2、expense-claims、accounting、dashboard
- **影響的檔案（預估）**：15-20 個檔案
- **對既有功能的影響**：
  - 報價單 DataGrid：移除送出/審核按鈕，新增合併狀態 badge
  - 個人請款：移除送出/審核按鈕
  - 已確認請款：新增合併組標示
  - 側邊欄：新增工作台導覽項
- **變更等級**：Level 3（架構級 — 涉及新頁面、多模組聯動、RPC 新增、審核流程重構）

## 矛盾偵測結果

- ✅ `.spectra/active/` 無既有 spec，無衝突
- ✅ `.spectra/proposals/` 無其他 proposal，無衝突
- ✅ 與 CLAUDE.md 規則相容：
  - 深色模式：新頁面遵循 `class="dark"` 規範
  - 權限模型：工作台使用 `get_my_role()` + `usePermission()`
  - RLS：新 RPC 使用 `set search_path = ''` 慣例
  - 型別：JSONB 欄位維持 camelCase 慣例
- ⚠️ **需注意**：報價單 DataGrid（`QuotationItemsList.tsx`）移除按鈕後，已簽約報價單的欄位鎖定邏輯需同步調整（部分欄位從「已簽約鎖定」改為「已送出請款鎖定」）

## 風險與替代方案

| 風險 | 緩解措施 |
|------|---------|
| 使用者習慣改變（原本在 DataGrid 就能完成） | 工作台提供更完整的總覽，badge 可跳轉，降低摩擦 |
| 開發量大（15+ 檔案） | 分 4 個 Phase，每個 Phase 可獨立驗證 |
| RPC 新增可能影響效能 | 使用 index on merge_group_id，workbench query 加分頁 |
| 個人請款移至工作台可能增加 Member 的操作步驟 | Member 在工作台有專屬區域，流程步驟數相同 |
