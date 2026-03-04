# Proposal: Zod 3→4 升級

spec-id: 004-zod-upgrade
日期：2026-03-05
狀態：draft
來源討論：.spectra/discussions/2026-03-05-reverse-sync-and-zod-upgrade.md

## 問題描述

目前使用 Zod `^3.22.4`，已不是最新大版本。Zod 4 帶來 14x 字串解析、7x 陣列解析效能提升，以及未來生態系相容性（Claude Agent SDK 0.2.x 等）。趁技術債清理階段一起升級。

## 提案方案

直接升級 `zod@^4` + `@hookform/resolvers` 到相容版本，逐一修復受影響的程式碼和測試。

## 影響範圍

- 影響的模組：型別定義、表單驗證、JSONB 解析
- 影響的檔案（6 個）：
  - `src/types/schemas.ts` — 6 個 schema + 8 個輔助函數
  - `src/components/quotes/form/types.ts` — quoteSchema
  - `src/components/clients/ClientModal.tsx` — clientSchema + zodResolver
  - `src/components/expense-claims/ExpenseClaimModal.tsx` — z.coerce
  - `src/components/quotes/QuoteForm.tsx` — zodResolver
  - `src/types/__tests__/schemas.test.ts` — 51 個測試
- 對既有功能的影響：`.default()` 行為改變（預設值現在會在 optional 屬性中生效）
- 變更等級：Level 2（跨模組但不涉及 DB/API 契約變更）

## 矛盾偵測結果

- ✅ 與 001-merged-payment-workbench 無衝突
- ✅ 與 002-large-component-split 無衝突
- ✅ 與 003-tax-reform 無衝突（tax-utils.ts 不使用 Zod）

## 風險與替代方案

- 風險 1：`.default()` 行為改變導致 socialLinksSchema / sealStampConfigSchema 解析結果不同
  → 對策：更新 safeParse fallback 邏輯和測試期望值
- 風險 2：`@hookform/resolvers` 版本不相容
  → 對策：`@hookform/resolvers@^3.3.2` 已支援 Zod 4，必要時升級到 v4
- 風險 3：`z.string().email()` deprecated
  → 對策：暫時保留（仍可用），不在此次升級範圍內遷移
- 替代方案：延後升級 → 已決定不採用
