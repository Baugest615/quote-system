---
name: pr
description: 分析當前分支的所有變更，自動生成完整的 Pull Request 並用 gh CLI 建立
argument-hint: [base branch]
---

請依照以下步驟建立 Pull Request。

## 步驟一：分析分支狀態

並行執行：
- `git status` — 確認工作區狀態
- `git branch --show-current` — 取得當前分支名稱
- `git log main...HEAD --oneline` — 列出所有待 merge 的 commits
- `git diff main...HEAD --stat` — 查看變更檔案統計

若使用者有傳入 `$ARGUMENTS`，以其作為 base branch（預設為 `main`）。

## 步驟二：推送分支（若尚未推送）

```bash
git push -u origin <current-branch>
```

## 步驟三：草擬 PR 內容

依據所有 commits 與 diff，撰寫：

**標題**（70 字以內，英文或中文）：
- 格式：`<type>: <簡短說明>`
- 類型同 commit 規範（feat/fix/refactor/chore 等）

**描述**（Markdown 格式）：
```
## Summary
- （3 點以內，說明「做了什麼」與「為什麼」）

## Changes
- （條列主要變更的檔案與功能）

## Test Plan
- [ ] （測試步驟或驗證方式）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 步驟四：建立 PR

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

## 步驟五：回傳結果

顯示 PR 的 URL 讓使用者直接點開。

## 注意事項

- 禁止 force push 到 main/master
- 若 gh 未安裝或未登入，提示使用者先執行 `gh auth login`
- 若已有開啟中的 PR，提示使用者是否要更新現有 PR
