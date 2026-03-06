# 討論：匯款分組（Remittance Grouping）完整重構

日期：2026-03-06
狀態：進行中

## 背景

匯款分組邏輯是請款系統的核心，負責將已確認的請款項目按收款人歸戶，計算代扣代繳與匯費。
過去兩週內已反覆修復 **至少 7 次**，每次都是補丁式修復：

| 日期 | Commit | 修復內容 |
|------|--------|---------|
| 3/1 | 4c04024 | 重複計算修復 — 過濾條件補上 payment_request_id |
| 3/1 | 7daba87 | 合併組歸戶修復 — 統一 remittance_name + expenses 過濾 |
| 3/3 | e8c4e65 | 免扣優先順序修正 — isExempt 應優先於 savedSetting |
| 3/3 | 3cbe6e3 | 工會免扣邏輯修正 — 只免二代健保，所得稅照扣 |
| 3/5 | c8d22ab | 員工有進項被誤歸勞報區 |
| 3/6 | 66b16dc | 合併組名稱統一繼承父層 remittance_name |
| 3/6 | 38af996 | 改用帳號為 key + 代扣門檻修正 + 公司篩選 trim |

**反覆修復的根因是結構性問題，不是個別 bug。** 需要一次性重構解決。

## 現狀架構弱點

### 弱點 1：分組 key 不穩定（名稱推導每次重算）
- `remittanceName` 從 `bank_info` 動態推導，不持久化
- 同帳號可能因 `companyAccountName` 修改而產生不同名稱
- `remittance_settings` 用名稱做 key，名稱變 → 設定遺失

### 弱點 2：兩套分組邏輯各自維護
- 工作台：`payment-workbench/grouping.ts` → `groupByRemittee()`
- 確認清單：`payments/grouping.ts` → `groupItemsByRemittance()`
- 推導邏輯相似但不完全相同，容易 drift

### 弱點 3：三種 source_type 分別處理
- `personal`（個人報帳）/ `quotation`（新流程）/ 舊流程（payment_requests）
- 每種各自推導名稱、帳號、分類
- 新增 source_type 或修改推導邏輯時必須改三處

### 弱點 4：remittance_settings 跨確認清單汙染
- `aggregateMonthlyRemittanceGroups` 搜尋所有 monthConfirmations 的 settings
- 確認 A 的設定會影響確認 B 的項目（庭米代扣 bug 的根因）
- savedSetting 曾不尊重法定門檻（已修但設計上有缺陷）

### 弱點 5：月份邊界邏輯複雜
- 混合模式：expected_payment_month / claim_month / 確認日期 + 10 日切點
- 無 expected_payment_month 的舊項目 fallback 不可預期

## 關鍵問題

- [ ] 問題 1：分組 key 應該用什麼？帳號 / KOL ID / 持久化的 remittee ID？
- [ ] 問題 2：remittance_settings 應存在哪裡？按確認清單 / 按月份 / 按 remittee？
- [ ] 問題 3：工作台和確認清單的分組邏輯是否應該統一？
- [ ] 問題 4：三種 source_type 的處理應該如何統一？
- [ ] 問題 5：代扣計算邏輯（savedSetting vs 自動）應如何設計？

## 討論紀錄

### Q1: 分組 key 應該用什麼？

**選項 A：帳號（accountNumber）**（現行 3/6 修復）
- 優點：同帳號一定聚合、不受名稱變動影響
- 缺點：無帳號的項目退化為名稱 key；同一人多帳號會被拆分（合理但需 UI 說明）

**選項 B：KOL ID（kol_id）**
- 優點：每個 KOL 唯一、不受帳號/名稱變動影響
- 缺點：個人報帳無 kol_id；同一 KOL 可能有多個帳號（個人+公司），應該分開匯款

**選項 C：引入 remittee（收款方）實體**
- 優點：完全解耦，收款方有獨立 ID、名稱、帳號
- 缺點：需新增 DB schema、migration、data migration；工程量最大
- 長期最乾淨，但短期 ROI 不高

**建議結論**：**選項 A（帳號）為主、選項 B（kol_id）為輔**
- 有帳號 → `acct_{accountNumber}`（同帳號聚合）
- 無帳號但有 kol_id → `kol_{kol_id}`（防止名稱變動分裂）
- 都沒有（個人報帳）→ `personal_{submitted_by}` 或 `vendor_{vendor_name}`
- 選項 C 留作未來 Phase 2（如需求明確再做）

→ **等待使用者確認**

### Q2: remittance_settings 應存在哪裡？

**現況**：存在 `payment_confirmations.remittance_settings`（JSONB），key = remittanceName

**問題**：
1. 跨確認清單汙染（確認 A 的設定被套用到確認 B）
2. 名稱變動後設定遺失
3. 無法按月份精確管理

**選項 A：改為按月份獨立存儲**
- 新建 `monthly_remittance_settings` 表（month + remittee_key + settings）
- 不再依附於 payment_confirmations
- 優點：完全隔離，月份切換不汙染
- 缺點：需要 migration + data migration

**選項 B：維持現有結構，但修改讀取邏輯**
- savedSetting 只從**最新**確認清單讀取（而非遍歷所有 monthConfirmations）
- 或改為：只從用戶手動修改過的確認清單讀取
- 優點：不需 migration
- 缺點：「最新」的定義模糊；手動/自動的區分需要額外 flag

**選項 C：settings key 改用 accountNumber**
- `remittance_settings[accountNumber]` 而非 `[remittanceName]`
- 搭配 Q1 的帳號 key 方案
- 優點：帳號穩定性高於名稱
- 缺點：無帳號的項目仍需 fallback

**建議結論**：**選項 B（短期）+ 選項 C（key 改帳號）**
- 立即修：讀取邏輯只取**同一確認清單**的 settings，不跨確認清單
- 同時改：settings key 從 remittanceName 改為 groupKey（帳號優先）
- 選項 A 留作 Phase 2

→ **等待使用者確認**

### Q3: 工作台和確認清單的分組邏輯是否應該統一？

**現況**：
- 工作台：`groupByRemittee()` → `RemitteeGroup`（含 merge_groups、含稅計算）
- 確認清單：`groupItemsByRemittance()` → `RemittanceGroup`（純分組）

**選項 A：完全統一（共用核心函數）**
- 抽取 `deriveRemitteeKey(item)` + `deriveDisplayName(item)` 為共用 utility
- 工作台和確認清單各自包裝，但核心推導邏輯一致
- 優點：推導邏輯只維護一份
- 缺點：兩邊資料型別不同（WorkbenchItem vs PaymentConfirmationItem），需 adapter

**選項 B：維持獨立，但共享推導函數**
- `deriveRemitteeInfo(kol, bankInfo)` 共用
- 各自的分組邏輯保持獨立
- 優點：改動量較小、風險較低
- 缺點：仍有 drift 風險

**建議結論**：**選項 B** — 共享推導函數，分組邏輯保持獨立
- 抽取 `deriveRemitteeInfo(kol, bankInfo)` → `{ key, displayName, bankType, isCompany }`
- 工作台和確認清單都呼叫這個函數
- 分組容器（Map 結構）各自維護

→ **等待使用者確認**

### Q4: 三種 source_type 的處理應該如何統一？

**現況**：`groupItemsByRemittance` 中 `personal` / `quotation` / 舊流程 各有 20-30 行邏輯

**選項 A：統一前處理（normalize → group）**
- 先將三種 source_type 的 item 統一 normalize 為 `{ key, displayName, bankInfo, amount }`
- 然後用單一分組邏輯處理
- 優點：分組邏輯只寫一次
- 缺點：normalize 函數可能一樣複雜

**選項 B：維持分支但精簡**
- 保持 if/else 分支，但共用 `deriveRemitteeInfo`
- 分支中只處理「取得 KOL 和 bankInfo 的方式」不同的部分
- 優點：邏輯清晰、好 debug
- 缺點：仍有重複

**建議結論**：**選項 A** — normalize + group 兩階段
- Phase 1: normalize 函數提取每個 item 的 `{ kolId, kol, bankInfo, amount, sourceType }`
- Phase 2: 統一的分組邏輯

→ **等待使用者確認**

### Q5: 代扣計算邏輯（savedSetting vs 自動）應如何設計？

**現況**：
- `savedSetting` 存在 → 直接用（剛修：加了門檻檢查）
- `savedSetting` 不存在 → 按 paymentDate 分日計算門檻

**問題**：
1. savedSetting 來自哪個確認清單不明確
2. 門檻是法定的，但 hasTax 是人工標記，兩者混合容易出錯
3. 代扣代繳 tab 和匯款總覽 tab 使用同一計算但顯示不一致

**選項 A：完全自動計算，hasTax/hasInsurance 改為「覆寫」而非「標記」**
- 自動算門檻 → 得出 hasTax (auto)
- 使用者可覆寫：hasTax (override: true/false/auto)
- 三態比二態更精確
- 優點：自動計算永遠正確，使用者覆寫有明確語意
- 缺點：UI 需改三態 toggle

**選項 B：維持二態但加門檻保護**
- 就是現在的修復方案：savedSetting 有效但尊重門檻
- 優點：改動最小
- 缺點：hasTax=true 但金額低於門檻 → 靜默不扣，使用者可能困惑

**建議結論**：**選項 B（短期維持）**，Phase 2 再考慮選項 A
- 門檻保護已修，短期足夠
- 三態 toggle 是更好的設計但工程量不小

→ **等待使用者確認**

## 收斂結論

待使用者對 Q1-Q5 確認後收斂。

## 下一步

→ 使用者確認 5 個問題的方向後，執行 `/spectra propose` 產出正式規格
