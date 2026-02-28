/**
 * Code Review + 測試工作流 — Sequential pipeline
 *
 * 流程：
 *   1. 讀取目前 git diff（未 commit 的變更）
 *   2. reviewer Agent 執行 code review → 問題清單
 *   3. tester Agent 根據變更撰寫/更新測試
 *   4. 執行測試確認通過
 *   5. 匯總報告
 */
import { execSync } from 'child_process';
import { runAgent, logger, saveReport, formatTimestamp, formatSummaryReport } from '../utils';
import { PROJECT_ROOT } from '../config';

function exec(cmd: string): string {
  return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim();
}

export async function runReviewWorkflow(): Promise<void> {
  logger.header('📝 Code Review + 測試工作流');

  // 1. 取得 git diff
  logger.info('分析目前的變更...\n');

  let diffStat: string;
  let diffContent: string;

  try {
    // 包含 staged + unstaged 的變更
    diffStat = exec('git diff HEAD --stat');
    diffContent = exec('git diff HEAD');
  } catch {
    // 如果 HEAD 不存在（空 repo），使用 staged changes
    diffStat = exec('git diff --cached --stat');
    diffContent = exec('git diff --cached');
  }

  if (!diffContent) {
    logger.warn('沒有偵測到任何變更（staged 或 unstaged）。');
    logger.info('請先修改一些檔案再執行此工作流。');
    return;
  }

  logger.info('變更摘要:');
  console.log(diffStat);
  logger.divider();

  // 取得變更的檔案清單
  let changedFiles: string;
  try {
    changedFiles = exec('git diff HEAD --name-only');
  } catch {
    changedFiles = exec('git diff --cached --name-only');
  }

  // 2. 啟動 reviewer Agent — Code Review
  logger.info('Step 1/3: 啟動 Code Review...\n');

  const reviewResult = await runAgent(
    'reviewer',
    `請對以下 git diff 進行 Code Review。

## 變更的檔案
${changedFiles}

## 完整 Diff
\`\`\`diff
${diffContent.slice(0, 30000)}
\`\`\`

請專注在：邏輯正確性、型別安全、效能、安全性、可維護性。
輸出問題清單，依嚴重程度排列。不要修改任何檔案，只做 review。`,
    {
      // Review 階段只需讀取權限
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
    },
  );

  // 3. 啟動 tester Agent — 撰寫測試
  logger.info('\nStep 2/3: 撰寫測試...\n');

  const testWriteResult = await runAgent(
    'reviewer',
    `根據以下變更撰寫或更新對應的測試。

## 變更的檔案
${changedFiles}

## Review 結果
${reviewResult.output.slice(0, 10000)}

請：
1. 為每個變更的元件/函式撰寫測試
2. 測試檔案放在對應的 \`__tests__/\` 目錄
3. 使用 Jest + @testing-library/react
4. Mock Supabase client
5. 確保測試覆蓋 review 中發現的問題場景`,
  );

  // 4. 執行測試
  logger.info('\nStep 3/3: 執行測試...\n');

  const testRunResult = await runAgent(
    'tester',
    '請執行所有 Jest 測試（npx jest --no-cache），確認測試通過。如果有失敗，分析原因。',
  );

  // 5. 匯總報告
  const results = [reviewResult, testWriteResult, testRunResult];
  const allPassed = results.every((r) => r.success);

  logger.divider();
  logger.header('📊 Review + 測試結果摘要');

  const steps = ['Code Review', '測試撰寫', '測試執行'];
  results.forEach((r, i) => {
    const icon = r.success ? '✅' : '❌';
    logger.info(
      `${icon} ${steps[i]!.padEnd(16)} ${(r.durationMs / 1000).toFixed(1)}s  $${r.costUsd.toFixed(4)}`,
    );
  });

  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  logger.divider();
  logger.info(`總成本: $${totalCost.toFixed(4)}`);

  if (allPassed) {
    logger.success('Code Review + 測試全部通過！');
  } else {
    logger.error('有步驟失敗，請檢查上方輸出。');
  }

  // 儲存報告
  const report = formatSummaryReport('Code Review + 測試報告', results.map((r, i) => ({
    ...r,
    name: steps[i]!,
  })));
  const filename = `review-${formatTimestamp()}.md`;
  saveReport(filename, report);
}
