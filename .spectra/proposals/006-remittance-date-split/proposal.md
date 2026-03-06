# Proposal: 匯款日期分日架構 — 審核填入 + 確認清單分組 + 進項同步
spec-id: 006-remittance-date-split
日期：2026-03-07
狀態：approved
來源討論：.spectra/discussions/2026-03-07-remittance-date-architecture.md

## 問題描述

1. **已確認請款清單以月份合併**：同一匯款對象在同月有不同天匯款時，金額被統整在一起，財務人員無法直接看出每次匯款金額
2. **匯款日填入太晚**：目前在「已確認請款清單」才填入匯款日，審核通過後需要額外步驟，容易遺漏
3. **合併請款的日期問題**：同一匯款對象的多筆請款可能有不同付款期限，但目前無法區分

## 提案方案

### 核心設計：分層 groupKey

建立在 Spec-005 的 groupKey 基礎上，新增 paymentDate 維度：

```
Layer 1: groupKey（帳號級，005 已定義）
  acct_{accountNumber} | kol_{kol_id} | personal_{userId} | vendor_{name}

Layer 2: paymentDate（時間維度，本 spec 新增）
  最終分組 key = groupKey + "_" + paymentDate（有日期時）
  最終分組 key = groupKey（無日期時，維持現行行為）
```

### 三個變更點

1. **DB**：`payment_requests` 新增 `payment_date` 欄位
2. **工作台 UI**：審核通過時可填入匯款日期
3. **確認清單 aggregation**：groupKey 加入 paymentDate 維度，不同日期分開顯示

## 影響範圍

- 影響的模組：DB schema、請款工作台、已確認請款清單、aggregation 邏輯
- 影響的檔案（預估）：6-8 個
- 對既有功能的影響：確認清單分組會更細（原本 1 組可能變 2-3 組）
- 變更等級：Level 3（跨 DB + 多模組）

## 矛盾偵測結果

- ✅ 與 002-large-component-split 無衝突
- ✅ 與 003-tax-reform 無衝突
- ✅ 與 004-zod-upgrade 無衝突
- ⚠️ 與 001-merged-payment-workbench：ReviewSection 已被 001 改過分組邏輯（bankType 維度），本 spec 新增日期選擇器需與既有 UI 整合，不衝突但需注意
- 🔴 與 005-remittance-grouping-refactor：005 已定義 groupKey = 帳號優先。**解決方案**：本 spec 在 005 的 groupKey 基礎上加第二層 paymentDate 維度，不修改 005 的 groupKey 定義，而是在 aggregation 階段做 sub-grouping

## 風險與替代方案

| 風險 | 影響 | 緩解 |
|------|------|------|
| 分組過細導致清單過長 | 同一人可能出現 3-4 次 | UI 加摺疊/按匯款對象分組視圖 |
| 審核者不知道匯款日 | 填空值 → 落回原行為 | 日期欄位可選，不填則確認清單端再填 |
| remittance_settings key 格式改變 | 舊資料不相容 | 向後相容：無日期的 key 維持原格式 |
