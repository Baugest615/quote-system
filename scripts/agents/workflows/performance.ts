/**
 * 性能審計工作流
 *
 * Agent:
 *   performance-auditor → React Query / bundle / DB 查詢性能分析
 *
 * 使用方式：
 *   npm run agents:performance                              — 全面掃描
 *   npm run agents:performance -- --file src/hooks/xxx.ts   — 指定檔案
 */
import { runAgent, logger, saveReport, formatTimestamp, formatSummaryReport } from '../utils';

export async function runPerformanceWorkflow(): Promise<void> {
  logger.header('⚡ 性能審計工作流');

  const startTime = Date.now();

  // 解析 --file 參數
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const targetFile = fileIndex !== -1 && fileIndex + 1 < args.length
    ? args[fileIndex + 1]
    : null;

  const scope = targetFile
    ? `請重點分析以下檔案：${targetFile}`
    : '請對整個專案進行性能審計';

  logger.info('啟動 performance-auditor Agent...\n');

  const perfResult = await runAgent(
    'performance-auditor',
    `${scope}

請執行以下檢查：
1. React Query hooks（src/hooks/）：缺少 .limit()、staleTime 設定、不必要的 refetch
2. Supabase 查詢：全量查詢、缺少索引提示、N+1 問題
3. 元件重新渲染：缺少 useMemo/useCallback 的高頻元件
4. 靜態資源：未使用 next/image、字型預載問題

輸出完整報告，依嚴重程度排列。`,
  );

  const totalTime = Date.now() - startTime;

  logger.divider();
  logger.header('📊 性能審計結果');

  const icon = perfResult.success ? '✅' : '❌';
  logger.info(
    `${icon} performance-auditor  ${(perfResult.durationMs / 1000).toFixed(1)}s  $${perfResult.costUsd.toFixed(4)}`,
  );

  logger.divider();
  logger.info(`總耗時: ${(totalTime / 1000).toFixed(1)}s`);

  if (perfResult.success) {
    logger.success('性能審計完成！');
  } else {
    logger.error('性能審計過程中發生錯誤。');
  }

  const report = formatSummaryReport('性能審計報告', [perfResult]);
  const filename = `performance-${formatTimestamp()}.md`;
  saveReport(filename, report);
}
