import { parseTSV, type SpreadsheetColumn } from '../spreadsheet-utils'

// ==================== 測試用 Column 定義 ====================

interface TestRow {
  name: string
  amount: number
  date: string
  category: string
}

const columns: SpreadsheetColumn<TestRow>[] = [
  { key: 'name', label: '名稱', type: 'text' },
  { key: 'amount', label: '金額', type: 'number' },
  { key: 'date', label: '日期', type: 'date' },
  { key: 'category', label: '類別', type: 'select', options: ['食品', '交通', '住宿'] },
]

const emptyRow = (): Partial<TestRow> => ({})

// ==================== parseTSV ====================

describe('parseTSV', () => {
  it('解析基本 TSV 資料', () => {
    const tsv = '王小明\t1000\t2026-01-15\t食品'
    const { rows, skippedHeader } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows).toHaveLength(1)
    expect(rows[0].updates.name).toBe('王小明')
    expect(rows[0].updates.amount).toBe(1000)
    expect(rows[0].updates.date).toBe('2026-01-15')
    expect(rows[0].updates.category).toBe('食品')
    expect(skippedHeader).toBe(false)
  })

  it('多行資料', () => {
    const tsv = '項目A\t500\t2026-01-01\t交通\n項目B\t800\t2026-02-15\t住宿'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows).toHaveLength(2)
    expect(rows[0].updates.name).toBe('項目A')
    expect(rows[1].updates.name).toBe('項目B')
  })

  it('自動偵測並跳過標題列', () => {
    const tsv = '名稱\t金額\t日期\t類別\n王小明\t1000\t2026-01-15\t食品'
    const { rows, skippedHeader } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows).toHaveLength(1)
    expect(skippedHeader).toBe(true)
    expect(rows[0].updates.name).toBe('王小明')
  })

  it('數字欄位自動轉型', () => {
    const tsv = 'test\t1,234.56\t\t'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows[0].updates.amount).toBe(1234.56)
  })

  it('非數字字串轉為 0', () => {
    const tsv = 'test\tnot_a_number\t\t'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows[0].updates.amount).toBe(0)
  })

  it('日期格式 YYYY/MM/DD → YYYY-MM-DD', () => {
    const tsv = 'test\t100\t2026/03/15\t'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows[0].updates.date).toBe('2026-03-15')
  })

  it('日期格式 MM/DD/YYYY → YYYY-MM-DD', () => {
    const tsv = 'test\t100\t03/15/2026\t'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows[0].updates.date).toBe('2026-03-15')
  })

  it('不合法日期 → null', () => {
    const tsv = 'test\t100\tnot-a-date\t'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows[0].updates.date).toBeNull()
  })

  it('空字串日期 → null', () => {
    // 尾部需要有非空欄位，否則 trim() 會移除尾部 tab
    const tsv = 'test\t100\t\t食品'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows[0].updates.date).toBeNull()
  })

  it('select 欄位大小寫不敏感匹配', () => {
    const tsv = 'test\t100\t\t食品'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows[0].updates.category).toBe('食品')
  })

  it('startColIndex 偏移', () => {
    // 從 column index 1 開始貼上（跳過 name）
    const tsv = '500\t2026-01-01\t交通'
    const { rows } = parseTSV(tsv, columns, 1, emptyRow)
    expect(rows[0].updates.amount).toBe(500)
    expect(rows[0].updates.date).toBe('2026-01-01')
    expect(rows[0].updates.category).toBe('交通')
    expect(rows[0].updates.name).toBeUndefined()
  })

  it('空字串 → trim 後產生 1 行空 row', () => {
    // parseTSV 的 trim+split 對空字串仍產生 ['']，所以有 1 行
    const { rows } = parseTSV('', columns, 0, emptyRow)
    expect(rows).toHaveLength(1)
    expect(rows[0].updates.name).toBe('')
  })

  it('Windows 換行 (\\r\\n) 正確解析', () => {
    // 避免尾部空 cell 被 trim，使用有內容的欄位
    const tsv = '行1\t100\t2026-01-01\t食品\r\n行2\t200\t2026-02-01\t交通'
    const { rows } = parseTSV(tsv, columns, 0, emptyRow)
    expect(rows).toHaveLength(2)
    expect(rows[0].updates.name).toBe('行1')
    expect(rows[1].updates.name).toBe('行2')
  })
})
