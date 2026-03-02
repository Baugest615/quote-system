# 開發進度追蹤

> 最後更新：2026-03-02
> 分支：`feat/dashboard-optimization`（開發中）
> 詳細變更歷程請見 Git commit history

## 回滾資訊

合併前已建立備份 tag，如需回滾：
- `backup/pre-kol-inline-create` — 合併前的 main
- `backup/main-before-payment-flow` — 更早的備份點
- 回滾指令：`git reset --hard backup/pre-kol-inline-create && git push --force-with-lease`

## 目前狀態

已合併至 main 的功能：
- ✅ 報價單編號全站整合（合併式選擇器 + 列表 quote_number 前綴）
- ✅ 報價單試算表模式（流水號、攤平檢視、操作欄、欄位管理）
- ✅ 報價單搜尋擴展（KOL 名稱 + 執行內容搜尋 + 欄位篩選）
- ✅ 報價單請款項目駁回功能（RPC + 駁回按鈕 + 原因 Modal）
- ✅ 雇主勞健保設定（保險試算擴充、費率管理、薪資頁面更新）
- ✅ 報價單請款管理、追加模式、進項管理、匯款總覽升級
- ✅ DB migrations：expense_claims 新增 quotation_id FK
- ✅ 請款智慧預設支出種類（依 KOL 銀行帳戶類型：無KOL→專案費用、公司戶→外包服務、個人戶→勞務報酬）
- ✅ 進項管理付款狀態自動標記（填入匯款日→自動已付、清空→自動未付）
- ✅ 進項/銷項管理表格標題排序與篩選（SortableHeader + ColumnFilterPopover）
- ✅ 匯款總覽批次設定匯款日期（RPC 擴充 + 薪資/進項/個人報帳三路徑同步）
- ✅ `npx tsc --noEmit` 通過，零型別錯誤
- ✅ 儀表板重新設計：專案 Pipeline 導向 + 舊付款頁面封存（`feat/dashboard-optimization`）
- ✅ 待辦事項修正：報價待簽約 / 專案請款待審核 / 個人報帳待審核
- ✅ Claude Agent SDK 0.1.77 安裝完成，agents 框架可正常使用

## 待辦事項

### 優先
- [ ] 手動驗證儀表板新版佈局（KPI / Pipeline / 趨勢圖 / 時間軸 / 待辦事項）
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）
- [ ] 部署至正式環境

### 功能擴充
- [ ] 銷項管理反向同步（修改金額同步回報價單）— 目前為單向流
- [ ] 清理 useProjectNames hook（已被 useQuotationOptions 取代）

### 技術債
- [ ] Claude Agent SDK 升級 0.1.77 → 0.2.x（需同步升級 zod 3.x → 4.x，影響 5 個表單驗證元件）
- [ ] `@hookform/resolvers/zod` 需配合 zod 4 升級
