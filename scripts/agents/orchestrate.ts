#!/usr/bin/env tsx
/**
 * Quote System — 多 Agent 協作框架 主入口
 *
 * 使用方式：
 *   npm run agents            — 互動式選單
 *   npm run agents:quality    — 品質驗證
 *   npm run agents:develop    — 功能開發
 *   npm run agents:review     — Code Review + 測試
 */
import readline from 'readline';
import { logger } from './utils';
import { runQualityWorkflow } from './workflows/quality';
import { runDevelopWorkflow } from './workflows/develop';
import { runReviewWorkflow } from './workflows/review';

const MENU = `
╔══════════════════════════════════════╗
║   Quote System — Agent 協作框架      ║
╠══════════════════════════════════════╣
║  1. 品質驗證 (Quality Check)         ║
║  2. 功能開發 (Feature Development)   ║
║  3. Code Review + 測試               ║
║  q. 離開                             ║
╚══════════════════════════════════════╝`;

type WorkflowName = 'quality' | 'develop' | 'review';

const WORKFLOWS: Record<WorkflowName, () => Promise<void>> = {
  quality: runQualityWorkflow,
  develop: runDevelopWorkflow,
  review: runReviewWorkflow,
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

/** 主程式 */
async function main(): Promise<void> {
  // 檢查環境
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_USE_BEDROCK) {
    logger.warn('未設定 ANTHROPIC_API_KEY 環境變數');
    logger.info('SDK 將嘗試使用 Claude Code CLI 的現有授權');
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
