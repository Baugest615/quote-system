# Proposal: 匯款分組（Remittance Grouping）完整重構

spec-id: 005-remittance-grouping-refactor
日期：2026-03-06
狀態：approved
來源討論：.spectra/discussions/2026-03-06-remittance-grouping-refactor.md

## 問題描述

匯款分組邏輯是請款系統的核心，負責將已確認的請款項目按收款人歸戶，計算代扣代繳與匯費。
過去兩週內已反覆修復 **至少 7 次**，每次都是補丁式修復，根因是結構性問題：

1. **分組 key 不穩定**：remittanceName 從 bank_info 動態推導，同帳號可能產生不同名稱
2. **兩套分組邏輯各自維護**：工作台 `groupByRemittee()` 和確認清單 `groupItemsByRemittance()` 推導邏輯不同步
3. **三種 source_type 各自處理**：personal / quotation / project 各有 20-30 行分支，新增/修改時需改三處
4. **remittance_settings 跨確認清單汙染**：確認 A 的設定影響確認 B 的項目
5. **代扣門檻 bug**：savedSetting 不尊重法定門檻（已短期修復，但設計有缺陷）

## 提案方案

### Phase 1（本次執行）

1. **統一分組 key**：帳號為主、kol_id 為輔、名稱為末
2. **抽取共用推導函數** `deriveRemitteeInfo()`：工作台和確認清單共用
3. **normalize + group 兩階段**：三種 source_type 先統一 normalize，再用單一分組邏輯
4. **修復 settings 讀取**：只從同一確認清單讀取 settings，key 改用 groupKey（帳號優先）
5. **代扣門檻保護**：維持現有二態 + 門檻檢查

### Phase 2（未來視需求）

- 引入 `remittee` 實體（收款方獨立 ID）
- `monthly_remittance_settings` 獨立表
- 三態 toggle（auto / override-true / override-false）

## 影響範圍

- 影響的模組：payments（確認清單）、payment-workbench（工作台）
- 影響的檔案（預估）：
  - `src/lib/payments/grouping.ts`（核心重構）
  - `src/lib/payments/aggregation.ts`（settings 讀取修正）
  - `src/lib/payments/types.ts`（新增共用型別）
  - `src/hooks/payment-workbench/grouping.ts`（改用共用推導函數）
  - `src/hooks/payment-workbench/types.ts`（可能調整）
  - `src/lib/payments/__tests__/grouping.test.ts`（新增/更新測試）
  - `src/lib/payments/__tests__/aggregation.test.ts`（更新測試）
- 對既有功能的影響：匯款總覽、代扣代繳 tab、工作台分組顯示
- 變更等級：Level 3（架構）— 跨模組核心資料流

## 矛盾偵測結果

- 與 001-merged-payment-workbench：**無衝突** — 工作台改用共用推導函數，不改工作台分組容器
- 與 002-large-component-split：**無衝突** — 元件拆分不涉及分組邏輯
- 與 003-tax-reform：**潛在關聯** — 代扣計算邏輯在本 spec 有修改，未來 tax-reform 需基於本 spec 的新結構
- 與 004-zod-upgrade：**無衝突** — schema 驗證與分組邏輯無直接依賴

## 風險與替代方案

- **風險 1**：重構後匯款總覽金額與舊版不一致 → 用真實 DB 資料跑模擬腳本驗證
- **風險 2**：settings key 從名稱改帳號，既有 settings 資料無法自動遷移 → 寫 migration 轉換 key
- **替代方案**：不做重構，繼續補丁 → 每次新增 source_type 或修改分組邏輯都可能再出 bug
