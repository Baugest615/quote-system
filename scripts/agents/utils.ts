/**
 * 共用工具 — Agent 執行、報告儲存、Logger
 */
import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, REPORTS_DIR, MODELS, SAFE_BASH_PATTERNS } from './config';
import { AGENTS, type AgentName } from './agents';

// ─── Logger ───

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
} as const;

export const logger = {
  info: (msg: string) => console.log(`${COLORS.blue}ℹ${COLORS.reset} ${msg}`),
  success: (msg: string) => console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  warn: (msg: string) => console.log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`),
  error: (msg: string) => console.log(`${COLORS.red}✗${COLORS.reset} ${msg}`),
  agent: (name: string, msg: string) =>
    console.log(`${COLORS.magenta}[${name}]${COLORS.reset} ${msg}`),
  header: (msg: string) =>
    console.log(`\n${COLORS.bold}${COLORS.cyan}${msg}${COLORS.reset}\n`),
  divider: () => console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`),
};

// ─── Agent 執行結果 ───

export interface AgentResult {
  name: string;
  success: boolean;
  output: string;
  costUsd: number;
  durationMs: number;
  errors: string[];
}

// ─── 執行單一 Agent ───

export async function runAgent(
  name: AgentName,
  taskPrompt: string,
  options?: Partial<Options>,
): Promise<AgentResult> {
  const agentDef = AGENTS[name];
  const startTime = Date.now();

  logger.agent(name, '啟動中...');

  const result: AgentResult = {
    name,
    success: false,
    output: '',
    costUsd: 0,
    durationMs: 0,
    errors: [],
  };

  try {
    const q = query({
      prompt: taskPrompt,
      options: {
        cwd: PROJECT_ROOT,
        model: agentDef.model === 'opus' ? MODELS.thinking : MODELS.execution,
        systemPrompt: agentDef.prompt,
        tools: agentDef.tools as string[],
        allowedTools: [
          ...(agentDef.tools as string[]),
          ...SAFE_BASH_PATTERNS,
        ],
        permissionMode: 'dontAsk',
        maxTurns: 20,
        maxBudgetUsd: 2.0,
        persistSession: false,
        settingSources: ['project'],
        ...options,
      },
    });

    for await (const message of q) {
      handleMessage(name, message, result);
    }

    result.durationMs = Date.now() - startTime;
    if (result.errors.length === 0) {
      result.success = true;
      logger.success(`${name} 完成 (${(result.durationMs / 1000).toFixed(1)}s, $${result.costUsd.toFixed(4)})`);
    } else {
      logger.error(`${name} 完成但有錯誤 (${result.errors.length} 個)`);
    }
  } catch (err) {
    result.durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errorMsg);
    logger.error(`${name} 失敗: ${errorMsg}`);
  }

  return result;
}

/** 處理 SDK 訊息，萃取結果 */
function handleMessage(agentName: string, message: SDKMessage, result: AgentResult): void {
  switch (message.type) {
    case 'assistant': {
      // 萃取文字內容
      const textBlocks = message.message.content.filter(
        (block): block is { type: 'text'; text: string } => block.type === 'text',
      );
      const text = textBlocks.map((b) => b.text).join('\n');
      if (text) {
        result.output += text + '\n';
      }
      break;
    }
    case 'result': {
      const resultMsg = message as SDKResultMessage;
      result.costUsd = resultMsg.total_cost_usd;
      if (resultMsg.subtype !== 'success') {
        if ('errors' in resultMsg) {
          result.errors.push(...resultMsg.errors);
        }
      } else if ('result' in resultMsg && resultMsg.result) {
        // 最終結果可能包含結構化輸出
        result.output += resultMsg.result + '\n';
      }
      break;
    }
    case 'system': {
      if (message.subtype === 'init') {
        logger.agent(agentName, `模型: ${message.model}, 工具: ${message.tools.length} 個`);
      }
      break;
    }
  }
}

// ─── 報告儲存 ───

export function saveReport(filename: string, content: string): string {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filePath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  logger.success(`報告已儲存: ${path.relative(PROJECT_ROOT, filePath)}`);
  return filePath;
}

// ─── 報告格式化 ───

export function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
}

export function formatSummaryReport(
  title: string,
  results: AgentResult[],
): string {
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const totalTime = Math.max(...results.map((r) => r.durationMs));
  const allPassed = results.every((r) => r.success);

  let report = `# ${title}\n\n`;
  report += `> 產生時間: ${new Date().toLocaleString('zh-TW')}\n\n`;
  report += `## 總覽\n\n`;
  report += `| 指標 | 值 |\n|------|----|\n`;
  report += `| 狀態 | ${allPassed ? '✅ 全部通過' : '❌ 有失敗項目'} |\n`;
  report += `| Agent 數量 | ${results.length} |\n`;
  report += `| 總耗時 | ${(totalTime / 1000).toFixed(1)}s |\n`;
  report += `| 總成本 | $${totalCost.toFixed(4)} |\n\n`;

  for (const r of results) {
    report += `## ${r.success ? '✅' : '❌'} ${r.name}\n\n`;
    report += `- 耗時: ${(r.durationMs / 1000).toFixed(1)}s\n`;
    report += `- 成本: $${r.costUsd.toFixed(4)}\n\n`;
    if (r.errors.length > 0) {
      report += `### 錯誤\n\n`;
      for (const err of r.errors) {
        report += `- ${err}\n`;
      }
      report += '\n';
    }
    if (r.output.trim()) {
      report += `### 輸出\n\n${r.output.trim()}\n\n`;
    }
    report += '---\n\n';
  }

  return report;
}
