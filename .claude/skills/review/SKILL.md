---
name: review
description: 對當前的程式碼變更進行全面的 code review，包含邏輯、效能、安全性與可維護性
argument-hint: [focus area]
context: fork
agent: Explore
---

請對目前的程式碼變更進行全面的 Code Review。

## 取得變更內容

執行以下指令取得審查範圍：
- `git diff HEAD` — 所有未 commit 的變更
- `git diff main...HEAD` — 與 main 分支的完整差異（如在 feature branch）
- `git status` — 確認整體狀態

若有傳入 `$ARGUMENTS`（如特定功能或關注點），請優先針對該方向深入審查。

## 審查面向

### 🐛 正確性
- 邏輯是否有錯誤或邊界條件未處理
- 非同步操作是否正確處理（Promise、async/await、競態條件）
- 型別安全（TypeScript 型別是否正確、有無 `any` 濫用）
- 資料流是否符合預期

### ⚡ 效能
- 不必要的重複渲染（React useEffect 依賴、useMemo/useCallback 使用時機）
- N+1 查詢問題
- 大型資料結構操作效率

### 🔒 安全性
- SQL Injection / XSS / CSRF 風險
- 敏感資料是否外露（API keys、密碼等）
- 存取控制與權限驗證是否完整
- 輸入驗證是否充分

### 🔐 Supabase RLS 安全（quote-system 專用）
- 新增/修改的資料表是否啟用 RLS
- RLS 政策是否遵循 CLAUDE.md 中的模板（`{table}_{operation}_{scope}_policy`）
- 是否使用 `get_my_role()` 而非直接查詢 profiles 表（避免 RLS 無限遞迴）
- 權限分級是否正確（Admin/Editor/Member）
- search_path 是否設為 `''` 防止劫持
- JSONB 欄位（bank_info）是否使用 camelCase keys

### 🧹 可維護性
- 程式碼是否過於複雜（建議簡化）
- 重複程式碼是否需要抽象化
- 命名是否清晰易懂
- 是否有不必要的副作用

### 🎨 風格一致性
- 是否符合專案現有的程式碼風格
- Import 順序與結構
- 元件/函式設計是否與既有架構一致

## 輸出格式

以清晰的 Markdown 呈現：

1. **總覽** — 變更目的與整體評估（1-3 句）
2. **問題清單** — 依嚴重度排列（🔴 必修 / 🟡 建議 / 🔵 可選優化）
3. **優點** — 值得肯定的做法
4. **修正建議** — 針對必修問題提供具體的修改方式或程式碼片段

若無問題，請說明「✅ 無明顯問題，可以 merge」。
