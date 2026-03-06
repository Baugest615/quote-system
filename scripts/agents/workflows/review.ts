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
import { PROJECT_ROOT, REVIEW_CONFIG } from '../config';

function exec(cmd: string): string {
  try {
    return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`指令執行失敗: ${cmd}\n${message}`);
  }
}

/** 嘗試取得 git diff，優先用 HEAD，fallback 到 cached */
function getGitDiff(flag: string): string {
  try {
    return exec(`git diff HEAD ${flag}`);
  } catch {
    try {
      return exec(`git diff --cached ${flag}`);
    } catch {
      return '';
    }
  }
}

export async function runReviewWorkflow(): Promise<void> {
  logger.header('📝 Code Review + 測試工作流');

  // 1. 取得 git diff
  logger.info('分析目前的變更...\n');

  const diffStat = getGitDiff('--stat');
  const diffContent = getGitDiff('');
  const changedFiles = getGitDiff('--name-only');

  if (!diffContent) {
    logger.warn('沒有偵測到任何變更（staged 或 unstaged）。');
    logger.info('請先修改一些檔案再執行此工作流。');
    return;
  }

  logger.info('變更摘要:');
  console.log(diffStat);
  logger.divider();

  // 2. 啟動 reviewer Agent — Code Review
  logger.info('Step 1/3: 啟動 Code Review...\n');

  const reviewResult = await runAgent(
    'reviewer',
    `請對以下 git diff 進行 Code Review。

## 變更的檔案
${changedFiles}

## 完整 Diff
\`\`\`diff
${diffContent.slice(0, REVIEW_CONFIG.maxDiffChars)}
\`\`\`

請專注在：邏輯正確性、型別安全、效能、安全性、可維護性。
輸出問題清單，依嚴重程度排列。不要修改任何檔案，只做 review。`,
  );

  // 3. 啟動 tester Agent — 撰寫測試
  logger.info('\nStep 2/3: 撰寫測試...\n');

  const testWriteResult = await runAgent(
    'reviewer',
    `根據以下變更撰寫或更新對應的測試。

## 變更的檔案
${changedFiles}

## Review 結果
${reviewResult.output.slice(0, REVIEW_CONFIG.maxReviewOutputChars)}

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
