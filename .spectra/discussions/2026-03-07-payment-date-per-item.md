# 討論：匯款日期改為逐筆管理（取代 Spec-006 架構）
日期：2026-03-07
狀態：已收斂

## 背景

Spec-006 設計了「核准時寫入 `payment_requests.payment_date`」的架構，但實際部署後發現根本性問題：

**Bug 根因**：請款工作台的核准流程走 `approve_quotation_item` RPC，直接操作 `quotation_items` 表。核准後在 `useWorkbenchReview.ts` 中嘗試 UPDATE `payment_requests.payment_date`，但：
1. 從工作台核准的項目**不一定有對應的 `payment_requests` 記錄**（工作台走 quotation_items 直通車）
2. UPDATE 命中 0 行，靜默失敗，日期從未寫入
3. 已確認請款清單因此讀不到日期，`accounting_expenses.payment_date` 也永遠是 null

**使用者提議**：在已確認請款清單的每個付款項目上直接加匯款日期欄位，逐筆管理，不再依賴 `payment_requests` 間接傳遞。

## 關鍵問題

- [x] Q1：payment_date 應該存在哪裡？ → `payment_confirmation_items`
- [x] Q2：核准時要不要填匯款日？ → 全部在已確認清單填（選項 B）
- [x] Q3：已確認請款清單的 UI 如何呈現？ → 逐筆日期 + 群組「統一設定」快捷鍵（選項 C）
- [x] Q4：Spec-006 既有 migration 如何處理？ → 保留但不再使用（選項 A）

## 討論紀錄

### Q1: payment_date 應該存在哪裡？

**選項 A**：維持在 `payment_requests.payment_date`（Spec-006 原設計）
- 優點：不用改 schema
- 缺點：**根本行不通** — 工作台核准路徑沒有 payment_requests 記錄

**選項 B**：改放在 `payment_confirmation_items.payment_date`
- 優點：每筆確認項目都有，不管來源是 quotation_items 還是 payment_requests
- 優點：逐筆管理，同一匯款對象可以有不同匯款日
- 優點：資料模型乾淨，不需要跨表 JOIN 推導日期
- 缺點：需要新 migration

**選項 C**：只靠 `accounting_expenses.payment_date`（已有此欄位）
- 優點：不用改 schema，欄位已存在
- 缺點：accounting_expenses 不是所有項目都有（沖帳免付不建立）
- 缺點：確認清單 UI 需要反向查 accounting_expenses，資料流方向不自然

**結論**：選擇 B — `payment_confirmation_items.payment_date`。這是最乾淨的方案，每筆確認項目直接帶日期，與來源無關。

### Q2: 核准時要不要填匯款日？

**選項 A**：核准時填（Spec-006 原設計）
- 優點：一次到位
- 缺點：核准時可能還不知道何時匯款，日期不確定

**選項 B**：全部在已確認清單填
- 優點：確認清單是「決定何時匯多少錢」的地方，匯款日在這裡設定最合理
- 優點：可以事後調整
- 缺點：多一個操作步驟

**選項 C**：兩邊都可填（核准時可選填，確認清單可覆蓋）
- 優點：彈性最大
- 缺點：增加複雜度（核准填的日期要帶入確認項目）

**結論**：選擇 B — 全部在已確認清單填。核准時不需填匯款日，確認清單本來就是「決定匯款細節」的地方。

### Q3: 已確認請款清單 UI 如何呈現？

**選項 A**：群組層級日期（現行設計）+ 逐筆覆蓋
- 群組卡片上有一個日期選擇器（設定群組預設）
- 每筆項目也有日期欄位，可個別覆蓋
- 優點：大部分時候設群組日期就好，少數例外才逐筆改

**選項 B**：純逐筆日期（移除群組層級日期）
- 每筆項目各自有日期選擇器
- 優點：最直覺，每筆成本的匯款日一目了然
- 缺點：如果同一人有 10 筆要同日匯款，要填 10 次

**選項 C**：逐筆日期 + 「全部設定」快捷操作
- 每筆項目有日期欄位
- 群組有「統一設定日期」按鈕，一鍵把群組內所有項目設為同日
- 優點：兼顧彈性和效率

**結論**：選擇 C — 逐筆日期 + 群組「統一設定日期」快捷操作。兼顧彈性和效率。

### Q4: Spec-006 既有的 migration 和程式碼如何處理？

已部署的 migration `20260307100000_add_payment_date_to_requests.sql` 在 `payment_requests` 上加了 `payment_date` 欄位。

**選項 A**：保留欄位但不再使用，新增 `payment_confirmation_items.payment_date`
- 優點：不需回滾，DB 改動最小
- 缺點：留下無用欄位

**選項 B**：新 migration 移除 `payment_requests.payment_date`，新增 `payment_confirmation_items.payment_date`
- 優點：乾淨
- 缺點：需確認沒有其他地方引用

**結論**：選擇 A — 保留但不再使用，避免回滾風險。

## 收斂結論

1. payment_date 放在 `payment_confirmation_items`（新增欄位）
2. 核准時不再填匯款日，移除工作台的日期選擇器
3. 已確認清單每筆項目有獨立的匯款日期欄位，群組提供「統一設定」快捷操作
4. `payment_requests.payment_date` 保留但不再使用
5. 修改後的日期需同步到 `accounting_expenses.payment_date`
6. Spec-006 原有的 groupKey 日期分組邏輯可簡化（不再需要按日期拆分群組，因為每筆項目自帶日期）

## 下一步

→ 進入 `/spectra propose` 產出正式規格（007-payment-date-per-item）
