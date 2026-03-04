import {
  kolBankInfoSchema,
  parseKolBankInfo,
  isKolBankInfoComplete,
  clientBankInfoSchema,
  parseSocialLinks,
  parseContacts,
  parseAttachments,
  fileAttachmentSchema,
  sealStampConfigSchema,
  getErrorMessage,
} from '../schemas'

// ==================== KOL 銀行資訊 ====================

describe('kolBankInfoSchema', () => {
  it('解析完整個人帳戶', () => {
    const input = {
      bankType: 'individual',
      personalAccountName: '王小明',
      bankName: '台新銀行',
      branchName: '信義分行',
      accountNumber: '1234567890',
    }
    expect(kolBankInfoSchema.parse(input)).toEqual(input)
  })

  it('解析完整公司帳戶', () => {
    const input = {
      bankType: 'company',
      companyAccountName: '好公司有限公司',
      bankName: '中國信託',
      branchName: '敦南分行',
      accountNumber: '9876543210',
    }
    expect(kolBankInfoSchema.parse(input)).toEqual(input)
  })

  it('所有欄位皆為 optional，空物件也合法', () => {
    expect(kolBankInfoSchema.parse({})).toEqual({})
  })

  it('拒絕無效的 bankType', () => {
    expect(() => kolBankInfoSchema.parse({ bankType: 'invalid' })).toThrow()
  })
})

describe('parseKolBankInfo', () => {
  it('有效資料 → 回傳解析結果', () => {
    expect(parseKolBankInfo({ bankName: '台新銀行' })).toEqual({ bankName: '台新銀行' })
  })

  it('null → 回傳空物件', () => {
    expect(parseKolBankInfo(null)).toEqual({})
  })

  it('undefined → 回傳空物件', () => {
    expect(parseKolBankInfo(undefined)).toEqual({})
  })

  it('不合法資料 → 回傳空物件', () => {
    expect(parseKolBankInfo('not an object')).toEqual({})
  })
})

describe('isKolBankInfoComplete', () => {
  it('個人帳戶完整 → true', () => {
    expect(isKolBankInfoComplete({
      bankType: 'individual',
      personalAccountName: '王小明',
      bankName: '台新銀行',
      accountNumber: '1234567890',
    })).toBe(true)
  })

  it('公司帳戶完整 → true', () => {
    expect(isKolBankInfoComplete({
      bankType: 'company',
      companyAccountName: '好公司有限公司',
      bankName: '中國信託',
      accountNumber: '9876543210',
    })).toBe(true)
  })

  it('缺少 bankType → false', () => {
    expect(isKolBankInfoComplete({
      bankName: '台新銀行',
      accountNumber: '123',
    })).toBe(false)
  })

  it('缺少 bankName → false', () => {
    expect(isKolBankInfoComplete({
      bankType: 'individual',
      personalAccountName: '王小明',
      accountNumber: '123',
    })).toBe(false)
  })

  it('缺少 accountNumber → false', () => {
    expect(isKolBankInfoComplete({
      bankType: 'individual',
      personalAccountName: '王小明',
      bankName: '台新銀行',
    })).toBe(false)
  })

  it('個人帳戶缺少 personalAccountName → false', () => {
    expect(isKolBankInfoComplete({
      bankType: 'individual',
      bankName: '台新銀行',
      accountNumber: '123',
    })).toBe(false)
  })

  it('公司帳戶缺少 companyAccountName → false', () => {
    expect(isKolBankInfoComplete({
      bankType: 'company',
      bankName: '中國信託',
      accountNumber: '123',
    })).toBe(false)
  })

  it('null/undefined → false', () => {
    expect(isKolBankInfoComplete(null)).toBe(false)
    expect(isKolBankInfoComplete(undefined)).toBe(false)
  })
})

// ==================== 客戶銀行資訊 ====================

describe('clientBankInfoSchema', () => {
  it('解析完整資料', () => {
    const input = { bankName: '台新', branchName: '信義', accountNumber: '123' }
    expect(clientBankInfoSchema.parse(input)).toEqual(input)
  })

  it('空物件合法', () => {
    expect(clientBankInfoSchema.parse({})).toEqual({})
  })
})

// ==================== 社群連結 ====================

describe('parseSocialLinks', () => {
  it('有效資料 → 回傳解析結果', () => {
    expect(parseSocialLinks({ instagram: '@test', youtube: '' })).toEqual({
      instagram: '@test',
      youtube: '',
      facebook: '',
      tiktok: '',
      threads: '',
      other: '',
    })
  })

  it('null → 回傳預設空字串', () => {
    const result = parseSocialLinks(null)
    expect(result.instagram).toBe('')
    expect(result.youtube).toBe('')
  })

  it('不合法資料 → 回傳預設', () => {
    expect(parseSocialLinks(42)).toEqual({
      instagram: '',
      youtube: '',
      facebook: '',
      tiktok: '',
      threads: '',
      other: '',
    })
  })
})

// ==================== 聯絡人 ====================

describe('parseContacts', () => {
  it('有效聯絡人陣列', () => {
    const contacts = [
      { id: '1', name: '王先生', email: 'wang@test.com', phone: '', company: '', role: '' },
    ]
    expect(parseContacts(contacts)).toHaveLength(1)
    expect(parseContacts(contacts)[0].name).toBe('王先生')
  })

  it('過濾掉缺少必要欄位的項目', () => {
    const contacts = [
      { id: '1', name: '有效' },
      { noId: true }, // 缺少 id + name
    ]
    expect(parseContacts(contacts)).toHaveLength(1)
  })

  it('非陣列 → 回傳空陣列', () => {
    expect(parseContacts(null)).toEqual([])
    expect(parseContacts('string')).toEqual([])
  })
})

// ==================== 檔案附件 ====================

describe('parseAttachments', () => {
  it('有效附件陣列', () => {
    const attachments = [
      { name: 'file.pdf', url: 'https://example.com/file.pdf', path: '/files/file.pdf', uploadedAt: '2026-01-01', size: 1024 },
    ]
    expect(parseAttachments(attachments)).toHaveLength(1)
  })

  it('過濾不完整附件', () => {
    const attachments = [
      { name: 'valid.pdf', url: 'https://x.com', path: '/x', uploadedAt: '2026-01-01', size: 100 },
      { name: 'missing-size' }, // 缺 required 欄位
    ]
    expect(parseAttachments(attachments)).toHaveLength(1)
  })

  it('非陣列 → 回傳空陣列', () => {
    expect(parseAttachments(null)).toEqual([])
    expect(parseAttachments(undefined)).toEqual([])
  })
})

// ==================== 騎縫章設定 ====================

describe('sealStampConfigSchema', () => {
  it('預設值', () => {
    const result = sealStampConfigSchema.parse({})
    expect(result.enabled).toBe(false)
    expect(result.position).toBe('center')
    expect(result.size).toBe(80)
    expect(result.opacity).toBe(0.8)
  })

  it('opacity 範圍驗證', () => {
    expect(() => sealStampConfigSchema.parse({ opacity: 1.5 })).toThrow()
    expect(() => sealStampConfigSchema.parse({ opacity: -0.1 })).toThrow()
  })
})

// ==================== getErrorMessage ====================

describe('getErrorMessage', () => {
  it('Error 實例 → 回傳 message', () => {
    expect(getErrorMessage(new Error('test'))).toBe('test')
  })

  it('字串 → 直接回傳', () => {
    expect(getErrorMessage('直接訊息')).toBe('直接訊息')
  })

  it('其他類型 → 回傳預設', () => {
    expect(getErrorMessage(42)).toBe('發生未知錯誤')
    expect(getErrorMessage(null)).toBe('發生未知錯誤')
  })
})
