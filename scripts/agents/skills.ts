/**
 * Skill 載入器 — 從 skills-library 自動載入知識注入 Agent prompt
 *
 * 機制：
 *   1. 根據 skill-map.ts 的宣告，找到對應的 SKILL.md 檔案
 *   2. 解析 YAML frontmatter 取得 name / description
 *   3. 將 skill 內容 + 專案特有 prompt 組合為最終 system prompt
 *
 * 搜尋順序：custom/ → ecc/（自訂版優先）
 * 找不到 skill → 警告但不崩潰（graceful degradation）
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger';

// ─── 常數 ───

const SKILLS_LIBRARY_ROOT = path.join(os.homedir(), '.claude', 'skills-library');
const SKILL_SEARCH_DIRS = ['custom', 'ecc'];
const MAX_SKILL_SIZE_BYTES = 25_000; // 單一 skill 上限 ~25KB
const DEFAULT_MAX_TOTAL_BYTES = 50_000; // 預設總預算 ~50KB

// ─── Types ───

export interface SkillFrontmatter {
  name: string;
  description: string;
}

export interface LoadedSkill {
  name: string;
  description: string;
  content: string;
  filePath: string;
  sizeBytes: number;
}

export interface SkillLoadResult {
  skills: LoadedSkill[];
  warnings: string[];
  totalSizeBytes: number;
}

export interface AgentSkillConfig {
  /** 要載入的 skill 名稱清單（依宣告順序載入） */
  skills: string[];
  /** 所有 skill 內容的總大小上限（bytes），超出則跳過後續 skill */
  maxTotalBytes?: number;
}

// ─── Frontmatter 解析（無需外部依賴） ───

function parseFrontmatter(raw: string): { frontmatter: SkillFrontmatter | null; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: raw };
  }

  const yamlBlock = match[1]!;
  const body = match[2]!;

  // 簡易 YAML 解析：只處理頂層 key: value（足以取得 name 和 description）
  const fields: Record<string, string> = {};
  for (const line of yamlBlock.split('\n')) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (kv) {
      fields[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, '').trim();
    }
  }

  return {
    frontmatter: (fields.name || fields.description)
      ? { name: fields.name ?? '', description: fields.description ?? '' }
      : null,
    body: body.trim(),
  };
}

// ─── Skill 路徑解析 ───

function resolveSkillPath(skillName: string): string | null {
  for (const dir of SKILL_SEARCH_DIRS) {
    const candidate = path.join(SKILLS_LIBRARY_ROOT, dir, skillName, 'SKILL.md');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// ─── 載入單一 Skill ───

function loadSingleSkill(skillName: string): LoadedSkill | { error: string } {
  const filePath = resolveSkillPath(skillName);
  if (!filePath) {
    return { error: `Skill "${skillName}" 在 ${SKILLS_LIBRARY_ROOT} 中找不到` };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const sizeBytes = Buffer.byteLength(body, 'utf-8');
  const truncated = sizeBytes > MAX_SKILL_SIZE_BYTES;

  if (truncated) {
    logger.warn(
      `Skill "${skillName}" 大小 ${(sizeBytes / 1024).toFixed(1)}KB，` +
      `超過 ${(MAX_SKILL_SIZE_BYTES / 1024).toFixed(0)}KB 上限，已截斷`,
    );
  }

  const content = truncated ? body.slice(0, MAX_SKILL_SIZE_BYTES) : body;

  return {
    name: frontmatter?.name || skillName,
    description: frontmatter?.description || '',
    content,
    filePath,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
  };
}

// ─── 批量載入 Skills ───

export function loadSkills(config: AgentSkillConfig): SkillLoadResult {
  const maxTotal = config.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const result: SkillLoadResult = { skills: [], warnings: [], totalSizeBytes: 0 };

  for (const skillName of config.skills) {
    const loaded = loadSingleSkill(skillName);

    if ('error' in loaded) {
      result.warnings.push(loaded.error);
      continue;
    }

    // 預算檢查
    if (result.totalSizeBytes + loaded.sizeBytes > maxTotal) {
      result.warnings.push(
        `跳過 "${skillName}" — 超出 ${(maxTotal / 1024).toFixed(0)}KB 預算` +
        `（目前已用 ${(result.totalSizeBytes / 1024).toFixed(1)}KB）`,
      );
      continue;
    }

    result.skills.push(loaded);
    result.totalSizeBytes += loaded.sizeBytes;
  }

  return result;
}

// ─── Prompt 組合器 ───

export function composePrompt(
  skillConfig: AgentSkillConfig,
  projectPrompt: string,
): string {
  const { skills, warnings } = loadSkills(skillConfig);

  // 記錄警告
  for (const w of warnings) {
    logger.warn(`[skill-loader] ${w}`);
  }

  // 無 skill 載入時，直接返回專案 prompt
  if (skills.length === 0) {
    return projectPrompt;
  }

  // 組合 skill 區段
  const skillSections = skills.map((s) =>
    `### ${s.name}\n> ${s.description}\n\n${s.content}`,
  );

  const skillHeader =
    `## 技能知識（自動載入自 skills-library）\n` +
    `> 已載入 ${skills.length} 個 skill: ${skills.map((s) => s.name).join(', ')}\n\n`;

  const composed = [
    skillHeader + skillSections.join('\n\n---\n\n'),
    `## 專案特有指令\n\n${projectPrompt}`,
  ].join('\n\n---\n\n');

  const totalKB = (skills.reduce((sum, s) => sum + s.sizeBytes, 0) / 1024).toFixed(1);
  logger.info(`[skill-loader] 已組合 prompt: ${skills.length} skills (${totalKB}KB) + 專案 prompt`);

  return composed;
}
