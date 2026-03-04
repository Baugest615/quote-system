# 討論：銷項反向同步 + Zod 3→4 升級

日期：2026-03-05
狀態：已收斂

---

# Part A：銷項管理反向同步

## 背景

目前報價單 → 銷項是**單向自動同步**：
- ✅ 報價單簽約 → 自動建立 `accounting_sales` 記錄（RPC: `create_accounting_sale_from_quotation`）
- ✅ 追加項目儲存 → 自動更新 `accounting_sales` 金額（`useSaveItems.ts:166-177`）
- ✅ 取消簽約 → 自動刪除銷項記錄（RPC: `remove_accounting_sale_for_quotation`）
- ❌ 在銷項管理頁面修改金額 → **不會**同步回報價單

## 關鍵問題

- [ ] QA-1: 反向同步的觸發場景有哪些？
- [ ] QA-2: 同步哪些欄位？
- [ ] QA-3: 同步回報價單的哪一層（quotations 主表 or quotation_items）？
- [ ] QA-4: 衝突處理策略？
- [ ] QA-5: 實作方式（DB trigger vs 前端 hook vs RPC）？

## 討論紀錄

### QA-1: 反向同步的觸發場景

**場景分析**：
1. 在銷項管理頁面修改 `sales_amount`（未稅銷售額）
2. 在銷項管理頁面修改 `tax_amount`（稅額）
3. 在銷項管理頁面修改 `total_amount`（含稅總額）
4. 在銷項管理頁面刪除銷項記錄

**選項 A — 只同步金額修改（場景 1-3）**
- 優點：範圍最小，風險最低
- 缺點：刪除銷項時報價單狀態不變

**選項 B — 金額修改 + 刪除都同步**
- 優點：完整一致性
- 缺點：刪除銷項 = 取消簽約？邏輯可能不合理

**選項 C — 不主動同步，改為「提示 + 手動確認」**
- 修改銷項金額後彈出提示：「是否同步更新報價單金額？」
- 優點：使用者有完全控制權
- 缺點：容易忘記，數據仍可能不一致

**結論**：待討論

---

### QA-2: 同步哪些欄位

**accounting_sales → quotations 的欄位對應**：

| accounting_sales | quotations | 說明 |
|-----------------|------------|------|
| sales_amount | subtotal_untaxed? | 未稅銷售額 |
| total_amount | subtotal_amount? | 含稅總額 |

**問題**：quotations 表的金額欄位結構是什麼？是由 items 彙總計算的嗎？

如果 quotations 的金額是由 quotation_items 的 price × quantity 彙總而來，那修改銷項金額要回寫到哪裡？

**結論**：待討論

---

### QA-3: 同步回哪一層

**選項 A — 同步到 quotations 主表**
- 直接改 quotations 的金額欄位
- 問題：如果金額是由 items 計算的，直接改主表會導致主表和明細不一致

**選項 B — 同步到 quotation_items（某一筆或按比例分攤）**
- 問題：一張報價單可能有多個 items，銷項只有一個總金額，不知道要改哪個 item

**選項 C — 銷項管理的金額欄位是「最終金額」，與報價單脫鉤**
- accounting_sales 保持獨立的金額紀錄
- 不反向同步，但提供「差異報表」讓使用者比對
- 優點：最簡單，不破壞現有邏輯

**結論**：待討論

---

### QA-4: 衝突處理

如果使用者同時修改了報價單和銷項，以誰為準？

**結論**：待討論

---

### QA-5: 實作方式

**選項 A — DB Trigger**
- `AFTER UPDATE ON accounting_sales` → 自動更新 quotations
- 優點：保證一致性
- 缺點：難以實現「確認提示」

**選項 B — 前端 hook + RPC**
- 銷項頁面修改後，呼叫 RPC 同步回報價單
- 優點：可加確認提示
- 缺點：繞過前端直接改 DB 就不會同步

**結論**：待討論

---

# Part B：Zod 3→4 升級

## 背景

目前使用 Zod `^3.22.4`，影響 5 個檔案。Claude Agent SDK `^0.1.77` 需升級到 0.2.x 時需要 Zod 4。

## 影響範圍

| 檔案 | Zod 用法 | 風險 |
|------|---------|------|
| `src/types/schemas.ts` | 6 個 schema（含 `.default()`, `.optional()`, `safeParse`） | 🔴 高 |
| `src/components/quotes/form/types.ts` | 複雜嵌套（3 層 + array + nullable） | 🔴 高 |
| `src/components/clients/ClientModal.tsx` | zodResolver + react-hook-form | 🟡 中 |
| `src/components/expense-claims/ExpenseClaimModal.tsx` | z.coerce.number() | 🟡 中 |
| `src/components/quotes/QuoteForm.tsx` | zodResolver 整合 | 🟡 中 |
| `src/types/__tests__/schemas.test.ts` | 51 個測試 | 🟡 需更新 |

## 關鍵問題

- [ ] QB-1: 是否有急迫升級需求？還是可以延後？
- [ ] QB-2: `.default()` 行為改變的影響
- [ ] QB-3: 升級策略（一次性 vs 漸進式）

## 討論紀錄

### QB-1: 升級急迫性

**目前 Zod 3 沒有功能性問題**，升級主要是為了：
1. Claude Agent SDK 0.2.x 要求（但目前 agents 框架只用於開發工具，不影響產品功能）
2. 未來生態系相容性

**選項 A — 現在升級**
- 優點：趁技術債清理階段一起做
- 缺點：增加本次迭代的測試負擔

**選項 B — 延後到下個迭代**
- 優點：不影響目前上線計畫
- 缺點：技術債持續累積

**結論**：待討論

---

### QB-2: `.default()` 行為改變

Zod 4 中，`.default()` 在 `.optional()` 物件屬性內**會生效**（Zod 3 不會）。

影響最大的是 `socialLinksSchema` 和 `sealStampConfigSchema`：
- Zod 3：`parse({})` → `{}`（不填預設值）
- Zod 4：`parse({})` → `{ instagram: '', youtube: '', ... }`（填入預設值）

**這對業務邏輯是好事還是壞事？** 需要確認。

**結論**：待討論

---

### QB-3: 升級策略

**選項 A — 直接升級 + 修測試**
- `npm install zod@^4` → 跑測試 → 修壞掉的
- 預估 2-4 小時

**選項 B — 用 codemod 工具**
- 社群有 `zod-v3-to-v4` codemod
- 自動轉換大部分 API 差異

**結論**：待討論

---

## 收斂結論

### Part A：銷項反向同步
1. **決定不做反向同步**：銷項管理保持獨立金額，不回寫報價單
2. QA-1~QA-5 全部不適用（因為不做反向同步）
3. 未來可考慮加「差異報表」讓使用者比對銷項與報價單金額差異
4. **此議題不需要產出 spec，暫不實作**

### Part B：Zod 3→4 升級
1. **決定現在升級**：趁技術債清理階段一起做
2. 升級策略：直接升級 + 修測試（先試 codemod，不行再手動）
3. `.default()` 行為改變：對業務邏輯影響需在升級時逐一確認
4. **需要產出 spec → `/spectra propose`**

## 下一步
→ Part A 結案（不實作）
→ Part B 執行 `/spectra propose` 產出 Zod 升級規格
