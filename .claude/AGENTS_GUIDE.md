# Multi-Agent 多工系統 — 使用指南

> 最後更新：2026-02-28

## 快速指令總覽

| 指令 | 說明 | 需要互動？ |
|------|------|-----------|
| `npm run agents` | 互動式選單（選擇工作流） | ✅ |
| `npm run agents:quality` | 品質驗證（4 Agent 平行） | ❌ |
| `npm run agents:review` | Code Review + 自動寫測試 | ❌ |
| `npm run agents:develop` | 功能開發（互動輸入需求） | ✅ |
| `npm run agents:develop -- --spec .claude/specs/xxx.md` | 功能開發（從規格檔） | ⚠️ 結束時需選擇 |

---

## 工作流詳細說明

### 1. 品質驗證 `npm run agents:quality`

**用途**：上線前全面檢查、日常健康檢測

**平行啟動 4 個 Agent**：

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ type-checker │   linter     │   tester     │  security-   │
│ (Sonnet)     │ (Sonnet)     │ (Sonnet)     │  auditor     │
│ tsc --noEmit │ ESLint+      │ Jest+覆蓋率   │  (Opus)      │
│              │ Prettier     │              │  RLS+OWASP   │
└──────────────┴──────────────┴──────────────┴──────────────┘
                    ↓ 全部完成後
            📄 .claude/reports/quality-{timestamp}.md
```

**各 Agent 檢查內容**：
- **type-checker** — `npx tsc --noEmit`，分類 critical/warning/info
- **linter** — ESLint + Prettier，統計可自動修復 vs 需手動修復
- **tester** — Jest 全部測試 + 覆蓋率分析，找出低覆蓋率檔案
- **security-auditor** — RLS 政策完整性、API 認證、環境變數洩露、OWASP Top 10

---

### 2. Code Review `npm run agents:review`

**用途**：提交前品質把關、PR 前自我審查

**三階段鏈式執行**：

```
Step 1: Code Review（reviewer, Opus, 唯讀）
  └─ 讀取 git diff → 分析邏輯/型別/效能/安全/可維護性
       ↓
Step 2: 撰寫測試（reviewer, Opus, 可寫入）
  └─ 根據 review 結果撰寫 Jest + Testing Library 測試
       ↓
Step 3: 執行測試（tester, Sonnet, 唯讀）
  └─ 跑 npx jest --no-cache → 確認通過 + 覆蓋率
       ↓
📄 .claude/reports/review-{timestamp}.md
```

---

### 3. 功能開發 `npm run agents:develop`

**用途**：自動化前端功能開發

**流程**：

```
1. 輸入功能描述
   ├─ 互動輸入（無 --spec 參數）
   └─ 從檔案讀取（--spec .claude/specs/xxx.md）
       ↓
2. 自動建立隔離環境
   ├─ 分支：agent/feature-{slug}-{timestamp}
   └─ Worktree：.claude/worktrees/{slug}/
       ↓
3. frontend-dev Agent 開發（Opus, 可寫入）
       ↓
4. 顯示 git diff --stat
       ↓
5. 選擇操作：
   [m]erge  → 合併回主分支，清理 worktree
   [k]eep   → 保留 worktree，稍後手動處理
   [d]elete → 放棄變更，刪除 worktree
```

**規格檔範例** `.claude/specs/feature-example.md`：

```markdown
# 功能名稱

## 需求描述
描述功能的目標和使用場景...

## 技術規格
- 新增/修改的元件
- 使用的 API
- 資料結構

## 驗收條件
- [ ] 條件 1
- [ ] 條件 2
```

---

## Agent 規格速查

| Agent | 模型 | 權限 | 用途 |
|-------|------|------|------|
| type-checker | Sonnet 4.6 | 唯讀 | TypeScript 型別檢查 |
| linter | Sonnet 4.6 | 唯讀 | ESLint + Prettier |
| tester | Sonnet 4.6 | 唯讀 | Jest 測試與覆蓋率 |
| security-auditor | Opus 4.6 | 唯讀 | 安全稽核（RLS/OWASP） |
| frontend-dev | Opus 4.6 | 可寫入 | 前端功能開發 |
| reviewer | Opus 4.6 | 可寫入 | Code Review + 測試撰寫 |

**成本限制**：Sonnet 最多 $0.50 / 10 輪、Opus 最多 $2.00 / 20 輪

---

## Skills 自動注入

Agent 的 system prompt 由兩部分自動組合：

```
最終 Prompt = Skill Knowledge（自動載入） + Project-Specific Context（手動維護）
              ↑                                    ↑
  ~/.claude/skills-library/             scripts/agents/agents.ts
  （57 skills，runtime 讀取）            （只保留專案特有知識）
```

### Agent ↔ Skill 對應（`skill-map.ts`）

| Agent | 自動載入的 Skills | 預算 |
|-------|------------------|------|
| type-checker | coding-standards | 15KB |
| linter | coding-standards | 15KB |
| tester | tdd-workflow | 20KB |
| security-auditor | supabase-postgres-best-practices, security-review | 30KB |
| frontend-dev | frontend-patterns, ui-ux-pro-max, coding-standards | 50KB |
| reviewer | review, tdd-workflow, security-review | 40KB |

### 自動更新機制

- **Skills 更新**：修改 `~/.claude/skills-library/` 中的 SKILL.md → 下次執行 agents 自動生效
- **新增 Skill**：在 `skill-map.ts` 對應 Agent 的 `skills` 陣列加入名稱
- **新增 Agent**：在 `skill-map.ts` 加一行 + 在 `agents.ts` 加 PROJECT_PROMPT + buildAgent()
- **找不到 Skill**：只發出警告，不會崩潰（graceful degradation）

---

## 從 VSCode 對話窗協作

在 VSCode Claude Code 對話窗中，可以請 Claude 執行：

```
# 非互動式工作流（可直接背景執行）
「幫我跑品質驗證」     → npm run agents:quality
「幫我跑 code review」 → npm run agents:review

# 需要先準備 spec 的工作流
「幫我開發 xxx 功能」  → 先寫 spec → npm run agents:develop -- --spec ...

# Claude 內建的平行子任務（不經過 agents 框架）
「幫我同時檢查 A 和 B」 → 用 Task tool 派發
```

---

## 報告輸出

**位置**：`.claude/reports/`

**格式**：

```
quality-2026-02-28T13-05-42.md   # 品質驗證報告
review-2026-02-28T14-20-10.md    # Code Review 報告
```

**報告包含**：總覽表格（狀態/Agent 數/耗時/成本）+ 各 Agent 詳細輸出

---

## 環境需求

```bash
# 方式 1：使用 Anthropic API Key
export ANTHROPIC_API_KEY=sk-ant-...

# 方式 2：使用 Claude Code 現有授權（自動偵測）
# 無需設定，直接執行即可
```

---

## 檔案結構

```
scripts/agents/
├── orchestrate.ts          # 主入口（選單 + 工作流派發）
├── agents.ts               # 6 個 Agent 定義（PROJECT_PROMPTS + buildAgent）
├── skill-map.ts            # Agent ↔ Skill 對應表（宣告式）
├── skills.ts               # Skill 載入器（讀取 SKILL.md + 組合 prompt）
├── logger.ts               # 彩色終端輸出
├── config.ts               # 共用設定（模型分級、工具權限、Bash 白名單）
├── utils.ts                # 執行引擎（runAgent、報告格式化）
└── workflows/
    ├── quality.ts           # 品質驗證（4 Agent 平行）
    ├── develop.ts           # 功能開發（worktree 隔離）
    └── review.ts            # Code Review（3 步驟鏈式）

.claude/
├── reports/                 # Agent 產出的報告
├── specs/                   # 功能開發規格檔
└── worktrees/               # 開發用的 git worktree

~/.claude/skills-library/    # Skills 知識庫（Agent 自動載入）
├── custom/                  # 12 個自訂 skill
└── ecc/                     # 45 個 ECC skill
```

---

## 即時監控方案

### 目前：Terminal 文字輸出

你的 agents 框架已內建彩色 Logger（`utils.ts`），執行時會即時顯示：
- 🔵 Agent 啟動 / ✅ 完成 / ❌ 失敗
- 耗時與成本
- 最終匯總表格

### 推薦的圖形化監控方案

| 方案 | 類型 | 特色 | 整合難度 | 適合場景 |
|------|------|------|----------|----------|
| **Langfuse** | 開源 Web UI | Trace 視覺化、成本追蹤、Prompt 版控 | 中 | 長期觀測 + 優化 |
| **Arize Phoenix** | 本機 Web UI | 一行指令啟動、trace 圖、Agent 步驟檢視 | 低 | 快速本機除錯 |
| **Superset** | Electron App | 10+ Agent 平行監控、Diff Viewer、通知 | 低 | 多 Agent 即時觀察 |
| **claude-code-hooks-observability** | Hook 型 | 專為多 Agent 設計、swim lane 視圖 | 中 | 深度追蹤 |
| **concurrently 強化** | Terminal | 彩色前綴、零設定 | 極低 | 最小改動即用 |

### 快速開始建議

**短期（立即可用）**：目前的 Logger 輸出已能看到基本進度

**中期（推薦）**：整合 **Langfuse** 或 **Arize Phoenix**
- Langfuse 有官方 Claude Agent SDK 整合文件
- Phoenix 本機一行指令啟動 Dashboard

**長期**：GitHub Agentic Workflows（2026 Technical Preview）
- 支援 Claude Code 在 GitHub Actions 中執行
- 原生 CI/CD 整合 + 即時遙測

---

## 新專案初始化

### 前置條件

```bash
# 確認已安裝 Claude Agent SDK 和 tsx
npm install @anthropic-ai/claude-agent-sdk tsx --save-dev
```

### 初始化步驟

告訴 Claude：**「幫我初始化 agents 框架」**，或手動執行：

```bash
# 1. 從全域模板複製框架骨架
cp -r ~/.claude/templates/agents/ scripts/agents/

# 2. 將範例 Agent 定義改名為正式檔
mv scripts/agents/agents.example.ts scripts/agents/agents.ts

# 3. 在 package.json 加入 npm scripts
#    （手動加入或請 Claude 幫忙）
```

### 必要的 package.json scripts

```json
{
  "scripts": {
    "agents": "tsx scripts/agents/orchestrate.ts",
    "agents:quality": "tsx scripts/agents/orchestrate.ts quality",
    "agents:develop": "tsx scripts/agents/orchestrate.ts develop",
    "agents:review": "tsx scripts/agents/orchestrate.ts review"
  }
}
```

### 客製化 agents.ts

複製後**必須**根據專案技術棧修改 `agents.ts` 中每個 Agent 的 system prompt：

| 需客製項目 | 說明 |
|-----------|------|
| 框架/語言 | Next.js → Vue? Python? |
| 測試工具 | Jest → Vitest? Pytest? |
| Lint 工具 | ESLint → Biome? Ruff? |
| 安全重點 | RLS → RBAC? JWT? |
| UI 規範 | shadcn/ui → 其他 UI 庫？ |

### 全域模板位置

```
~/.claude/templates/agents/
├── README.md              # 初始化指南
├── config.ts              # 共用設定（通常不需改）
├── orchestrate.ts         # 互動式選單（通常不需改）
├── utils.ts               # 執行引擎（通常不需改）
├── agents.example.ts      # Agent 定義範例（必須客製）
└── workflows/
    ├── quality.ts         # 品質驗證（通常不需改）
    ├── develop.ts         # 功能開發（通常不需改）
    └── review.ts          # Code Review（通常不需改）
```

### 必要目錄

初始化後確保以下目錄存在：

```bash
mkdir -p .claude/reports    # Agent 報告輸出
mkdir -p .claude/specs      # 功能開發規格檔
# .claude/worktrees/        # 自動建立，不需手動
```

---

## 已修復的問題

| 問題 | 修復 |
|------|------|
| ~~環境變數檢查不足~~ | orchestrate.ts 現在會驗證 SDK + CLI 可用性 |
| ~~exec 無 try-catch~~ | develop.ts 所有 exec 已加 try-catch |
| ~~review diff 雙層失敗~~ | review.ts 改用 getGitDiff() 統一處理 fallback |
| ~~硬編碼值~~ | 全部集中到 config.ts（AGENT_LIMITS / REVIEW_CONFIG / DEVELOP_CONFIG） |
| ~~Worktree 孤立風險~~ | develop.ts 加入 SIGINT/SIGTERM signal handler 自動清理 |
| ~~Agent prompt 手動維護~~ | 改用 skills 自動注入機制 |

### 待辦

| 問題 | 說明 |
|------|------|
| 測試覆蓋率 0% | agents 框架本身無單元或整合測試 |
