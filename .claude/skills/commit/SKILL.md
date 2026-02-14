---
name: commit
description: 智能分析當前變更並生成規範的 Git commit message，然後執行 commit
argument-hint: [message hint]
---

請依照以下步驟執行 Git commit：

## 步驟一：分析現況

並行執行以下指令：
- `git status` — 確認暫存與未暫存的變更
- `git diff` — 查看未暫存的詳細差異
- `git diff --staged` — 查看已暫存的詳細差異
- `git log --oneline -10` — 了解本 repo 的 commit 風格

## 步驟二：草擬 commit message

依據變更內容，選擇最貼切的類型前綴：

| 類型 | 用途 |
|------|------|
| `feat` | 新增功能 |
| `fix` | 修復 bug |
| `refactor` | 重構（不影響行為） |
| `style` | 樣式/格式調整 |
| `docs` | 文件更新 |
| `test` | 測試相關 |
| `chore` | 建置設定、依賴更新等 |
| `perf` | 效能改善 |

格式：`<type>: <簡短說明>（中文或英文，50字以內）`

若有傳入 `$ARGUMENTS`，請作為輔助提示而非直接使用。

## 步驟三：暫存並 commit

1. 將相關的未暫存檔案加入暫存（優先 `git add` 特定檔案，避免 `git add -A` 誤含敏感檔案如 `.env`）
2. 執行 commit，格式如下：

```
git commit -m "$(cat <<'EOF'
<type>: <commit message>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

3. 執行 `git status` 確認 commit 成功

## 注意事項

- **禁止** 使用 `--no-verify` 跳過 hooks
- **禁止** 修改 git config
- **禁止** commit `.env`、credentials、secrets 等敏感檔案
- 若 pre-commit hook 失敗，修復問題後重新 commit（勿使用 `--amend`）
- 若使用者未明確要求 push，僅執行 commit
