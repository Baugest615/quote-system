# Proposal: 營業稅計算改革

spec-id: 003-tax-reform
日期：2026-03-05
狀態：approved
來源討論：.spectra/discussions/2026-03-05-tax-reform.md

## 問題描述

目前系統的成本欄位（`cost`）沒有區分含稅/未稅。ej@ 已輸入的公司行號成本是含稅金額，但業務上希望統一以未稅為基準儲存。請款時公司行號需自動加算 5% 營業稅，個人則不加稅。

## 提案方案

1. **DB 儲存規則**：`quotation_items.cost` 統一存未稅金額
2. **請款計算**：送出請款時，`cost_amount = bankType === 'company' ? Math.round(cost * 1.05) : cost`
3. **資料遷移**：反算 ej@（574bc155）的 17 筆公司行號 cost：`cost = Math.round(cost / 1.05)`
4. **UI 標示**：成本輸入欄加「（未稅）」、請款金額顯示加「（含稅）」

## 影響範圍

- 影響的模組：報價單明細、待請款、請款工作台、已確認請款
- 影響的檔案（預估）：12 個
- 對既有功能的影響：請款金額計算方式變更、部分欄位標示調整
- 變更等級：Level 3（涉及 DB 資料修正 + 成本計算核心邏輯 + 跨模組 UI）

## 矛盾偵測結果

- ✅ 與 active/001-merged-payment-workbench 無衝突
  - 001 的 FR-17 依 bankType 分組，本 spec 也依 bankType 判斷稅率，邏輯一致
  - 001 的 cost_amount 語意（實際請款金額）與本 spec 一致
- ✅ 與 active/002-large-component-split 無衝突
  - 002 是結構重構，不影響計算邏輯
  - 本 spec 修改的位置在重構後的組裝層和 hooks 中

## 風險與替代方案

| 風險 | 影響 | 緩解 |
|------|------|------|
| 四捨五入誤差 | 7 筆不整除，最大 ±0.50 元 | 已確認可接受 |
| 已備份的資料復原 | 若反算錯誤需復原 | 已備份 quotation_items + payment_requests |
| 前端顯示不一致 | 舊頁面可能遺漏標示 | 全面盤點所有顯示成本的位置 |
