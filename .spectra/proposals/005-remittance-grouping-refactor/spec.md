# Spec: 匯款分組（Remittance Grouping）完整重構

spec-id: 005-remittance-grouping-refactor
版本：1.0
最後更新：2026-03-06

## 功能需求

### 必要（Must Have）

- FR-1: 抽取共用推導函數 `deriveRemitteeInfo(kol, bankInfo)` → `{ groupKey, displayName, isCompanyAccount, isWithholdingExempt }`
  - groupKey 規則：有帳號 → `acct_{accountNumber}`；無帳號但有 kol_id → `kol_{kol_id}`；都沒有 → `personal_{submitted_by}` 或 `vendor_{vendor_name}`
  - displayName 規則：公司戶 → companyAccountName || kol.name；個人戶 → personalAccountName || real_name || kol.name
  - 工作台和確認清單都必須呼叫此函數

- FR-2: 確認清單 `groupItemsByRemittance()` 改為 normalize + group 兩階段
  - Phase 1 (normalize)：每個 item 不論 source_type，統一輸出 `NormalizedRemitteeItem`
  - Phase 2 (group)：用單一邏輯按 groupKey 歸組

- FR-3: 工作台 `groupByRemittee()` 改用 `deriveRemitteeInfo()` 取代現有 `deriveAccountInfo()`
  - groupKey 邏輯與確認清單一致
  - 保留工作台特有的含稅計算（營業稅 5%）和 merge_groups 邏輯

- FR-4: `aggregateMonthlyRemittanceGroups()` 修正 settings 讀取邏輯
  - mergedMap 的 key 改用 groupKey（帳號優先），不再用 remittanceName
  - savedSetting 查詢改用 groupKey 而非 remittanceName
  - 只從同一確認清單讀取 settings，不跨確認清單

- FR-5: settings key 遷移
  - 現有 `remittance_settings` 的 key（remittanceName）需轉換為 groupKey
  - 前端儲存 settings 時改用 groupKey

- FR-6: 代扣門檻保護維持現有行為
  - savedSetting 有效但尊重法定門檻（金額未達不扣）
  - 自動計算邏輯不變

### 可選（Nice to Have）

- FR-N1: 對 groupKey 一致性的單元測試（確保同帳號不同名稱仍產生相同 key）
- FR-N2: 為未來 Phase 2（remittee 實體）預留介面擴充點

## 技術規格

### 資料模型

新增共用型別（`src/lib/payments/types.ts`）：

```typescript
/** 統一推導結果 */
interface RemitteeInfo {
  groupKey: string        // acct_{accountNumber} | kol_{kol_id} | personal_{userId} | vendor_{name}
  displayName: string     // 顯示用名稱
  bankName: string
  branchName: string
  accountNumber: string
  isCompanyAccount: boolean
  isWithholdingExempt: boolean
}

/** normalize 階段的中間型別 */
interface NormalizedRemitteeItem {
  originalItem: PaymentConfirmationItem
  remitteeInfo: RemitteeInfo
  amount: number
  sourceType: 'personal' | 'quotation' | 'project'
}
```

### 修改的現有型別

- `RemittanceGroup`：新增 `groupKey: string` 欄位
- `MergedRemittanceGroup`：新增 `groupKey: string` 欄位
- `RemittanceSettings`：key 從 remittanceName 改為 groupKey（漸進遷移，讀取時兩種 key 都嘗試）

### 前端元件

不新增元件，但以下元件的資料來源會因 groupKey 變更而需確認：
- `PaymentOverviewTab`：使用 `MergedRemittanceGroup.remittanceName` 顯示 → 不變
- `WithholdingTab`：使用 `remittance_settings[key]` → key 改為 groupKey
- 工作台各元件：已使用 `RemitteeGroup.remittance_name` → 改為從 `deriveRemitteeInfo` 取得

## 驗收標準

- [ ] AC-1: 同一帳號的 KOL，即使 name / real_name / companyAccountName 不同，分組結果只有一組
- [ ] AC-2: 無帳號但有 kol_id 的 KOL，即使名稱變動，分組結果不分裂
- [ ] AC-3: 工作台和確認清單對同一筆資料的 groupKey 完全一致
- [ ] AC-4: 確認清單 A 的 remittance_settings 不影響確認清單 B 的代扣計算
- [ ] AC-5: 代扣金額低於法定門檻時，即使 savedSetting.hasTax=true 也不扣稅
- [ ] AC-6: 三種 source_type 的項目都能正確歸戶（用真實 DB 資料驗證）
- [ ] AC-7: 個人報帳項目不出現在勞報區，公司戶項目不出現在個人區
- [ ] AC-8: 既有 remittance_settings 資料能正確讀取（向下相容）
- [ ] AC-9: splitRemittanceGroups 的分類邏輯（個人/公司/員工）與重構前行為一致

## 非功能需求

- 效能：分組計算不得比現有慢（項目數 < 500 時應 < 100ms）
- 安全：不涉及新 API endpoint，無安全風險
- 相容：settings key 遷移期間需向下相容（讀取時同時嘗試舊 key 和新 key）
