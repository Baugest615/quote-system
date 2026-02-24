---
name: verification-loop
description: "quote-system 六階段品質驗證"
---

# 品質驗證

完成功能、重構或準備 PR 前執行：

1. **Build**：`npm run build`
2. **Type Check**：`npx tsc --noEmit`
3. **Lint**：`npm run lint`
4. **Test**：`npm test`（目標 80%+ 覆蓋率）
5. **Security**：檢查硬編碼密鑰、.env 外露、RLS 完整性、遺留 console.log
6. **Diff Review**：`git diff --stat`，檢查非預期變更

## 輸出格式

```
驗證報告
Build:     [PASS/FAIL]
Types:     [PASS/FAIL]
Lint:      [PASS/FAIL]
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL]
Diff:      [X files changed]
Overall:   [READY/NOT READY] for PR
```
