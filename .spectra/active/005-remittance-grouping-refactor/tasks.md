# Tasks: 匯款分組（Remittance Grouping）完整重構

spec-id: 005-remittance-grouping-refactor
預估任務數：8
可平行任務：3

## 任務清單

### Phase 1: 共用基礎建設

- [P] T-1: 建立 `deriveRemitteeInfo()` 共用推導函數 — `src/lib/payments/remittee.ts`（新增）
  - 實作 groupKey 三級 fallback：acct → kol → personal/vendor
  - 實作 displayName 推導：公司戶用 companyAccountName、個人戶用 personalAccountName/real_name
  - 匯出 `RemitteeInfo` 型別

- [P] T-2: 擴充共用型別 — `src/lib/payments/types.ts`
  - 新增 `RemitteeInfo` 介面
  - 新增 `NormalizedRemitteeItem` 介面
  - `RemittanceGroup` 新增 `groupKey: string`
  - `MergedRemittanceGroup` 新增 `groupKey: string`

- [P] T-3: 為 `deriveRemitteeInfo()` 撰寫單元測試 — `src/lib/payments/__tests__/remittee.test.ts`（新增）
  - 測試案例：同帳號不同名稱 → 同 groupKey（AC-1）
  - 測試案例：無帳號有 kol_id → kol_xxx key（AC-2）
  - 測試案例：個人報帳 → personal_xxx key
  - 測試案例：外部廠商 → vendor_xxx key
  - 測試案例：公司戶 displayName 優先取 companyAccountName

### Phase 2: 確認清單重構

- [S] T-4: 重構 `groupItemsByRemittance()` — `src/lib/payments/grouping.ts`（依賴 T-1, T-2）
  - 改為 normalize + group 兩階段
  - normalize：三種 source_type 統一輸出 NormalizedRemitteeItem
  - group：用 groupKey 歸組，RemittanceGroup 帶上 groupKey
  - 移除現有的 `deriveDisplayName()` 和 `makeGroupKey()` 內部函數（改用共用版）

- [S] T-5: 修正 `aggregateMonthlyRemittanceGroups()` — `src/lib/payments/aggregation.ts`（依賴 T-4）
  - mergedMap 的 key 改用 groupKey
  - savedSetting 查詢改用 groupKey，fallback 到 remittanceName（向下相容）
  - 只從同一確認清單的 remittance_settings 讀取（移除跨清單搜尋）

### Phase 3: 工作台對齊

- [S] T-6: 工作台改用共用推導函數 — `src/hooks/payment-workbench/grouping.ts`（依賴 T-1）
  - `deriveAccountInfo()` 改為呼叫 `deriveRemitteeInfo()`
  - groupKey 計算邏輯與確認清單一致
  - 保留工作台特有的含稅計算和 merge_groups

### Phase 4: 測試與驗證

- [S] T-7: 更新既有測試 — `src/lib/payments/__tests__/aggregation.test.ts`（依賴 T-5）
  - 更新 mock 資料以反映新的 groupKey 結構
  - 新增跨確認清單 settings 隔離測試（AC-4）
  - 新增門檻保護測試（AC-5）

- [S] T-8: 真實資料模擬驗證 — 臨時腳本（依賴 T-4, T-5, T-6）
  - 用真實 DB 資料跑完整資料流
  - 對比重構前後的分組結果
  - 驗證 AC-6（三種 source_type 正確歸戶）
  - 驗證 AC-7（分類不混淆）
  - 驗證 AC-8（舊 settings 向下相容）

## 標記說明

- `[P]` = Parallel — 可與同 Phase 其他 [P] 任務平行執行
- `[S]` = Sequential — 必須等依賴完成後才能開始
- `( )` = 未開始  `(->)` = 進行中  `(v)` = 已完成  `(x)` = 已取消
