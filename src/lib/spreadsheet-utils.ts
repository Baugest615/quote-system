/**
 * Spreadsheet utilities: TSV parsing, value coercion, column types
 */

export type ColumnType = 'text' | 'number' | 'date' | 'select'

export interface SpreadsheetColumn<T> {
  key: keyof T
  label: string
  type: ColumnType
  required?: boolean
  width?: string           // tailwind width class e.g. 'w-28'
  options?: string[]        // for type='select'
  readOnly?: boolean        // auto-calc fields
  autoCalcSource?: boolean  // triggers onAutoCalc when changed
}

export type RowStatus = 'clean' | 'modified' | 'new' | 'deleted'

export interface SpreadsheetRow<T> {
  tempId: string
  originalId?: string
  data: Partial<T>
  status: RowStatus
  errors: string[]
}

export interface RowError {
  tempId: string
  message: string
}

export interface BatchSaveResult {
  successCount: number
  errors: RowError[]
}

/** Try to parse common date formats into YYYY-MM-DD */
function tryParseDate(raw: string): string | null {
  if (!raw || raw.trim() === '') return null
  const s = raw.trim()

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : s
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const d = new Date(s.replace(/\//g, '-'))
    return isNaN(d.getTime()) ? null : s.replace(/\//g, '-')
  }

  // MM/DD/YYYY
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdyMatch) {
    const iso = `${mdyMatch[3]}-${mdyMatch[1].padStart(2, '0')}-${mdyMatch[2].padStart(2, '0')}`
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : iso
  }

  return null
}

/** Coerce a raw string value to the appropriate type for a column */
function coerceValue<T>(raw: string, col: SpreadsheetColumn<T>): unknown {
  switch (col.type) {
    case 'number': {
      const n = parseFloat(raw.replace(/,/g, ''))
      return isNaN(n) ? 0 : n
    }
    case 'date':
      return tryParseDate(raw)
    case 'select': {
      const match = col.options?.find(
        o => o === raw || o.toLowerCase() === raw.toLowerCase().trim()
      )
      return match ?? raw
    }
    case 'text':
    default:
      return raw
  }
}

/** Detect if the first row of pasted data is a header row */
function isHeaderRow<T>(firstRowCells: string[], columns: SpreadsheetColumn<T>[], startColIndex: number): boolean {
  let matches = 0
  firstRowCells.forEach((cell, i) => {
    const col = columns[startColIndex + i]
    if (col && col.label.toLowerCase().includes(cell.toLowerCase().trim())) {
      matches++
    }
  })
  return matches >= Math.min(2, firstRowCells.length)
}

/** Parse TSV (tab-separated values) text into row updates */
export function parseTSV<T>(
  rawText: string,
  columns: SpreadsheetColumn<T>[],
  startColIndex: number,
  emptyRow: () => Partial<T>
): { rows: Array<{ updates: Partial<T> }>; skippedHeader: boolean } {
  const lines = rawText.trim().split(/\r?\n/)
  if (lines.length === 0) return { rows: [], skippedHeader: false }

  const grid: string[][] = lines.map(line => line.split('\t'))

  // Detect header row
  let skippedHeader = false
  if (grid.length > 1 && isHeaderRow(grid[0], columns, startColIndex)) {
    grid.shift()
    skippedHeader = true
  }

  const rows = grid.map(cells => {
    const updates: Partial<T> = { ...emptyRow() }
    cells.forEach((rawValue, cellOffset) => {
      const col = columns[startColIndex + cellOffset]
      if (!col || col.readOnly) return
      ;(updates as Record<string, unknown>)[col.key as string] = coerceValue(rawValue.trim(), col)
    })
    return { updates }
  })

  return { rows, skippedHeader }
}
