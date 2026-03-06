import { deriveRemitteeInfo, makeGroupKey, derivePersonalClaimInfo } from '../remittee'

describe('deriveRemitteeInfo', () => {
  it('同帳號不同名稱產生相同 groupKey (AC-1)', () => {
    const kol1 = { id: 'kol-1', name: '藝名A', real_name: '本名', bank_info: { bankType: 'individual', personalAccountName: '本名', bankName: '中國信託', accountNumber: '1234567890' } }
    const kol2 = { id: 'kol-1', name: '藝名B', real_name: '本名改', bank_info: { bankType: 'individual', personalAccountName: '本名改', bankName: '中國信託', accountNumber: '1234567890' } }

    const info1 = deriveRemitteeInfo(kol1)
    const info2 = deriveRemitteeInfo(kol2)

    expect(info1.groupKey).toBe('acct_1234567890')
    expect(info1.groupKey).toBe(info2.groupKey)
  })

  it('無帳號有 kol_id 使用 kol_xxx key (AC-2)', () => {
    const kol = { id: 'kol-abc', name: '某某KOL', bank_info: { bankType: 'individual' } }
    const info = deriveRemitteeInfo(kol)

    expect(info.groupKey).toBe('kol_kol-abc')
    expect(info.displayName).toBe('某某KOL')
  })

  it('無帳號無 kol_id fallback 到名稱', () => {
    const kol = { name: '臨時KOL', bank_info: {} }
    const info = deriveRemitteeInfo(kol)

    expect(info.groupKey).toBe('name_臨時KOL')
  })

  it('公司戶 displayName 優先取 companyAccountName', () => {
    const kol = {
      id: 'kol-1',
      name: '娜柴',
      real_name: '陳湘菱',
      bank_info: {
        bankType: 'company',
        companyAccountName: '娜柴工作室',
        bankName: '台新銀行',
        accountNumber: '9876543210',
      },
    }
    const info = deriveRemitteeInfo(kol)

    expect(info.displayName).toBe('娜柴工作室')
    expect(info.isCompanyAccount).toBe(true)
    expect(info.groupKey).toBe('acct_9876543210')
  })

  it('個人戶 displayName fallback: personalAccountName → real_name → name', () => {
    // 有 personalAccountName
    const kol1 = { id: 'k1', name: '藝名', real_name: '本名', bank_info: { bankType: 'individual', personalAccountName: '戶名' } }
    expect(deriveRemitteeInfo(kol1).displayName).toBe('戶名')

    // 無 personalAccountName，有 real_name
    const kol2 = { id: 'k2', name: '藝名', real_name: '本名', bank_info: { bankType: 'individual' } }
    expect(deriveRemitteeInfo(kol2).displayName).toBe('本名')

    // 都沒有
    const kol3 = { id: 'k3', name: '藝名', bank_info: { bankType: 'individual' } }
    expect(deriveRemitteeInfo(kol3).displayName).toBe('藝名')
  })

  it('kol 為 null 時回傳預設值', () => {
    const info = deriveRemitteeInfo(null)

    expect(info.displayName).toBe('未知匯款戶名')
    expect(info.groupKey).toBe('name_未知匯款戶名')
    expect(info.isCompanyAccount).toBe(false)
  })

  it('withholding_exempt 正確傳遞', () => {
    const kol = { id: 'k1', name: 'A', withholding_exempt: true, bank_info: { accountNumber: '111' } }
    expect(deriveRemitteeInfo(kol).isWithholdingExempt).toBe(true)

    const kol2 = { id: 'k2', name: 'B', bank_info: { accountNumber: '222' } }
    expect(deriveRemitteeInfo(kol2).isWithholdingExempt).toBe(false)
  })

  it('可傳入外部 rawBankInfo 覆蓋 kol.bank_info', () => {
    const kol = { id: 'k1', name: 'A', bank_info: { bankType: 'individual', accountNumber: '111' } }
    const override = { bankType: 'company', companyAccountName: '公司', accountNumber: '999' }
    const info = deriveRemitteeInfo(kol, override)

    expect(info.groupKey).toBe('acct_999')
    expect(info.isCompanyAccount).toBe(true)
    expect(info.displayName).toBe('公司')
  })
})

describe('makeGroupKey', () => {
  it('帳號優先', () => {
    expect(makeGroupKey('12345', 'kol-1', '名稱')).toBe('acct_12345')
  })

  it('無帳號用 kol_id', () => {
    expect(makeGroupKey(undefined, 'kol-1', '名稱')).toBe('kol_kol-1')
  })

  it('都沒有用名稱', () => {
    expect(makeGroupKey(undefined, undefined, '名稱')).toBe('name_名稱')
  })
})

describe('derivePersonalClaimInfo', () => {
  it('外部廠商使用 vendor key', () => {
    const result = derivePersonalClaimInfo('張三', '某某公司', 'user-1')
    expect(result.groupKey).toBe('vendor_某某公司')
    expect(result.displayName).toBe('某某公司')
  })

  it('廠商名稱與提交人相同視為自己報帳', () => {
    const result = derivePersonalClaimInfo('張三', '張三', 'user-1')
    expect(result.groupKey).toBe('personal_user-1')
    expect(result.displayName).toBe('張三')
  })

  it('無廠商名稱使用提交人', () => {
    const result = derivePersonalClaimInfo('張三', null, 'user-1')
    expect(result.groupKey).toBe('personal_user-1')
    expect(result.displayName).toBe('張三')
  })

  it('都沒有 fallback 到預設', () => {
    const result = derivePersonalClaimInfo(null, null, null)
    expect(result.groupKey).toBe('personal_個人報帳')
    expect(result.displayName).toBe('個人報帳')
  })
})
