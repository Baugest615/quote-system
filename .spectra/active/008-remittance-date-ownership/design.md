# Design: 匯款日期管理權責重設計
spec-id: 008-remittance-date-ownership

## 架構決策

### 決策 1：審核 Modal 而非 Inline 日期選擇器
- **選擇**：點擊核准後彈出 Modal，在 Modal 中填日期後確認
- **原因**：
  - 核准是高意義操作，彈 Modal 可讓審核人明確確認對象和日期
  - 合併組和單筆共用同一個 Modal，介面一致
  - 避免行內日期選擇器佔用 ReviewSection 空間
- **替代方案**：Inline 日期選擇器 → 被棄，因為合併組的批次語意不直觀

### 決策 2：expense_month 完全派生，不允許手動覆寫
- **選擇**：`expense_month = format(payment_date, "yyyy年M月")`，在同步 payment_date 時自動計算
- **原因**：審核人決定的日期即為帳務依據，不應有兩個月份需要分別維護
- **替代方案**：保留手動覆寫 → 被棄，因為這正是月份不同步問題的根源

### 決策 3：向後相容策略（既有資料不 retroactive 更新）
- **選擇**：只對新流程產生的 confirmation_items 套用新邏輯
- **原因**：修改歷史帳務資料風險高，且業務上沒有需求回溯修正

## 資料流

### 舊流程（問題所在）
```
請款人填 expected_payment_month (月份) → 送出
     ↓
審核人核准（不填日期）
     ↓
在已確認清單補填匯款日期（兩個不同月份概念共存）
     ↓
expense_month 用 10日切點計算（可能與 expected_payment_month 不同步）
```

### 新流程（008 目標）
```
請款人只填請款資料（成本、發票等） → 送出
     ↓
審核人開啟核准 Modal，填入匯款日期 → 確認
     ↓
payment_confirmation_items.payment_date 建立時直接帶入
expense_month = format(payment_date, "yyyy年M月")  ← 自動派生，無歧義
     ↓
已確認清單：日期已填入，「統一設定」僅作事後調整用
```

## 元件結構

### 新增/修改元件

```
ReviewSection.tsx
  ├─ [新增] ApproveModal (inline component 或獨立元件)
  │   ├─ 顯示：匯款對象戶名 + 金額
  │   ├─ 輸入：<input type="date"> (必填)
  │   └─ 按鈕：確認核准 / 取消
  └─ [修改] 核准按鈕 → 改為觸發 Modal

useWorkbenchReview.ts
  └─ [修改] approveMergeGroup(groupId, paymentDate)
            approveSingleItem(itemId, paymentDate)

aggregation.ts
  └─ [修改] getBillingMonthKey → 移除 10日切點
           [新增] getExpenseMonthFromPaymentDate(date: string): string

confirmed-payments/page.tsx
  └─ [修改] handleItemPaymentDateChange → 同步寫 expense_month

RemittanceGroupCard.tsx
  └─ [修改] UI label 與說明文字（功能邏輯不變）
```

## 依賴關係

```
008 依賴 → 007 的 payment_confirmation_items.payment_date 欄位（已存在）
008 修改 → useWorkbenchReview 的 approve 函數簽名
008 修改 → aggregation.ts 的月份計算邏輯（影響 accounting 模組的顯示）
008 不影響 → WithholdingTab（代扣代繳計算邏輯）
008 不影響 → 薪資相關邏輯
008 不影響 → 合併/送出流程（PendingSection, useWorkbenchMerge）
```

## 待 apply 時確認事項

1. **確認 approveMergeGroup / approveSingleItem 的資料流**：
   - 是否直接建立 payment_confirmation_items？
   - 或只更新 quotation_items 狀態（confirmation 另行建立）？
   - 決定後選路徑 A 或路徑 B（見 spec.md 技術規格）

2. **確認 accounting_expenses.expense_month 的寫入時機**：
   - 審核/建立 confirmation 時寫入？
   - 或在前端 handleItemPaymentDateChange 同步？
