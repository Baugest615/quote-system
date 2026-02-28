/**
 * 共用設定 — 路徑、模型、工具權限分級、Agent 限制
 */
import path from 'path';

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const REPORTS_DIR = path.join(PROJECT_ROOT, '.claude', 'reports');

// 模型設定
export const MODELS = {
  /** 高思考任務（安全稽核、Code Review、功能開發） */
  thinking: 'claude-opus-4-6',
  /** 執行任務（型別檢查、lint、測試） */
  execution: 'claude-sonnet-4-6',
} as const;

// Agent 執行限制（按模型分級）
export const AGENT_LIMITS = {
  /** Sonnet — 快速執行任務，成本較低 */
  sonnet: { maxTurns: 10, maxBudgetUsd: 0.5 },
  /** Opus — 深度思考任務，允許更多輪次和預算 */
  opus: { maxTurns: 20, maxBudgetUsd: 2.0 },
} as const;

// Review 工作流設定
export const REVIEW_CONFIG = {
  /** git diff 內容最大字元數（避免超過 context window） */
  maxDiffChars: 30000,
  /** review 結果傳遞給下一步的最大字元數 */
  maxReviewOutputChars: 10000,
} as const;

// Develop 工作流設定
export const DEVELOP_CONFIG = {
  /** branch slug 最大長度 */
  branchSlugMaxLength: 40,
} as const;

// 工具權限分級
export const TOOL_SETS = {
  /** 唯讀 — 分析、檢查用 */
  readonly: ['Read', 'Grep', 'Glob', 'Bash'],
  /** 可寫入 — 開發、修復用 */
  writable: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  /** 完整 — 含子 Agent 和網路 */
  full: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch'],
} as const;

// Bash 工具自動允許的命令模式
export const SAFE_BASH_PATTERNS = [
  'Bash(npx tsc:*)',
  'Bash(npx next lint:*)',
  'Bash(npx prettier:*)',
  'Bash(npx jest:*)',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git status:*)',
  'Bash(git worktree:*)',
  'Bash(git branch:*)',
  'Bash(git checkout:*)',
  'Bash(git merge:*)',
];
