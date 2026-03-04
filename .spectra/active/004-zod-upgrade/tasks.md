# Tasks: Zod 3→4 升級

spec-id: 004-zod-upgrade
預估任務數：4
可平行任務：0（必須循序執行）

## 任務清單

### Phase 1: 套件升級

- [S](✓) T-1: 升級 Zod 套件 + 確認相依性
  - `npm install zod@latest`
  - 確認 `@hookform/resolvers` 相容性，必要時升級
  - 確認 `package.json` 和 `package-lock.json` 更新

### Phase 2: 修復 Breaking Changes

- [S](✓) T-2: 修復型別錯誤和 runtime 行為（依賴 T-1）— tsc 零錯誤，無需修改
  - `npx tsc --noEmit` → 修復所有型別錯誤
  - `src/types/schemas.ts` — 確認 6 個 schema + 8 個輔助函數
  - `src/components/quotes/form/types.ts` — 確認 quoteSchema
  - `src/components/clients/ClientModal.tsx` — 確認 clientSchema + zodResolver
  - `src/components/expense-claims/ExpenseClaimModal.tsx` — 確認 z.coerce
  - `src/components/quotes/QuoteForm.tsx` — 確認 zodResolver

### Phase 3: 更新測試

- [S](✓) T-3: 更新測試期望值（依賴 T-2）— 238 tests 全部通過，無需修改
  - `src/types/__tests__/schemas.test.ts` — 更新 `.default()` 相關的期望值
  - 確認 51 個測試全部通過
  - `npm test` 全專案測試通過

### Phase 4: 驗證

- [S](✓) T-4: 最終驗證（依賴 T-3）— Zod 4.3.6, tsc ✓, 238 tests ✓
  - `npx tsc --noEmit` 通過
  - `npm test` 通過
  - 確認 Zod 版本正確

## 標記說明
- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(→)` = 進行中  `(✓)` = 已完成  `(✗)` = 已取消
