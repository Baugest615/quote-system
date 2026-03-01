# 開發進度追蹤

> 最後更新：2026-03-01
> 分支：`main`（已合併 `feature/kol-inline-create`）
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
- ✅ `npx tsc --noEmit` 通過，零型別錯誤

## 待辦事項

### 優先
- [ ] 手動驗證報價編號整合：各表單選擇器 + 列表顯示 + 試算表 autocomplete
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）
- [ ] 部署至正式環境

### 功能擴充
- [ ] 銷項管理反向同步（修改金額同步回報價單）— 目前為單向流
- [ ] 儀表板依角色顯示不同內容
- [ ] 清理 useProjectNames hook（已被 useQuotationOptions 取代）
