/**
 * 功能開發工作流 — 在 git worktree 中隔離開發
 *
 * 流程：
 *   1. 讀取規格檔案或詢問使用者要開發什麼功能
 *   2. 建立 git worktree（隔離環境）
 *   3. 啟動 frontend-dev Agent 在 worktree 中開發
 *   4. 完成後提示使用者 review 變更
 *   5. 使用者確認後可 merge 回主分支
 *
 * 使用方式：
 *   npm run agents:develop                          — 互動式輸入
 *   npm run agents:develop -- --spec path/to/spec.md — 從規格檔案讀取
 */
import { execSync } from 'child_process';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { runAgent, logger } from '../utils';
import { PROJECT_ROOT, DEVELOP_CONFIG } from '../config';

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
  try {
    return execSync(cmd, { cwd: cwd ?? PROJECT_ROOT, encoding: 'utf-8' }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`指令執行失敗: ${cmd}\n${message}`);
  }
}

/** 清理 worktree 和分支（用於異常退出時） */
function cleanupWorktree(worktreeDir: string, branchName: string): void {
  try {
    if (fs.existsSync(worktreeDir)) {
      execSync(`git worktree remove --force "${worktreeDir}"`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }
    execSync(`git branch -D "${branchName}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    logger.warn('已自動清理孤立的 worktree 和分支');
  } catch {
    // 清理失敗不阻擋流程，只記錄
    logger.warn(`清理失敗，請手動移除:\n  git worktree remove --force "${worktreeDir}"\n  git branch -D "${branchName}"`);
  }
}

/** 從 --spec 參數讀取規格檔案 */
function readSpecFromArgs(): string | null {
  const args = process.argv.slice(2);
  const specIndex = args.indexOf('--spec');
  if (specIndex === -1 || specIndex + 1 >= args.length) return null;

  const specPath = path.resolve(PROJECT_ROOT, args[specIndex + 1]!);
  if (!fs.existsSync(specPath)) {
    logger.error(`規格檔案不存在: ${specPath}`);
    return null;
  }

  const content = fs.readFileSync(specPath, 'utf-8').trim();
  if (!content) {
    logger.error('規格檔案是空的');
    return null;
  }

  logger.success(`已讀取規格檔案: ${path.relative(PROJECT_ROOT, specPath)}`);
  return content;
}

export async function runDevelopWorkflow(): Promise<void> {
  logger.header('🛠️  功能開發工作流');

  // 1. 取得功能描述（從檔案或互動輸入）
  const specFromFile = readSpecFromArgs();
  const featureDesc = specFromFile ?? await ask('\n📝 請描述要開發的功能:\n> ');

  if (!featureDesc) {
    logger.warn('未輸入功能描述，已取消。');
    rl.close();
    return;
  }

  // 2. 產生 branch 名稱
  const branchSlug = featureDesc
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, DEVELOP_CONFIG.branchSlugMaxLength);
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

  // 註冊 signal handler，確保異常退出時清理 worktree
  const onExit = () => {
    cleanupWorktree(worktreeDir, branchName);
    process.exit(1);
  };
  process.on('SIGINT', onExit);
  process.on('SIGTERM', onExit);

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
    logger.warn('Agent 異常中斷，正在清理 worktree...');
    cleanupWorktree(worktreeDir, branchName);
  } finally {
    // 移除 signal handler
    process.removeListener('SIGINT', onExit);
    process.removeListener('SIGTERM', onExit);
  }

  rl.close();
}
