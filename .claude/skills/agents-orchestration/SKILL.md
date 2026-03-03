---
name: agents-orchestration
description: "quote-system 多 Agent 協作框架使用指南。當使用者提到「跑 QA」「品質檢查」「agents」「多 Agent」時觸發。"
---

# Agent 協作框架

## 架構

```
scripts/agents/
├── agents.ts          # Agent 定義（角色、Prompt、工具權限）
├── config.ts          # 模型設定、工具分級、執行限制
├── skill-map.ts       # Agent ↔ Skill 對應表
├── skills.ts          # Skill 載入器（自動注入 prompt）
├── orchestrate.ts     # 主入口（互動式選單 + CLI）
├── utils.ts           # Agent 執行、報告儲存
├── logger.ts          # 輸出格式化
└── workflows/
    ├── quality.ts     # 品質驗證（4 agents 平行）
    ├── develop.ts     # 功能開發（worktree 隔離）
    ├── review.ts      # Code Review → 測試（Sequential）
    ├── migrate.ts     # DB Migration 驗證
    ├── performance.ts # 性能審計
    └── security-cleanup.ts # 安全問題修復
```

## 10 個 Agent

| Agent | 模型 | 工具 | 職責 |
|-------|------|------|------|
| type-checker | Sonnet | readonly | `tsc --noEmit` 型別檢查 |
| linter | Sonnet | readonly | ESLint + Prettier |
| tester | Sonnet | readonly | Jest 測試 + 覆蓋率 |
| security-auditor | Opus | readonly | RLS / 認證 / OWASP 稽核 |
| frontend-dev | Opus | writable | UI 元件開發 |
| reviewer | Opus | writable | Code Review + 測試撰寫 |
| db-migrator | Opus | readonly | Migration 預檢 + 資料驗證 |
| security-cleanup | Sonnet | writable | 已知安全問題批量修復 |
| performance-auditor | Sonnet | readonly | React Query / bundle / DB 性能 |
| e2e-tester | Sonnet | readonly | Playwright E2E 測試 |

## 工作流

### 品質驗證 `npm run agents:quality`
平行跑 type-checker + linter + tester + security-auditor，報告存 `.claude/reports/quality-*.md`

### 功能開發 `npm run agents:develop`
在 git worktree 中隔離開發，支援 `--spec` 讀取 SDD 規格檔

### Code Review `npm run agents:review`
Sequential: reviewer 分析 → 撰寫測試 → tester 執行

### DB Migration `npm run agents:migrate`
預檢新 migration → 驗證 RLS 合規 → 執行 `verify_data_integrity()`

### 性能審計 `npm run agents:performance`
掃描 React Query hooks + bundle size + DB 查詢效能

### 安全修復 `npm run agents:security-cleanup`
批量修復已知安全問題（console.log 清理、HTML sanitization）

## 模型分級

- **Sonnet**：快速檢查（maxTurns: 10, budget: $0.50）
- **Opus**：深度推理（maxTurns: 20, budget: $2.00）

## Skill 載入機制

每個 Agent 的 prompt = Skill 知識（自動載入自 `~/.claude/skills-library/`）+ 專案特有指令（`agents.ts`）。
對應表在 `skill-map.ts`，超出 `maxTotalBytes` 預算的 skill 會被跳過。

## 建議使用時機

- 使用者說「全面檢查」「跑 QA」→ `npm run agents:quality`
- 使用者說「幫我 review」且變更 > 3 檔案 → `npm run agents:review`
- 新增 migration → `npm run agents:migrate`
- 上線前 → `npm run agents:quality` + `npm run agents:performance`
