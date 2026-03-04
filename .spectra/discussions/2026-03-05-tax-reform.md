# 討論：營業稅計算改革

日期：2026-03-05
狀態：已收斂

## 背景

目前系統的成本欄位（`cost`）沒有區分含稅/未稅。ej@ananent.com 已輸入的公司行號成本是**含稅**金額，但未來希望統一以**未稅**為基準儲存，請款時再依 KOL 的 `bankType`（company/individual）自動加算 5% 營業稅。

### 現狀數據
- 總請款筆數：47 筆
- 公司行號：25 筆（成本 1,380,050）
- 個人：17 筆（成本 224,000）
- ej@ 的公司行號有成本項目：17 筆（需反算除稅）
- 已核准項目：1 筆（個人，不受影響）

## 關鍵問題

- [x] Q1: `cost` 和 `cost_amount` 的角色定義與計算公式
- [x] Q2: 已核准/已確認的請款項目是否也要反算
- [x] Q3: 四捨五入策略
- [x] Q4: UI 標示方式
- [x] Q5: 資料修正的範圍與方式
- [x] Q6: payment_requests 表的 cost_amount 是否也要改

## 討論紀錄

### Q1: `cost` 和 `cost_amount` 的角色定義

**現狀**：
- `cost`：報價單上的單價成本（使用者手動輸入）
- `cost_amount`：請款金額（送請款時從 cost 複製，或在待請款頁手動修改）
- `quantity`：不參與成本計算
- 無其他計算條件

**結論：選擇 A — cost 存未稅，cost_amount 存含稅（實際請款金額）**
```
cost = 使用者輸入的未稅成本
cost_amount = bankType === 'company' ? Math.round(cost × 1.05) : cost
```

### Q2: 已核准項目處理

**現狀**：只有 1 筆已核准項目（可可妮，個人，by franky@），不是公司行號。

**結論：不需要特殊處理**，已核准項目不受影響。

### Q3: 四捨五入策略

**驗證結果**：ej@ 17 筆公司行號有成本的項目中，7 筆除以 1.05 不整除。

**結論：使用 Math.round 四捨五入到整數**，最大誤差 ±0.50 元。

### Q4: UI 標示方式

**結論：選擇 A — 欄位名稱直接加標示**
- 成本輸入欄：「成本（未稅）」
- 請款金額顯示：「請款金額（含稅）」

### Q5: 資料修正範圍

**結論：只有 ej@ 的公司行號需要反算**
- portia@ 和 franky@ 的成本已經是未稅
- ej@ 的 17 筆有成本的公司行號項目需要 `cost = Math.round(cost / 1.05)`
- quotation_items.cost_amount 也需反算（未核准的）

### Q6: payment_requests 表

**結論：不改**
- payment_requests.cost_amount 存的是實際請款金額（含稅），語意正確

## 收斂結論

1. **DB 儲存規則**：`cost` 統一存未稅金額
2. **計算公式**：請款時 `cost_amount = bankType === 'company' ? Math.round(cost * 1.05) : cost`
3. **取整**：Math.round
4. **資料遷移**：只反算 ej@（574bc155）的公司行號 cost，`cost = Math.round(cost / 1.05)`
5. **UI 標示**：成本欄加「（未稅）」、請款金額加「（含稅）」
6. **payment_requests 不動**
7. **已核准項目不受影響**（只有 1 筆且是個人）

## 下一步

→ 執行 `/spectra propose` 產出正式規格
