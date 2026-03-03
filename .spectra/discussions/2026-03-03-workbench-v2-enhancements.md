# 討論：請款工作台 v2 增強 — 上傳整合、分組重構、合併流程優化

日期：2026-03-03
狀態：進行中
關聯 spec：001-merged-payment-workbench（v1.0 已完成基礎功能）

## 背景

工作台 v1 已具備合併、送出、審核流程，但實際使用時發現三個核心體驗問題：
1. 缺少上傳功能 — 使用者還得回報價單上傳發票/附件，工作台變成「半成品」
2. 分組邏輯不直覺 — 用 `remittance_name` 分組，但這個欄位不一定有值，且不反映帳戶類型
3. 合併流程卡點 — 成本為 0 不能合併、合併後不能指定請款月份

## 關鍵問題

- [x] Q1: 工作台應包含哪些編輯/上傳功能？
- [x] Q2: 項目如何分組最符合匯款邏輯？
- [x] Q3: 合併流程需要哪些優化？

## 討論紀錄

### Q1: 工作台的編輯/上傳功能範圍

**現狀**：工作台只能「看」和「操作流程」（合併/送出/審核），發票號碼和附件必須在報價單 DataGrid 中編輯。

**選項 A**：工作台只做流程操作，編輯留在報價單
- 優點：改動最小、職責分明
- 缺點：使用者跳來跳去，體驗碎裂

**選項 B**：工作台行內支援「發票號碼 + 附件上傳」
- 優點：請款流程自給自足，不需離開頁面
- 缺點：需要整合 AttachmentUploader 到工作台 UI

**選項 C**：工作台完整編輯（含成本金額、費用類別、會計科目等所有欄位）
- 優點：完全自給自足
- 缺點：UI 過於複雜、與報價單 DataGrid 功能重疊

**結論**：選擇 **B**。工作台定位是「請款流程的終端」，使用者只需在這裡完成「上傳佐證 → 送出 → 等審核」的閉環。成本金額、費用類別等「資料面」編輯仍在報價單 DataGrid 中完成。

具體功能：
- 單筆項目行：點擊展開/行內顯示「發票號碼」輸入框 + 「上傳附件」按鈕
- 合併組主項：展開卡片後，主項可編輯發票號碼 + 上傳附件（非主項只讀，送出時自動繼承）
- 上傳複用既有 `AttachmentUploader`（`src/components/quotes/v2/AttachmentUploader.tsx`）
- 儲存路徑沿用 `quotation-items/{itemId}/`

---

### Q2: 項目分組邏輯

**現狀**：用 `item.remittance_name || item.kol_name || '未指定匯款對象'` 分組。問題是 `remittance_name` 可能為 null、可能與 KOL 銀行帳戶戶名不一致。

**KOL 銀行資訊結構**（來自 `kols.bank_info` JSONB）：
```typescript
interface KolBankInfo {
  bankType?: 'individual' | 'company'
  personalAccountName?: string   // 個人匯款戶名（勞報）
  companyAccountName?: string    // 公司匯款戶名（公司行號）
  bankName?: string
  branchName?: string
  accountNumber?: string
}
```

**選項 A**：維持 `remittance_name` 分組
- 優點：不需改後端
- 缺點：邏輯不直覺，空值多

**選項 B**：依 KOL 的 `bankType` 分兩大類，再依對應戶名分組
- 勞報類（`bankType = 'individual'`）→ 以 `personalAccountName` 分組
- 公司行號類（`bankType = 'company'`）→ 以 `companyAccountName` 分組
- 未填寫資料（`bankType` 為空或缺少對應戶名）→ 歸入「未填寫資料」提醒補齊
- 優點：完全對齊匯款邏輯，匯款總覽的分類方式一致
- 缺點：需要 RPC 回傳 `bankType` 欄位、前端重構分組邏輯

**選項 C**：用 `bankName + accountNumber` 分組（純帳戶維度）
- 優點：最精確（同一銀行帳號一定是同一收款對象）
- 缺點：使用者看到的是帳號而非人名/公司名，不直覺

**結論**：選擇 **B**。分三大區塊：

1. **勞報（個人戶）** — 標題用 `personalAccountName`，每個人名下列出其項目
2. **公司行號** — 標題用 `companyAccountName`，每家公司下列出其項目
3. **未填寫資料** — 所有 bankType 或對應戶名為空的項目，提供醒目提示「請先至 KOL 管理填寫銀行資訊」

這跟「已確認請款清單」（RemittanceGroupCard）的 `isCompanyAccount` 分流完全一致。

**RPC 調整**：`get_workbench_items()` 已回傳 `kol_bank_info`（JSONB），前端可直接 parse 出 `bankType` 和對應戶名，**不需改 RPC**。

---

### Q3: 合併流程優化

#### Q3-1: 成本為 0 可否合併？

**現狀**：`submit_merge_group` RPC 會驗證 `cost_amount IS NULL OR cost_amount <= 0` 時拋出錯誤，擋住了 0 成本項目。

**結論**：**放寬驗證**。成本為 0 是合法的業務場景（贈品、交換合作、免費曝光等）。只擋 `cost_amount IS NULL`（代表尚未填寫），不擋 `= 0`。

修改範圍：
- `submit_merge_group` RPC：`cost_amount IS NULL` → 報錯，`cost_amount = 0` → 允許
- `submit_single_item` RPC：同上
- 前端 PendingSection 的送出按鈕 disabled 條件：`!item.cost_amount && item.cost_amount !== 0` → 允許 0

#### Q3-2: 合併後指定請款月份

**現狀**：合併確認 dialog 只有「選主項 → 確認」。如果項目的 `expected_payment_month` 為空，最終在已確認請款清單中會歸入「未指定月份」。

**結論**：合併確認流程改為三步：

1. **選主項** — 現有功能
2. **選請款月份** — 新增步驟
   - 預設值：組內已填寫的月份（若一致則自動帶入）
   - 若組內月份不一致或全部為空 → 必須手動選擇
   - 月份格式：`YYYY-MM`（與現有 `expected_payment_month` 一致）
3. **確認** — 建立合併組

建立合併組時，將選定的月份寫入所有成員項的 `expected_payment_month`（如果原本為空或使用者選擇覆蓋）。

**RPC 調整**：`create_quotation_merge_group` 新增可選參數 `p_payment_month TEXT DEFAULT NULL`，若不為空則更新組內所有項目的 `expected_payment_month`。

---

## 收斂結論

1. **上傳功能**：工作台的每個項目行/合併組卡片支援行內編輯發票號碼 + 上傳附件，複用既有 `AttachmentUploader`
2. **分組邏輯**：依 `bankType` 分三區塊（勞報 / 公司行號 / 未填寫資料），以對應戶名作為分組標題，前端 parse `kol_bank_info` 即可，不需改 RPC 回傳
3. **合併優化**：
   - 成本 0 允許合併/送出（只擋 NULL）
   - 合併 dialog 新增「選請款月份」步驟
   - RPC `create_quotation_merge_group` 新增 `p_payment_month` 可選參數

## 下一步

→ 建議執行 `/spectra ingest` 更新既有 spec（001-merged-payment-workbench v1.0 → v1.1），產出 delta 任務清單
