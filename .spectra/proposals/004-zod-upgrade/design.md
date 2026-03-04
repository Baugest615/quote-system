# Design: Zod 3→4 升級

spec-id: 004-zod-upgrade

## 架構決策

### 決策 1: 升級策略

- 選擇：直接 `npm install zod@latest` 一次升級
- 原因：影響範圍僅 6 個檔案，不需要漸進式遷移
- 替代方案：用 codemod 工具 → 不採用，因為我們的 Zod 用法較簡單，手動調整更精準

### 決策 2: Deprecated API 處理

- 選擇：本次只修復 breaking changes，deprecated API 暫不遷移
- 原因：deprecated API 仍可運作，遷移可延後到下個迭代
- 具體保留：`z.string().email()`、`message` 參數、`.or()` 用法

### 決策 3: `.default()` 行為改變的處理

- 選擇：接受新行為（自動填入預設值），更新測試期望值
- 原因：新行為對業務邏輯是正面的（完整預設值比部分欄位更可靠）
- 替代方案：用 `.prefault()` 恢復 v3 行為 → 不採用，沒有必要

## 升級流程

```
1. npm install zod@latest
2. npx tsc --noEmit → 收集型別錯誤
3. 修復型別錯誤（預期少量）
4. npm test → 收集測試失敗
5. 更新測試期望值（主要是 .default() 相關）
6. 驗證全部通過
```

## 依賴關係

- `@hookform/resolvers` 需要與 Zod 4 相容 → v3.3.2+ 或升級到 v4
- `react-hook-form` 不直接依賴 Zod，無需變動
