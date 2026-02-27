# 開發進度追蹤

> 最後更新：2026-02-27
> 分支：`feature/phase1-security-hardening`
> 詳細變更歷程請見 Git commit history

## 目前狀態

- `npm run build` 通過，零型別錯誤（31 頁面）
- `npm test` 通過，90/90 測試
- **✅ 表格排序/篩選系統完成**：useTableSort + SortableHeader + useColumnFilters + ColumnFilterPopover
  - SpreadsheetEditor：排序 + inline 篩選（篩選中禁用新增/貼上）
  - 專案/KOL/廠商/員工/報價單頁面全面排序
- **✅ 月結總覽擴充**：收入 Tab + 當月收入 KPI + 銀行餘額核對功能（公式流 UI）
  - 銀行核對：上月存款餘額 + 收入 - 支出 = 預期餘額 vs 本月實際餘額，差異 = 0 即帳款正確
  - 核對區塊位於 KPI 下方、Tab 上方（不被長表格擠到底部）
- **✅ 進項管理表格檢視隱藏「金額（未稅）」欄位**
- **✅ 帳務管理權限修復**：Editor 可存取所有帳務頁面（DB page_permissions + 前端 10 頁面）
  - insurance_rate_tables RLS 修復（棄用 user_roles → is_admin()）
  - audit_log SELECT 政策修復（小寫 admin → is_admin()）
  - 帳務表 DELETE 增加 Admin/Editor 全權
  - Playwright E2E 驗證 10/10 頁面通過
- 合併請款群組進群出已完成：leader 代表審核 + 下游視覺標記 + RPC 修復
- 全專案權限修復已完成（RLS 5 大類 + 前端 4 處守衛）
- v2.5 帳務進階完成（代扣代繳 + 月結總覽 + 三分頁重構）
- 架構優化 6 階段完成（env、CRUD Factory、分頁、元件拆分、錯誤邊界、測試）

## 待辦事項

### 優先
- [ ] 手動測試合併審核功能：leader 核准/駁回 → 全組連動、批量操作
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）
- [ ] 快取行為驗證（跨頁失效）

### 部署
- [ ] 建立 PR 合併至 `main`
- [ ] 部署至正式環境
- [ ] 確認所有 migration 已套用

### 功能擴充
- [ ] 儀表板依角色顯示不同內容
- [ ] 擴充測試覆蓋率（增加 hook 整合測試）
