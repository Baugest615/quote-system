/**
 * 共用工具 — Agent 執行（via Claude Code CLI）、報告儲存
 *
 * 使用 `claude -p` 取代 @anthropic-ai/claude-agent-sdk，
 * 直接用 Claude Code 訂閱授權，不需要額外 API key。
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, REPORTS_DIR, MODELS, AGENT_LIMITS } from './config';
import { AGENTS, type AgentName } from './agents';

// Re-export logger（保持外部 API 不變）
export { logger } from './logger';
import { logger } from './logger';

// ─── Agent 執行結果 ───

export interface AgentResult {
  name: string;
  success: boolean;
  output: string;
  costUsd: number;
  durationMs: number;
  errors: string[];
}

// ─── 透過 Claude CLI 執行 ───

function spawnClaude(
  args: string[],
  stdinData: string,
  timeoutMs: number = 300_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    // 透過 stdin 傳送 prompt（避免命令列長度限制）
    proc.stdin.write(stdinData);
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Claude CLI 執行逾時 (${(timeoutMs / 1000).toFixed(0)}s)`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(
          `Claude CLI 退出碼 ${code}${stderr ? '\n' + stderr.trim() : ''}`,
        ));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── 執行單一 Agent ───

export async function runAgent(
  name: AgentName,
  taskPrompt: string,
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
    const modelTier = agentDef.model === 'opus' ? 'opus' : 'sonnet';
    const limits = AGENT_LIMITS[modelTier];
    const model = agentDef.model === 'opus' ? MODELS.thinking : MODELS.execution;

    // 組合完整 prompt（角色指令 + 任務）
    const fullPrompt = [
      '## 角色與指令',
      '',
      agentDef.prompt,
      '',
      '## 任務',
      '',
      taskPrompt,
    ].join('\n');

    const args = [
      '--model', model,
      '--max-turns', String(limits.maxTurns),
      '--output-format', 'text',
      '-p',  // 放最後，從 stdin 讀取 prompt
    ];

    const output = await spawnClaude(args, fullPrompt);

    result.output = output;
    result.success = true;
    result.durationMs = Date.now() - startTime;

    logger.success(
      `${name} 完成 (${(result.durationMs / 1000).toFixed(1)}s)`,
    );
  } catch (err) {
    result.durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errorMsg);
    logger.error(`${name} 失敗: ${errorMsg}`);
  }

  return result;
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
  const totalTime = Math.max(...results.map((r) => r.durationMs));
  const allPassed = results.every((r) => r.success);

  let report = `# ${title}\n\n`;
  report += `> 產生時間: ${new Date().toLocaleString('zh-TW')}\n\n`;
  report += `## 總覽\n\n`;
  report += `| 指標 | 值 |\n|------|----|\n`;
  report += `| 狀態 | ${allPassed ? '✅ 全部通過' : '❌ 有失敗項目'} |\n`;
  report += `| Agent 數量 | ${results.length} |\n`;
  report += `| 總耗時 | ${(totalTime / 1000).toFixed(1)}s |\n\n`;

  for (const r of results) {
    report += `## ${r.success ? '✅' : '❌'} ${r.name}\n\n`;
    report += `- 耗時: ${(r.durationMs / 1000).toFixed(1)}s\n\n`;
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
