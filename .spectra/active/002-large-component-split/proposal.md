# Proposal: 大型元件拆分 — QuotationItemsFlatView + QuotationItemsList

spec-id: 002-large-component-split
日期：2026-03-04
狀態：approved
來源討論：.spectra/discussions/2026-03-04-large-component-split.md

## 問題描述

`quotes/v2/` 模組有兩個超過 1,000 行的巨型元件：
- `QuotationItemsFlatView.tsx`（1,195 行）：跨報價攤平試算表
- `QuotationItemsList.tsx`（1,109 行）：單報價明細編輯

問題：
1. **維護困難**：單檔超過 1,000 行，函數間的依賴關係難以追蹤
2. **重複代碼**：~250 行邏輯完全相同（PaymentStatus、驗證、參考資料載入）
3. **效能隱患**：FlatView 50 行/頁，任何 state 變更都觸發全部重渲染
4. **測試困難**：邏輯和渲染耦合，無法單獨測試業務邏輯

## 提案方案

採用**混合拆分策略**：
1. **Phase 1**：提取共用邏輯到 `shared/` 目錄（消除重複）
2. **Phase 2**：從兩個元件中提取 custom hooks（邏輯/渲染分離）
3. **Phase 3**：拆出子元件（垂直切），每個 ≤ 300 行
4. **Phase 4**：驗證（tsc + build + 手動冒煙測試）

資料管理策略維持不統一：FlatView 繼續 React Query，ItemsList 繼續 local state。

## 影響範圍

- 影響的模組：`src/components/quotes/v2/`
- 影響的檔案（預估）：
  - 修改：2 個（QuotationItemsFlatView.tsx, QuotationItemsList.tsx）
  - 新增：~11 個（shared/ × 3 + FlatView 子模組 × 4 + ItemsList 子模組 × 4）
  - 消費者不變：`QuotesDataGrid.tsx`、`quotes/page.tsx` 的 import 不需改
- 對既有功能的影響：純重構，零功能變更
- 變更等級：Level 3（架構）— 核心元件結構重組

## 矛盾偵測結果

- ✅ 與 `001-merged-payment-workbench` 無衝突
  - 工作台元件（PendingSection/ReviewSection/RejectedSection）不依賴 FlatView 或 ItemsList 內部結構
  - 工作台使用自己的 RPC 資料，與 quotes/v2 的資料流獨立
  - `QuotationItemsList` 的 merge_group_id 顯示邏輯（合併標記 badge）將保留在 `ItemsListRow` 中，行為不變

## 風險與替代方案

- **風險 1**：拆分後 props drilling 增加
  - 緩解：hooks 封裝大部分 state，子元件只接收必要 props
- **風險 2**：ItemsList 的 save 邏輯很複雜（180 行），提取後需確保原子性
  - 緩解：`useSaveItems` hook 完整封裝，不拆更小
- **替代方案**：只做 Phase 1（共用邏輯提取），跳過子元件拆分
  - 理由不採用：只消除重複但不改善可維護性
