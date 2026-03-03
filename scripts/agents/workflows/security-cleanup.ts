/**
 * 安全問題修復工作流
 *
 * Agent:
 *   security-cleanup → 批量修復已知安全問題
 *
 * 使用方式：
 *   npm run agents:security-cleanup  — 掃描並修復所有已知問題
 */
import { runAgent, logger, saveReport, formatTimestamp, formatSummaryReport } from '../utils';

export async function runSecurityCleanupWorkflow(): Promise<void> {
  logger.header('🔒 安全問題修復工作流');

  const startTime = Date.now();

  logger.info('啟動 security-cleanup Agent...\n');

  const cleanupResult = await runAgent(
    'security-cleanup',
    `請掃描並修復以下已知安全問題：

1. **console.log 清理**
   - 掃描 src/ 中所有 console.log
   - 移除輸出業務敏感資料的 console.log（如 payment、user info）
   - 保留 console.error 和開發用的通用 log

2. **HTML Sanitization**
   - 檢查是否有 dangerouslySetInnerHTML 或未過濾的 HTML 輸出
   - 如有，建議使用 DOMPurify / sanitize-html

3. **API 認證一致性**
   - 掃描 src/app/api/ 中所有 route
   - 確認每個 route 都有 Supabase auth 檢查
   - 標記缺少認證的 route

每個修復後執行 \`npx tsc --noEmit\` 確認不破壞型別。
輸出修復清單和驗證結果。`,
  );

  const totalTime = Date.now() - startTime;

  logger.divider();
  logger.header('📊 安全修復結果');

  const icon = cleanupResult.success ? '✅' : '❌';
  logger.info(
    `${icon} security-cleanup  ${(cleanupResult.durationMs / 1000).toFixed(1)}s  $${cleanupResult.costUsd.toFixed(4)}`,
  );

  logger.divider();
  logger.info(`總耗時: ${(totalTime / 1000).toFixed(1)}s`);

  if (cleanupResult.success) {
    logger.success('安全修復完成！');
  } else {
    logger.error('安全修復過程中發生錯誤。');
  }

  const report = formatSummaryReport('安全問題修復報告', [cleanupResult]);
  const filename = `security-cleanup-${formatTimestamp()}.md`;
  saveReport(filename, report);
}
