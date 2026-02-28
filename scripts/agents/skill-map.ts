/**
 * Agent ↔ Skill 對應表
 *
 * 宣告每個 Agent 需要從 skills-library 載入哪些 skill。
 * Skills 按宣告順序載入，超出 maxTotalBytes 預算時自動跳過後續 skill。
 *
 * 新增 Agent：加一行對應即可
 * 新增 Skill：在對應 Agent 的 skills 陣列中加入名稱
 * 更新 Skill：自動生效（每次執行時即時讀取 SKILL.md）
 */
import type { AgentSkillConfig } from './skills';

export const AGENT_SKILL_MAP: Record<string, AgentSkillConfig> = {
  'type-checker': {
    skills: ['coding-standards'],
    maxTotalBytes: 15_000,
  },
  'linter': {
    skills: ['coding-standards'],
    maxTotalBytes: 15_000,
  },
  'tester': {
    skills: ['tdd-workflow'],
    maxTotalBytes: 20_000,
  },
  'security-auditor': {
    skills: [
      'supabase-postgres-best-practices',
      'security-review',
    ],
    maxTotalBytes: 30_000,
  },
  'frontend-dev': {
    skills: [
      'frontend-patterns',
      'ui-ux-pro-max',
      'coding-standards',
    ],
    maxTotalBytes: 50_000,
  },
  'reviewer': {
    skills: [
      'review',
      'tdd-workflow',
      'security-review',
    ],
    maxTotalBytes: 40_000,
  },
};
