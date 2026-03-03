/**
 * DB Migration 驗證工作流
 *
 * 流程：
 *   1. 掃描最新的 migration 檔案
 *   2. db-migrator Agent 執行預檢查（語法、RLS、命名規範）
 *   3. 執行 verify_data_integrity() 驗證資料完整性
 *   4. 匯總報告
 *
 * 使用方式：
 *   npm run agents:migrate                           — 掃描所有 migration
 *   npm run agents:migrate -- --file 20260303_xxx.sql — 指定檔案
 */
import { runAgent, logger, saveReport, formatTimestamp, formatSummaryReport } from '../utils';

export async function runMigrateWorkflow(): Promise<void> {
  logger.header('🗄️  DB Migration 驗證工作流');

  const startTime = Date.now();

  // 解析 --file 參數
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const targetFile = fileIndex !== -1 && fileIndex + 1 < args.length
    ? args[fileIndex + 1]
    : null;

  const fileHint = targetFile
    ? `請重點檢查以下 migration 檔案：${targetFile}`
    : '請掃描 supabase/migrations/ 中所有 migration 檔案';

  // 啟動 db-migrator Agent
  logger.info('啟動 db-migrator Agent...\n');

  const migrateResult = await runAgent(
    'db-migrator',
    `${fileHint}

請執行以下檢查：
1. SQL 語法與 RLS 政策命名規範（{table}_{operation}_{scope}_policy）
2. 所有表的 RLS 覆蓋完整性
3. FK 約束完整性
4. 嘗試呼叫 verify_data_integrity() RPC 並分析結果（如果可用）
5. 檢查 migration 是否與 src/types/database.types.ts 同步

輸出完整報告。`,
  );

  const totalTime = Date.now() - startTime;

  // 匯總報告
  logger.divider();
  logger.header('📊 Migration 驗證結果');

  const icon = migrateResult.success ? '✅' : '❌';
  logger.info(
    `${icon} db-migrator  ${(migrateResult.durationMs / 1000).toFixed(1)}s  $${migrateResult.costUsd.toFixed(4)}`,
  );

  logger.divider();
  logger.info(`總耗時: ${(totalTime / 1000).toFixed(1)}s`);

  if (migrateResult.success) {
    logger.success('Migration 驗證通過！');
  } else {
    logger.error('Migration 驗證發現問題，請檢查上方輸出。');
  }

  // 儲存報告
  const report = formatSummaryReport('DB Migration 驗證報告', [migrateResult]);
  const filename = `migrate-${formatTimestamp()}.md`;
  saveReport(filename, report);
}
