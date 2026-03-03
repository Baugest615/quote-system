# 開發進度追蹤

> 最後更新：2026-03-03
> 分支：`feat/merged-payment-requests`（開發中）
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
- ✅ 請款智慧預設支出種類（依 KOL 銀行帳戶類型）
- ✅ 進項管理付款狀態自動標記
- ✅ 進項/銷項管理表格標題排序與篩選
- ✅ 匯款總覽批次設定匯款日期
- ✅ 儀表板重新設計：專案 Pipeline 導向 + 舊付款頁面封存
- ✅ 待辦事項修正：報價待簽約 / 專案請款待審核 / 個人報帳待審核

開發中（feat/merged-payment-requests）：
- ✅ 合併請款工作台（SDD spec: 001-merged-payment-workbench）
  - DB：9 個 RPC（get_workbench_items、create/dissolve merge group、submit/withdraw、approve/reject）已部署
  - UI：PendingSection（勾選合併 + 送出）、ReviewSection（審核/駁回）、RejectedSection（重送/拆分）
  - 整合：QuotationItemsList 移除舊請款按鈕改為狀態顯示 + 合併標記、expense-claims 引導至工作台
  - `npx tsc --noEmit` 通過，零型別錯誤

## 待辦事項

### 優先
- [ ] 手動驗證請款工作台完整流程（合併→送出→審核→核准/駁回→重送）
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）
- [ ] 部署至正式環境

### 功能擴充
- [ ] 銷項管理反向同步（修改金額同步回報價單）— 目前為單向流
- [ ] 清理 useProjectNames hook（已被 useQuotationOptions 取代）

### 技術債
- [ ] Claude Agent SDK 升級 0.1.77 → 0.2.x（需同步升級 zod 3.x → 4.x，影響 5 個表單驗證元件）
- [ ] `@hookform/resolvers/zod` 需配合 zod 4 升級

### 安全稽核發現（2026-03-02）

**Critical**
- [ ] PDF HTML sanitization 使用 regex blacklist，應改用 `sanitize-html` whitelist 模式（`src/app/api/pdf/generate/route.ts`）
- [x] `.env.local` URL 曝露 — 已在 `.gitignore`，無需額外處理

**Warning**
- [ ] `projects` 全量查詢缺少 `.limit()`（`src/hooks/dashboard/useDashboardDataV2.ts`）
- [ ] Middleware + invite-member API 直接查 `profiles` 取 role，應改用 `get_my_role()` RPC
- [ ] 部分 API 路徑被 middleware 跳過（`/api/pdf/generate` 等已有自行驗證，但模式不統一）
- [ ] PDF filename 未驗證（可能含路徑穿越字元）
- [ ] console.log 洩漏業務資訊：
  - ~~`src/app/api/pdf/generate/route.ts` L124 — server-side 記錄 HTML preview 含客戶/金額~~ ✅ 已移除
  - `src/components/quotes/FileModal.tsx` — 約 16 處 log 暴露檔案路徑與 DB payload
  - `src/components/pending-payments/PendingPaymentFileModal.tsx` — 約 15 處 log 暴露檔案路徑
