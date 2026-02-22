import {
  isValidInvoiceFormat,
  getInvoiceError,
  isValidCostAmount,
  getCostAmountError,
  isValidFileSize,
  isValidFileType,
  isValidAttachmentCount,
  validateAttachment,
  validateAttachments,
  isItemReady,
  canSelectForPayment,
  validateItemForSubmission,
  canMergeItems,
  validateMergeOperation,
  validateBatchVerification,
  validateRequired,
  validateNumberRange,
  validateStringLength,
} from '../validation'
import { VALIDATION_RULES, ERROR_MESSAGES } from '../constants'

// ==================== 發票號碼驗證 ====================

describe('發票號碼驗證', () => {
  describe('isValidInvoiceFormat', () => {
    it('應接受正確格式：兩個英文字母 + 連字號 + 8 位數字', () => {
      expect(isValidInvoiceFormat('AB-12345678')).toBe(true)
      expect(isValidInvoiceFormat('cd-00000001')).toBe(true)
      expect(isValidInvoiceFormat('Ef-99999999')).toBe(true)
    })

    it('應拒絕缺少連字號的格式', () => {
      expect(isValidInvoiceFormat('AB12345678')).toBe(false)
    })

    it('應拒絕字母數量不對的格式', () => {
      expect(isValidInvoiceFormat('A-12345678')).toBe(false)
      expect(isValidInvoiceFormat('ABC-12345678')).toBe(false)
    })

    it('應拒絕數字位數不對的格式', () => {
      expect(isValidInvoiceFormat('AB-1234567')).toBe(false)
      expect(isValidInvoiceFormat('AB-123456789')).toBe(false)
    })

    it('應拒絕 null、undefined、空字串', () => {
      expect(isValidInvoiceFormat(null)).toBe(false)
      expect(isValidInvoiceFormat(undefined)).toBe(false)
      expect(isValidInvoiceFormat('')).toBe(false)
    })

    it('應拒絕含有特殊字元的格式', () => {
      expect(isValidInvoiceFormat('A1-12345678')).toBe(false)
      expect(isValidInvoiceFormat('AB-1234567a')).toBe(false)
    })
  })

  describe('getInvoiceError', () => {
    it('空值應回傳必填錯誤訊息', () => {
      expect(getInvoiceError(null)).toBe(ERROR_MESSAGES.validation.required)
      expect(getInvoiceError(undefined)).toBe(ERROR_MESSAGES.validation.required)
      expect(getInvoiceError('')).toBe(ERROR_MESSAGES.validation.required)
    })

    it('格式錯誤應回傳格式錯誤訊息', () => {
      expect(getInvoiceError('invalid')).toBe(VALIDATION_RULES.invoiceNumber.message)
    })

    it('正確格式應回傳 null', () => {
      expect(getInvoiceError('AB-12345678')).toBeNull()
    })
  })
})

// ==================== 成本金額驗證 ====================

describe('成本金額驗證', () => {
  describe('isValidCostAmount', () => {
    it('應接受有效範圍內的金額', () => {
      expect(isValidCostAmount(0)).toBe(true)
      expect(isValidCostAmount(1000)).toBe(true)
      expect(isValidCostAmount(10000000)).toBe(true)
    })

    it('應拒絕超出範圍的金額', () => {
      expect(isValidCostAmount(-1)).toBe(false)
      expect(isValidCostAmount(10000001)).toBe(false)
    })

    it('應拒絕 null 和 undefined', () => {
      expect(isValidCostAmount(null)).toBe(false)
      expect(isValidCostAmount(undefined)).toBe(false)
    })

    it('應接受邊界值', () => {
      expect(isValidCostAmount(VALIDATION_RULES.costAmount.min)).toBe(true)
      expect(isValidCostAmount(VALIDATION_RULES.costAmount.max)).toBe(true)
    })
  })

  describe('getCostAmountError', () => {
    it('null/undefined 應回傳必填錯誤', () => {
      expect(getCostAmountError(null)).toBe(ERROR_MESSAGES.validation.required)
      expect(getCostAmountError(undefined)).toBe(ERROR_MESSAGES.validation.required)
    })

    it('超出範圍應回傳範圍錯誤訊息', () => {
      expect(getCostAmountError(-1)).toBe(VALIDATION_RULES.costAmount.message)
    })

    it('有效金額應回傳 null', () => {
      expect(getCostAmountError(5000)).toBeNull()
    })

    it('金額 0 應回傳「成本金額必須大於 0」', () => {
      // 0 在範圍內（isValidCostAmount 通過），但 <= 0 檢查會攔截
      // 注意：getCostAmountError 中先檢查 isValidCostAmount，0 通過後再檢查 > 0
      expect(getCostAmountError(0)).toBe('成本金額必須大於 0')
    })
  })
})

// ==================== 附件驗證 ====================

describe('附件驗證', () => {
  describe('isValidFileSize', () => {
    it('應接受 10MB 以內的檔案', () => {
      expect(isValidFileSize(0)).toBe(true)
      expect(isValidFileSize(5 * 1024 * 1024)).toBe(true)
      expect(isValidFileSize(10 * 1024 * 1024)).toBe(true)
    })

    it('應拒絕超過 10MB 的檔案', () => {
      expect(isValidFileSize(10 * 1024 * 1024 + 1)).toBe(false)
    })
  })

  describe('isValidFileType', () => {
    it('應接受允許的 MIME 類型', () => {
      expect(isValidFileType('image/jpeg')).toBe(true)
      expect(isValidFileType('image/png')).toBe(true)
      expect(isValidFileType('application/pdf')).toBe(true)
      expect(isValidFileType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    })

    it('應拒絕不允許的 MIME 類型', () => {
      expect(isValidFileType('text/plain')).toBe(false)
      expect(isValidFileType('application/zip')).toBe(false)
      expect(isValidFileType('video/mp4')).toBe(false)
    })
  })

  describe('isValidAttachmentCount', () => {
    it('應接受 10 個以內的附件', () => {
      expect(isValidAttachmentCount(0)).toBe(true)
      expect(isValidAttachmentCount(5)).toBe(true)
      expect(isValidAttachmentCount(10)).toBe(true)
    })

    it('應拒絕超過 10 個附件', () => {
      expect(isValidAttachmentCount(11)).toBe(false)
    })
  })

  describe('validateAttachment', () => {
    const createMockFile = (name: string, size: number, type: string): File => {
      const file = new File([''], name, { type })
      Object.defineProperty(file, 'size', { value: size })
      return file
    }

    it('應通過合法檔案', () => {
      const file = createMockFile('test.pdf', 1024, 'application/pdf')
      expect(validateAttachment(file)).toBeNull()
    })

    it('應拒絕過大的檔案', () => {
      const file = createMockFile('test.pdf', 11 * 1024 * 1024, 'application/pdf')
      expect(validateAttachment(file)).toBe(ERROR_MESSAGES.file.tooLarge)
    })

    it('應拒絕不支援的檔案類型', () => {
      const file = createMockFile('test.zip', 1024, 'application/zip')
      expect(validateAttachment(file)).toBe(ERROR_MESSAGES.file.invalidType)
    })
  })

  describe('validateAttachments', () => {
    const createMockFile = (name: string, size: number, type: string): File => {
      const file = new File([''], name, { type })
      Object.defineProperty(file, 'size', { value: size })
      return file
    }

    it('應通過合法的檔案列表', () => {
      const files = [
        createMockFile('a.pdf', 1024, 'application/pdf'),
        createMockFile('b.jpg', 2048, 'image/jpeg'),
      ]
      expect(validateAttachments(files)).toBeNull()
    })

    it('應拒絕超過數量限制的檔案（含既有附件）', () => {
      const files = [createMockFile('a.pdf', 1024, 'application/pdf')]
      expect(validateAttachments(files, 10)).toBe(
        `最多只能上傳 ${VALIDATION_RULES.attachment.maxCount} 個檔案`
      )
    })

    it('應在檔案列表中發現不合法檔案時回傳錯誤', () => {
      const files = [
        createMockFile('a.pdf', 1024, 'application/pdf'),
        createMockFile('b.zip', 1024, 'application/zip'),
      ]
      expect(validateAttachments(files)).toBe(ERROR_MESSAGES.file.invalidType)
    })
  })
})

// ==================== 項目驗證 ====================

describe('項目驗證', () => {
  describe('isItemReady', () => {
    it('有附件時應回傳 true', () => {
      expect(
        isItemReady({
          attachments: [{ name: 'test.pdf', url: '/test.pdf', path: '/test.pdf', uploadedAt: '2026-01-01', size: 1024 }],
          invoice_number_input: null,
        })
      ).toBe(true)
    })

    it('有正確格式發票號碼時應回傳 true', () => {
      expect(
        isItemReady({
          attachments: [],
          invoice_number_input: 'AB-12345678',
        })
      ).toBe(true)
    })

    it('同時有附件和發票時應回傳 true', () => {
      expect(
        isItemReady({
          attachments: [{ name: 'test.pdf', url: '/test.pdf', path: '/test.pdf', uploadedAt: '2026-01-01', size: 1024 }],
          invoice_number_input: 'AB-12345678',
        })
      ).toBe(true)
    })

    it('無附件也無有效發票時應回傳 false', () => {
      expect(isItemReady({ attachments: [], invoice_number_input: null })).toBe(false)
      expect(isItemReady({ attachments: [], invoice_number_input: 'invalid' })).toBe(false)
      expect(isItemReady({})).toBe(false)
    })
  })

  describe('canSelectForPayment', () => {
    it('一般已備妥項目應可選擇', () => {
      expect(
        canSelectForPayment({
          attachments: [{ name: 'test.pdf', url: '/test.pdf', path: '/test.pdf', uploadedAt: '2026-01-01', size: 1024 }],
          invoice_number_input: null,
          merge_group_id: null,
          is_merge_leader: false,
        })
      ).toBe(true)
    })

    it('合併群組中的非主項目不可選擇', () => {
      expect(
        canSelectForPayment({
          attachments: [{ name: 'test.pdf', url: '/test.pdf', path: '/test.pdf', uploadedAt: '2026-01-01', size: 1024 }],
          invoice_number_input: null,
          merge_group_id: 'group-1',
          is_merge_leader: false,
        })
      ).toBe(false)
    })

    it('合併群組的主項目若已備妥可選擇', () => {
      expect(
        canSelectForPayment({
          attachments: [{ name: 'test.pdf', url: '/test.pdf', path: '/test.pdf', uploadedAt: '2026-01-01', size: 1024 }],
          invoice_number_input: null,
          merge_group_id: 'group-1',
          is_merge_leader: true,
        })
      ).toBe(true)
    })

    it('未備妥的項目不可選擇', () => {
      expect(
        canSelectForPayment({
          attachments: [],
          invoice_number_input: null,
          merge_group_id: null,
          is_merge_leader: false,
        })
      ).toBe(false)
    })
  })

  describe('validateItemForSubmission', () => {
    it('成本有效且已備妥時應通過', () => {
      expect(
        validateItemForSubmission({
          cost_amount_input: 5000,
          attachments: [{ name: 'test.pdf', url: '/test.pdf', path: '/test.pdf', uploadedAt: '2026-01-01', size: 1024 }],
          invoice_number_input: null,
        })
      ).toBeNull()
    })

    it('成本為空時應回傳必填錯誤', () => {
      expect(
        validateItemForSubmission({
          cost_amount_input: undefined,
          attachments: [{ name: 'test.pdf', url: '/test.pdf', path: '/test.pdf', uploadedAt: '2026-01-01', size: 1024 }],
          invoice_number_input: null,
        })
      ).toBe(ERROR_MESSAGES.validation.required)
    })

    it('未備妥時應回傳備妥錯誤', () => {
      expect(
        validateItemForSubmission({
          cost_amount_input: 5000,
          attachments: [],
          invoice_number_input: null,
        })
      ).toBe('請檢附文件或填入正確格式的發票號碼')
    })
  })
})

// ==================== 合併驗證 ====================

describe('合併付款驗證', () => {
  describe('canMergeItems', () => {
    it('相同銀行帳戶資訊應可合併', () => {
      const bankInfo = { bankName: '台灣銀行', branchName: '信義分行', accountNumber: '12345' }
      expect(
        canMergeItems(
          { kols: { bank_info: bankInfo } },
          { kols: { bank_info: bankInfo } }
        )
      ).toBe(true)
    })

    it('不同銀行帳戶資訊不可合併', () => {
      expect(
        canMergeItems(
          { kols: { bank_info: { bankName: 'A', accountNumber: '1' } } },
          { kols: { bank_info: { bankName: 'B', accountNumber: '2' } } }
        )
      ).toBe(false)
    })

    it('缺少銀行帳戶資訊時不可合併', () => {
      expect(canMergeItems({ kols: null }, { kols: { bank_info: {} } })).toBe(false)
      expect(canMergeItems({ kols: { bank_info: null } }, { kols: { bank_info: {} } })).toBe(false)
    })
  })

  describe('validateMergeOperation', () => {
    it('少於兩筆資料時應回傳錯誤', () => {
      expect(validateMergeOperation([])).toBe('請選擇至少兩筆資料進行合併')
      expect(validateMergeOperation([{ kols: { bank_info: {} } }])).toBe('請選擇至少兩筆資料進行合併')
    })

    it('銀行帳戶一致時應通過', () => {
      const bankInfo = { bankName: '台灣銀行' }
      expect(
        validateMergeOperation([
          { kols: { bank_info: bankInfo } },
          { kols: { bank_info: bankInfo } },
          { kols: { bank_info: bankInfo } },
        ])
      ).toBeNull()
    })

    it('銀行帳戶不一致時應回傳錯誤', () => {
      expect(
        validateMergeOperation([
          { kols: { bank_info: { bankName: 'A' } } },
          { kols: { bank_info: { bankName: 'B' } } },
        ])
      ).toBe('所選項目的銀行帳戶不一致，無法合併')
    })
  })
})

// ==================== 批量操作驗證 ====================

describe('批量操作驗證', () => {
  describe('validateBatchVerification', () => {
    it('無選擇項目時應回傳錯誤', () => {
      expect(validateBatchVerification([], 'approve')).toBe(ERROR_MESSAGES.operation.noSelection)
      expect(validateBatchVerification([], 'reject')).toBe(ERROR_MESSAGES.operation.noSelection)
    })

    it('核准操作有項目時應通過', () => {
      expect(validateBatchVerification([{}], 'approve')).toBeNull()
    })

    it('駁回操作有項目時應通過（原因在 UI 層處理）', () => {
      expect(validateBatchVerification([{}], 'reject')).toBeNull()
    })
  })
})

// ==================== 通用驗證 ====================

describe('通用驗證', () => {
  describe('validateRequired', () => {
    it('null/undefined/空字串應回傳必填錯誤', () => {
      expect(validateRequired(null)).toBe(ERROR_MESSAGES.validation.required)
      expect(validateRequired(undefined)).toBe(ERROR_MESSAGES.validation.required)
      expect(validateRequired('')).toBe(ERROR_MESSAGES.validation.required)
    })

    it('有值時應回傳 null', () => {
      expect(validateRequired('hello')).toBeNull()
      expect(validateRequired(0)).toBeNull()
      expect(validateRequired(false)).toBeNull()
    })
  })

  describe('validateNumberRange', () => {
    it('在範圍內應回傳 null', () => {
      expect(validateNumberRange(5, 1, 10)).toBeNull()
      expect(validateNumberRange(1, 1, 10)).toBeNull()
      expect(validateNumberRange(10, 1, 10)).toBeNull()
    })

    it('超出範圍應回傳錯誤訊息', () => {
      expect(validateNumberRange(0, 1, 10)).toBe('數值必須在 1 到 10 之間')
      expect(validateNumberRange(11, 1, 10)).toBe('數值必須在 1 到 10 之間')
    })
  })

  describe('validateStringLength', () => {
    it('長度在範圍內應回傳 null', () => {
      expect(validateStringLength('hello', 1, 10)).toBeNull()
    })

    it('長度不足應回傳錯誤', () => {
      expect(validateStringLength('', 1, 10)).toBe('長度不得少於 1 個字元')
    })

    it('長度超過應回傳錯誤', () => {
      expect(validateStringLength('hello world!', 1, 5)).toBe('長度不得超過 5 個字元')
    })
  })
})
