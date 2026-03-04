# Spec: Zod 3→4 升級

spec-id: 004-zod-upgrade
版本：1.0
最後更新：2026-03-05

## 功能需求

### 必要（Must Have）

- FR-1: 升級 `zod` 套件到 v4
- FR-2: 確保 `@hookform/resolvers` 與 Zod 4 相容
- FR-3: 修復 `.default()` 行為改變的影響（schemas.ts 中 7 處）
- FR-4: 確保所有 safeParse 輔助函數正常運作
- FR-5: 更新所有測試以反映 v4 行為
- FR-6: TypeScript 編譯通過

### 可選（Nice to Have）

- FR-N1: 遷移 `z.string().email()` → `z.email()`（deprecated API 清理）
- FR-N2: 遷移 `message` → `error` 參數名稱

## 技術規格

### 套件版本

| 套件 | 目前 | 目標 |
|------|------|------|
| zod | ^3.22.4 | ^3.24（含 v4 相容層）或 zod@^4 |
| @hookform/resolvers | ^3.3.2 | 視相容性決定 |

### `.default()` 行為改變影響分析

**Zod 3**：`parse({})` 不填 `.default()` 預設值
**Zod 4**：`parse({})` 會填入 `.default()` 預設值

影響的 schema：

1. `socialLinksSchema` — 6 個 `.default('')` 欄位
   - v3: `parse({})` → `{}`
   - v4: `parse({})` → `{ instagram: '', youtube: '', ... }`
   - **影響**：正面（空字串比 undefined 更安全）

2. `sealStampConfigSchema` — 5 個 `.default()` 欄位
   - v3: `parse({})` → `{}`
   - v4: `parse({})` → `{ enabled: false, image: '', position: 'center', size: 80, opacity: 0.8 }`
   - **影響**：正面（完整預設值比部分欄位更可靠）

3. `contactSchema` — 4 個 `.default('')` 欄位
   - v3: `parse({ id: '1', name: 'test' })` → `{ id: '1', name: 'test' }`
   - v4: `parse({ id: '1', name: 'test' })` → `{ id: '1', name: 'test', email: '', phone: '', company: '', role: '' }`
   - **影響**：正面

4. `ClientModal.tsx` contactSchema — `is_primary: z.boolean().default(false)`
   - v4 會自動填入 `is_primary: false`
   - **影響**：正面

### safeParse fallback 調整

`parseSocialLinks` 的 fallback 值在 v4 可能不再需要（因為 `.default()` 會自動填入），但為了向後相容和防守性設計，保留 fallback。

### z.coerce 變化

`z.coerce.number()` 在 v4 的 input type 從 `number` 變為 `unknown` — 只影響型別推導，不影響 runtime 行為。ExpenseClaimModal.tsx 的 `z.coerce.number()` 不需修改。

## 驗收標準

- [ ] AC-1: `npm install` 成功安裝 Zod 4
- [ ] AC-2: `npx tsc --noEmit` 無錯誤
- [ ] AC-3: `npm test` 全部通過（可能需更新測試期望值）
- [ ] AC-4: 手動驗證報價單表單正常運作
- [ ] AC-5: 手動驗證客戶表單正常運作
- [ ] AC-6: 手動驗證報帳表單正常運作

## 非功能需求

- 效能：Zod 4 自帶效能提升，無額外優化需求
- 安全：無安全影響
