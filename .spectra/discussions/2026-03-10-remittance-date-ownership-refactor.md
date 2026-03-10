# 討論：匯款日期管理權責重設計
日期：2026-03-10
狀態：已收斂

## 背景

目前系統中「匯款日期」有 5 個填寫入口點，且同時存在兩個月份概念
（`expected_payment_month` 由請款人填、實際 `payment_date` 由確認清單補），
導致已確認請款清單的月份顯示不同步，並衍生出反覆難以根治的 bug。

## 關鍵問題

- [x] Q1：誰應該決定匯款日期？
- [x] Q2：expense_month 的計算邏輯應如何調整？
- [x] Q3：已確認清單的「統一設定匯款日」功能去留？
- [x] Q4：合併請款時如何處理匯款日期？

## 討論紀錄

### Q1：誰應該決定匯款日期？

**現況**：請款人在送出時填 `expected_payment_month`，審核後在確認清單補填 `payment_date`。

**選項 A（維持現狀）**：請款人填預計月份 → 審核人事後在確認清單補填
→ 缺點：兩階段填寫，同步困難，月份概念重疊

**選項 B（採用）**：審核人在工作台核准時彈出 Modal 填入匯款日期
→ 優點：財務審核人才知道確切匯款時間；一次填入，建立 confirmation items 時即帶入 payment_date；消除後續同步問題

**結論**：選 B。請款人只需備妥完整請款資料，匯款日期由審核人核准時決定。

### Q2：expense_month 計算邏輯？

**現況**：有「10日切點」邏輯（getBillingMonthKey），3月9日可能歸入2月帳。
此邏輯是為因應請款人預估月份不準確而設計的補償機制。

**選項 A（現況）**：保留 10日切點邏輯
**選項 B（採用）**：匯款日期既然由審核人決定，直接取 payment_date 的自然月份

**結論**：選 B。審核人決定的日期即為準確帳務日，不需切點補償。
`expense_month = format(payment_date, "yyyy年M月")`

### Q3：已確認清單「統一設定匯款日」功能？

**現況**：RemittanceGroupCard 有群組級統一設定匯款日，是目前的主要填入入口。

**結論**：降級為「事後微調」功能，不移除。日期主要從審核帶入，
UI 標示改為「如有調整可於此修改」。

### Q4：合併請款時匯款日期處理？

**結論**：合併審核時，Modal 中填入一個日期，同步寫入所有
merge_group 成員的 payment_confirmation_items.payment_date。

## 收斂結論

1. **審核入口**：工作台「審核中 Tab」核准時彈出確認 Modal，含匯款日期輸入欄位
2. **合併同步**：合併組核准時，所有成員共享同一匯款日期
3. **建立時帶入**：建立 payment_confirmation_items 時直接寫入 payment_date，不再事後補填
4. **expense_month 派生**：自 payment_date 自然月份計算，移除 10日切點邏輯
5. **統一設定降級**：已確認清單的群組級日期設定改為事後微調用途
6. **accounting_expenses 同步**：expense_month 和 payment_date 均從 payment_confirmation_items 來源同步

## 下一步

→ 執行 `/spectra propose` 產出正式規格（spec-id: 008）
