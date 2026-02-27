/**
 * 功能開發工作流 — 在 git worktree 中隔離開發
 *
 * 流程：
 *   1. 詢問使用者要開發什麼功能
 *   2. 建立 git worktree（隔離環境）
 *   3. 啟動 frontend-dev Agent 在 worktree 中開發
 *   4. 完成後提示使用者 review 變更
 *   5. 使用者確認後可 merge 回主分支
 */
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import { runAgent, logger } from '../utils';
import { PROJECT_ROOT } from '../config';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd: cwd ?? PROJECT_ROOT, encoding: 'utf-8' }).trim();
}

export async function runDevelopWorkflow(): Promise<void> {
  logger.header('🛠️  功能開發工作流');

  // 1. 詢問功能描述
  const featureDesc = await ask('\n📝 請描述要開發的功能:\n> ');
  if (!featureDesc) {
    logger.warn('未輸入功能描述，已取消。');
    rl.close();
    return;
  }

  // 2. 產生 branch 名稱
  const branchSlug = featureDesc
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const branchName = `agent/feature-${branchSlug}-${Date.now().toString(36)}`;
  const worktreeDir = path.join(PROJECT_ROOT, '.claude', 'worktrees', branchSlug);

  logger.info(`分支名稱: ${branchName}`);
  logger.info(`Worktree: ${path.relative(PROJECT_ROOT, worktreeDir)}`);

  // 3. 建立 worktree
  try {
    exec(`git worktree add -b "${branchName}" "${worktreeDir}" HEAD`);
    logger.success('Worktree 建立完成');
  } catch (err) {
    logger.error(`建立 worktree 失敗: ${err instanceof Error ? err.message : err}`);
    rl.close();
    return;
  }

  // 4. 啟動 frontend-dev Agent
  logger.info('啟動 frontend-dev Agent...\n');

  try {
    const result = await runAgent(
      'frontend-dev',
      `請在此 worktree 中開發以下功能：\n\n${featureDesc}\n\n完成後請描述你做了哪些變更。`,
      { cwd: worktreeDir },
    );

    logger.divider();

    if (result.success) {
      logger.success('開發完成！');
      logger.info(`成本: $${result.costUsd.toFixed(4)}`);

      // 5. 顯示變更
      try {
        const diff = exec('git diff --stat', worktreeDir);
        if (diff) {
          logger.header('📄 變更摘要');
          console.log(diff);
        }
      } catch {
        // 可能沒有變更
      }

      // 6. 提示 review
      logger.divider();
      logger.info(`Worktree 位置: ${worktreeDir}`);
      logger.info('你可以：');
      logger.info(`  cd "${worktreeDir}" — 查看變更`);
      logger.info(`  git -C "${worktreeDir}" diff — 檢視詳細差異`);
      logger.info(`  git -C "${worktreeDir}" log --oneline — 查看 commit`);

      const action = await ask('\n要如何處理？ [m]erge / [k]eep worktree / [d]elete worktree: ');

      switch (action.toLowerCase()) {
        case 'm':
        case 'merge': {
          const currentBranch = exec('git branch --show-current');
          try {
            exec(`git merge "${branchName}"`, PROJECT_ROOT);
            logger.success(`已將 ${branchName} merge 到 ${currentBranch}`);
            // 清理 worktree
            exec(`git worktree remove "${worktreeDir}"`);
            exec(`git branch -d "${branchName}"`);
            logger.success('Worktree 已清理');
          } catch (mergeErr) {
            logger.error(`Merge 失敗，worktree 保留在 ${worktreeDir}`);
            logger.info('請手動解決衝突後 merge');
          }
          break;
        }
        case 'd':
        case 'delete': {
          exec(`git worktree remove --force "${worktreeDir}"`);
          exec(`git branch -D "${branchName}"`);
          logger.success('Worktree 已刪除');
          break;
        }
        default: {
          logger.info(`Worktree 保留在: ${worktreeDir}`);
          logger.info(`分支: ${branchName}`);
          break;
        }
      }
    } else {
      logger.error('開發過程中發生錯誤');
      for (const err of result.errors) {
        logger.error(`  - ${err}`);
      }
    }
  } catch (err) {
    logger.error(`Agent 執行失敗: ${err instanceof Error ? err.message : err}`);
  }

  rl.close();
}
