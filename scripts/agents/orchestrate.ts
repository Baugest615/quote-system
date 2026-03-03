#!/usr/bin/env tsx
/**
 * Quote System — 多 Agent 協作框架 主入口
 *
 * 使用方式：
 *   npm run agents                                       — 互動式選單
 *   npm run agents:quality                               — 品質驗證
 *   npm run agents:develop                               — 功能開發（互動輸入）
 *   npm run agents:develop -- --spec .claude/specs/xx.md — 功能開發（讀取規格檔）
 *   npm run agents:review                                — Code Review + 測試
 *   npm run agents:migrate                               — DB Migration 驗證
 *   npm run agents:performance                           — 性能審計
 *   npm run agents:security-cleanup                      — 安全問題修復
 */
import readline from 'readline';
import { logger } from './utils';
import { runQualityWorkflow } from './workflows/quality';
import { runDevelopWorkflow } from './workflows/develop';
import { runReviewWorkflow } from './workflows/review';
import { runMigrateWorkflow } from './workflows/migrate';
import { runPerformanceWorkflow } from './workflows/performance';
import { runSecurityCleanupWorkflow } from './workflows/security-cleanup';

const MENU = `
╔══════════════════════════════════════╗
║   Quote System — Agent 協作框架      ║
╠══════════════════════════════════════╣
║  1. 品質驗證 (Quality Check)         ║
║  2. 功能開發 (Feature Development)   ║
║  3. Code Review + 測試               ║
║  4. DB Migration 驗證                ║
║  5. 性能審計 (Performance Audit)     ║
║  6. 安全修復 (Security Cleanup)      ║
║  q. 離開                             ║
╚══════════════════════════════════════╝`;

type WorkflowName = 'quality' | 'develop' | 'review' | 'migrate' | 'performance' | 'security-cleanup';

const WORKFLOWS: Record<WorkflowName, () => Promise<void>> = {
  quality: runQualityWorkflow,
  develop: runDevelopWorkflow,
  review: runReviewWorkflow,
  migrate: runMigrateWorkflow,
  performance: runPerformanceWorkflow,
  'security-cleanup': runSecurityCleanupWorkflow,
};

/** 從命令列參數解析工作流名稱 */
function parseArgs(): WorkflowName | null {
  const arg = process.argv[2]?.toLowerCase();
  if (arg && arg in WORKFLOWS) {
    return arg as WorkflowName;
  }
  // 支援數字選擇
  if (arg === '1') return 'quality';
  if (arg === '2') return 'develop';
  if (arg === '3') return 'review';
  if (arg === '4') return 'migrate';
  if (arg === '5') return 'performance';
  if (arg === '6') return 'security-cleanup';
  return null;
}

/** 互動式選單 */
async function interactiveMenu(): Promise<void> {
  console.log(MENU);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const choice = await new Promise<string>((resolve) => {
    rl.question('\n選擇工作流 > ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });

  switch (choice) {
    case '1':
    case 'quality':
      await runQualityWorkflow();
      break;
    case '2':
    case 'develop':
      await runDevelopWorkflow();
      break;
    case '3':
    case 'review':
      await runReviewWorkflow();
      break;
    case '4':
    case 'migrate':
      await runMigrateWorkflow();
      break;
    case '5':
    case 'performance':
      await runPerformanceWorkflow();
      break;
    case '6':
    case 'security-cleanup':
      await runSecurityCleanupWorkflow();
      break;
    case 'q':
    case 'quit':
    case 'exit':
      logger.info('已離開。');
      break;
    default:
      logger.warn(`無效的選擇: "${choice}"`);
      break;
  }
}

/** 檢查 Claude Agent SDK 是否可用 */
async function checkSDKAvailability(): Promise<boolean> {
  try {
    await import('@anthropic-ai/claude-agent-sdk');
    return true;
  } catch {
    return false;
  }
}

/** 主程式 */
async function main(): Promise<void> {
  // 檢查 SDK 是否已安裝
  const sdkAvailable = await checkSDKAvailability();
  if (!sdkAvailable) {
    logger.error('Claude Agent SDK 未安裝，請執行: npm install @anthropic-ai/claude-agent-sdk');
    process.exit(1);
  }

  // 檢查環境授權
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_USE_BEDROCK) {
    logger.warn('未設定 ANTHROPIC_API_KEY 環境變數');
    logger.info('SDK 將嘗試使用 Claude Code CLI 的現有授權...');
    // 嘗試驗證 CLI 授權是否可用
    try {
      const { execSync } = await import('child_process');
      execSync('claude --version', { stdio: 'pipe' });
    } catch {
      logger.error('Claude Code CLI 也無法使用，請設定 ANTHROPIC_API_KEY 或安裝 Claude Code CLI');
      process.exit(1);
    }
  }

  // 命令列直接指定工作流
  const workflow = parseArgs();
  if (workflow) {
    await WORKFLOWS[workflow]();
    return;
  }

  // 互動式選單
  await interactiveMenu();
}

main().catch((err) => {
  logger.error(`未預期的錯誤: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
