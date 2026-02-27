/**
 * 品質驗證工作流 — 平行啟動 4 個 Agent 檢查
 *
 * Agent:
 *   1. type-checker  → tsc --noEmit
 *   2. linter        → next lint + prettier --check
 *   3. tester        → jest --coverage
 *   4. security-auditor → RLS / auth / API 安全掃描
 *
 * 完成後匯總報告到 .claude/reports/quality-{timestamp}.md
 */
import { runAgent, logger, saveReport, formatTimestamp, formatSummaryReport } from '../utils';

export async function runQualityWorkflow(): Promise<void> {
  logger.header('🔍 品質驗證工作流');
  logger.info('平行啟動 4 個 Agent...\n');

  const startTime = Date.now();

  // 平行啟動所有檢查 Agent
  const [typeResult, lintResult, testResult, securityResult] = await Promise.all([
    runAgent('type-checker', '請對整個專案執行 TypeScript 型別檢查，分析所有錯誤並提供修復建議。'),
    runAgent('linter', '請執行 ESLint 和 Prettier 檢查，分析所有程式碼風格問題。'),
    runAgent('tester', '請執行所有 Jest 測試並分析覆蓋率報告。'),
    runAgent('security-auditor', '請對專案進行完整的安全稽核，包括 RLS 政策、API route 認證、客戶端安全。'),
  ]);

  const results = [typeResult, lintResult, testResult, securityResult];
  const totalTime = Date.now() - startTime;

  // 匯總報告
  logger.divider();
  logger.header('📊 品質驗證結果摘要');

  const allPassed = results.every((r) => r.success);
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);

  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    logger.info(
      `${icon} ${r.name.padEnd(20)} ${(r.durationMs / 1000).toFixed(1)}s  $${r.costUsd.toFixed(4)}`,
    );
  }

  logger.divider();
  logger.info(`總耗時: ${(totalTime / 1000).toFixed(1)}s（平行執行）`);
  logger.info(`總成本: $${totalCost.toFixed(4)}`);

  if (allPassed) {
    logger.success('所有檢查通過！');
  } else {
    const failed = results.filter((r) => !r.success);
    logger.error(`${failed.length} 個檢查失敗: ${failed.map((r) => r.name).join(', ')}`);
  }

  // 儲存報告
  const report = formatSummaryReport('品質驗證報告', results);
  const filename = `quality-${formatTimestamp()}.md`;
  saveReport(filename, report);
}
