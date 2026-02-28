---
name: coding-standards
description: quote-system 專案編碼規範覆蓋規則
---

# quote-system 編碼規範

以下為本專案特有的規範，覆蓋通用 TypeScript/React 慣例：

- 禁止 `any`，TypeScript 嚴格模式
- 路徑別名使用 `@/`（對應 `src/`）
- 資料取得使用 React Query，遵循 4 級 staleTime 策略（static/dictionary/standard/realtime）
- 表單驗證使用 Zod schema + React Hook Form
- Supabase 型別：`database.types.ts` 自動生成勿改，自訂型別放 `custom.types.ts`
- JSONB 欄位（bank_info）使用 camelCase keys
- 權限判斷使用 `get_my_role()`，三級：Admin / Editor / Member
- 介面文字一律繁體中文，變數/函式英文命名
