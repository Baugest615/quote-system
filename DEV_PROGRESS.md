# 開發進度追蹤

> 最後更新：2026-03-01
> 分支：`main`（已合併 `feature/payment-flow-simplification`）
> 詳細變更歷程請見 Git commit history

## 回滾資訊

合併前已建立備份 tag，如需回滾：
- `backup/main-before-payment-flow` — 合併前的 main（commit `3758277`）
- `backup/payment-flow-complete` — feature 分支完整狀態
- 回滾指令：`git reset --hard backup/main-before-payment-flow && git push --force-with-lease`

## 目前狀態

已合併至 main 的功能（16 commits, 111 files）：
- ✅ 報價單請款管理（檢核/請款/審核欄位、附件上傳、已確認清單退回修正）
- ✅ 報價單追加模式（已簽約報價單追加項目、原始項目鎖定、銷項同步）
- ✅ 進項管理（代扣代繳欄位 + RPC 同步、刪除限制、編輯 400 修復）
- ✅ 匯款總覽升級（匯費設定、駁回功能、代扣唯讀顯示、進項即時連動）
- ✅ 雇主勞健保設定（保險參數管理、就業保險費率獨立、雇主眷屬口數）
- ✅ 人事薪資整合至匯款分組、個人請款頁面重設計（手風琴分組）
- ✅ DB migrations 合併為單一 baseline（83 → 1）
- ✅ `npx tsc --noEmit` 通過，零型別錯誤

## 待辦事項

### 優先
- [ ] 手動測試追加模式：已簽約報價單展開 → 追加項目 → 儲存 → 確認銷項同步
- [ ] 手動測試匯款總覽：確認代扣唯讀顯示 + 匯費勾選 → 進項管理同步
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）
- [ ] 部署至正式環境

### 功能擴充
- [ ] 銷項管理反向同步（修改金額同步回報價單）— 目前為單向流
- [ ] 儀表板依角色顯示不同內容
- [ ] 擴充測試覆蓋率（增加 hook 整合測試）
