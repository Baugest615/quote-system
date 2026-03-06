# Design: 匯款日期逐筆管理
spec-id: 007-payment-date-per-item

## 架構決策

### 決策 1: payment_date 存放位置
- 選擇：`payment_confirmation_items.payment_date`
- 原因：每筆確認項目直接帶日期，與來源無關（quotation_items / expense_claims / payment_requests 三種來源皆可）
- 替代方案：
  - `payment_requests.payment_date`（Spec-006）— 拒絕：工作台核准路徑無 payment_requests 記錄
  - `accounting_expenses.payment_date`（已有）— 拒絕：沖帳免付項目不建立 accounting_expenses

### 決策 2: 核准時不再填日期
- 選擇：移除工作台的日期選擇器
- 原因：核准 ≠ 決定匯款日。已確認清單才是「決定何時匯多少錢」的地方
- 替代方案：兩邊都可填 — 拒絕：增加複雜度，兩邊資料可能不一致

### 決策 3: 群組日期改為「統一設定」
- 選擇：保留群組層級的日期選擇器，但語意改為「批次設定群組內所有項目」
- 原因：大部分情況同一匯款對象同日匯款，統一設定效率高；少數例外可逐筆覆蓋
- 替代方案：純逐筆日期 — 拒絕：10 筆同人要填 10 次太麻煩

### 決策 4: 不再按日期拆分群組
- 選擇：移除 Spec-006 的 groupKey 日期維度
- 原因：每筆項目自帶日期後，不需要用群組拆分來區分日期。同一匯款對象維持一張卡片更直覺
- 替代方案：保留日期分組 — 拒絕：與逐筆日期功能重疊且增加複雜度

### 決策 5: 同步策略
- 選擇：前端更新 confirmation_items.payment_date 後，接著 UPDATE 對應的 accounting_expenses.payment_date
- 原因：簡單直接，不需新 RPC。accounting_expenses 已有 trigger 自動設定 payment_status
- 替代方案：用 DB trigger 自動同步 — 拒絕：payment_confirmation_items 和 accounting_expenses 之間沒有直接 FK，trigger 匹配邏輯複雜

## 資料流

```
已確認請款清單（UI）
  │
  ├── 逐筆修改日期
  │     │
  │     ├── UPDATE payment_confirmation_items SET payment_date = ?
  │     │     WHERE id = itemId
  │     │
  │     └── UPDATE accounting_expenses SET payment_date = ?
  │           WHERE quotation_item_id = ? / expense_claim_id = ? / payment_request_id = ?
  │           (DB trigger 自動設定 payment_status = 'paid')
  │
  └── 群組「統一設定」
        │
        └── 對群組內每筆 item 執行上述逐筆更新
```

## 元件結構

```
PaymentOverviewTab
  └── RemittanceGroupCard (per group)
        ├── 群組標題 + 統一設定日期
        └── <table>
              └── PaymentRecordRow (per item)
                    └── 匯款日 <input type="date"> (新增)
```

## 與 Spec-006 的差異

| 面向 | Spec-006 | Spec-007（本 spec） |
|------|----------|---------------------|
| 日期存放 | payment_requests.payment_date | payment_confirmation_items.payment_date |
| 設定時機 | 核准時填入 | 確認清單中填入 |
| 管理粒度 | 群組層級 | 逐筆 + 群組快捷 |
| 群組拆分 | 按日期拆分不同群組 | 不拆分，同人一張卡 |
| 複雜度 | 高（groupKey 日期維度 + 跨表同步） | 低（直接欄位 + 簡單 UPDATE） |
