# 開發進度追蹤

> 最後更新：2026-03-04
> 分支：`main`
> 詳細變更歷程請見 Git commit history（`git log --oneline`）

## 目前狀態

已合併至 main 的功能模組：

- ✅ **報價單系統** — 編號整合、試算表模式、搜尋擴展、駁回功能
- ✅ **請款管理** — 請款流程、追加模式、智慧預設支出種類
- ✅ **合併請款工作台**（v1.0 ~ v1.2）— 跨報價單合併請款、帳戶分組、行內編輯、RPC 一致性修復、撤回修復、KOL 名稱/附件顯示
- ✅ **被駁回分頁移除** — 獨立 RejectedSection 整合至 PendingSection 待處理區塊
- ✅ **進項/銷項管理** — 付款狀態自動標記、排序篩選、merge 指標修正
- ✅ **匯款總覽** — 批次設定匯款日期
- ✅ **儀表板** — 專案 Pipeline 導向重新設計 + 舊付款頁面封存
- ✅ **雇主勞健保** — 保險試算擴充、費率管理、薪資頁面更新
- ✅ **權限/RLS** — Member 內聯建立權限、cost_amount 自動計算、待簽約狀態納入工作台
- ✅ **資料完整性** — verify_data_integrity() RPC（9 項 invariant checks）
- ✅ **基礎設施** — Agent 協作系統（10 個 Agent）、3 個工作流、2 個專案級 Skill

開發中（遠端分支，尚未合併）：
- 🔧 `feature/comprehensive-review-optimization` — 全面程式碼審查與優化、安全修復、Accessibility 補強、大型元件拆分、單元測試（148 cases）

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
- [ ] E2E 測試基礎設施建立（Playwright config + 第一批關鍵業務流程測試）

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
