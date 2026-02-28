# 開發進度追蹤

> 最後更新：2026-03-01
> 分支：`feature/payment-flow-simplification`
> 詳細變更歷程請見 Git commit history

## 目前狀態

- `npx tsc --noEmit` 通過，零型別錯誤
- **✅ 匯款總覽精簡化**：移除代扣 checkbox UI，只保留匯費設定；代扣改為唯讀自動顯示
- **✅ 代扣即時計算**：hasTax/hasInsurance 依門檻自動判斷，不依賴 DB 過期值
- **✅ 勞報標籤**：個人帳戶（bankType=individual）顯示「勞報」標籤，與公司戶/免扣區分
- **✅ 進項管理代扣同步**：DB 加入 withholding_tax/withholding_nhi 欄位，RPC 自動分配
- **✅ 銷項管理日期清空修復**：Modal 日期欄位清空時送 null 而非空字串，避免 400 錯誤
- ✅ 月結總覽重構、付款狀態自動同步、帳務期間 10 日切點
- ✅ 已確認請款顯示薪資、單筆退回功能、匯款設定跨 Tab 同步
- ✅ 表格排序/篩選系統、月結收入 Tab、銀行餘額核對、帳務權限修復
- ✅ 合併請款群組進群出、全專案權限修復、v2.5 帳務進階、架構優化 6 階段

## 待辦事項

### 優先
- [ ] 手動測試匯款總覽：確認代扣唯讀顯示 + 匯費勾選 → 進項管理同步
- [ ] 手動測試代扣代繳 Tab：確認從 remittance_settings 讀取正確
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）

### 部署
- [ ] 合併 `feature/payment-flow-simplification` 至 `main`
- [ ] 部署至正式環境

### 功能擴充
- [ ] 銷項管理反向同步（修改金額同步回報價單）— 目前為單向流
- [ ] 儀表板依角色顯示不同內容
- [ ] 擴充測試覆蓋率（增加 hook 整合測試）
