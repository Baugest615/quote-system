'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Plus, Save, X, Undo2, Trash2, Table2, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  type SpreadsheetColumn,
  type SpreadsheetRow,
  type RowStatus,
  type BatchSaveResult,
  parseTSV,
} from '@/lib/spreadsheet-utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpreadsheetEditorProps<T extends { id: string }> {
  columns: SpreadsheetColumn<T>[]
  initialRows: T[]
  year: number
  emptyRow: () => Partial<T>
  onAutoCalc?: (row: Partial<T>, changedKey: keyof T) => Partial<T>
  onBatchSave: (
    toInsert: Partial<T>[],
    toUpdate: { id: string; data: Partial<T> }[],
    toDelete: string[]
  ) => Promise<BatchSaveResult>
  accentColor?: 'blue' | 'red' | 'purple'
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helper: row status styling
// ---------------------------------------------------------------------------

const ROW_STATUS_CLASSES: Record<RowStatus, string> = {
  clean: '',
  new: 'bg-success/10 border-l-4 border-l-success',
  modified: 'bg-warning/10 border-l-4 border-l-warning',
  deleted: 'bg-destructive/10 border-l-4 border-l-destructive',
}

const ACCENT_COLORS = {
  blue: { btn: 'bg-info hover:bg-info/90', ring: 'ring-info' },
  red: { btn: 'bg-destructive hover:bg-destructive/90', ring: 'ring-destructive' },
  purple: { btn: 'bg-chart-5 hover:bg-chart-5/90', ring: 'ring-chart-5' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpreadsheetEditor<T extends { id: string }>({
  columns,
  initialRows,
  year,
  emptyRow,
  onAutoCalc,
  onBatchSave,
  accentColor = 'blue',
  onClose,
}: SpreadsheetEditorProps<T>) {
  // ------ Row state ------
  const [rows, setRows] = useState<SpreadsheetRow<T>[]>(() =>
    initialRows.map(r => ({
      tempId: r.id,
      originalId: r.id,
      data: { ...r } as Partial<T>,
      status: 'clean' as RowStatus,
      errors: [],
    }))
  )
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map())

  // ------ Derived ------
  const visibleRows = useMemo(() => rows.filter(r => r.status !== 'deleted'), [rows])
  const deletedCount = useMemo(() => rows.filter(r => r.status === 'deleted').length, [rows])
  const pendingChanges = useMemo(() => rows.filter(r => r.status !== 'clean'), [rows])
  const hasUnsaved = pendingChanges.length > 0

  const editableColumns = useMemo(
    () => columns.map((c, i) => ({ col: c, i })).filter(({ col }) => !col.readOnly),
    [columns]
  )

  // ------ Focus management ------
  useEffect(() => {
    if (!activeCell) return
    const key = `${activeCell.row}:${activeCell.col}`
    const el = cellRefs.current.get(key)
    if (el) {
      el.focus()
      if ('select' in el && el.type !== 'select-one') {
        (el as HTMLInputElement).select()
      }
    }
  }, [activeCell])

  // ------ Row mutations ------
  const addRow = useCallback(() => {
    const newRow: SpreadsheetRow<T> = {
      tempId: crypto.randomUUID(),
      data: { ...emptyRow(), year } as Partial<T>,
      status: 'new',
      errors: [],
    }
    setRows(prev => [...prev, newRow])
    // Focus first editable cell of new row
    setTimeout(() => {
      const firstEditable = editableColumns[0]
      if (firstEditable) {
        const newIndex = rows.filter(r => r.status !== 'deleted').length // visible count before add
        setActiveCell({ row: newIndex, col: firstEditable.i })
      }
    }, 0)
  }, [emptyRow, year, editableColumns, rows])

  const updateCell = useCallback(
    (visibleIndex: number, colKey: keyof T, value: unknown) => {
      setRows(prev => {
        const visRow = prev.filter(r => r.status !== 'deleted')[visibleIndex]
        if (!visRow) return prev
        return prev.map(r => {
          if (r.tempId !== visRow.tempId) return r
          const newData = { ...r.data, [colKey]: value }
          // Auto-calc
          const col = columns.find(c => c.key === colKey)
          let calcUpdates: Partial<T> = {}
          if (col?.autoCalcSource && onAutoCalc) {
            calcUpdates = onAutoCalc(newData, colKey)
          }
          const mergedData = { ...newData, ...calcUpdates }
          return {
            ...r,
            data: mergedData,
            status: r.status === 'new' ? 'new' : 'modified' as RowStatus,
            errors: [],
          }
        })
      })
    },
    [columns, onAutoCalc]
  )

  const toggleDelete = useCallback((visibleIndex: number) => {
    setRows(prev => {
      const visRow = prev.filter(r => r.status !== 'deleted')[visibleIndex]
      if (!visRow) return prev
      return prev.map(r => {
        if (r.tempId !== visRow.tempId) return r
        if (r.status === 'new') {
          // Just remove new rows entirely
          return r
        }
        return { ...r, status: 'deleted' as RowStatus, errors: [] }
      }).filter(r => !(r.tempId === visRow.tempId && visRow.status === 'new'))
    })
  }, [])

  const undoAllDeleted = useCallback(() => {
    setRows(prev => prev.map(r =>
      r.status === 'deleted' ? { ...r, status: r.originalId ? 'clean' : 'new' as RowStatus } : r
    ))
  }, [])

  const discardAll = useCallback(() => {
    if (!confirm('確定要放棄所有未儲存的變更嗎？')) return
    setRows(
      initialRows.map(r => ({
        tempId: r.id,
        originalId: r.id,
        data: { ...r } as Partial<T>,
        status: 'clean' as RowStatus,
        errors: [],
      }))
    )
    setActiveCell(null)
    toast.info('已放棄所有變更')
  }, [initialRows])

  // ------ Paste handler ------
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text/plain')
      if (!text.trim()) return
      e.preventDefault()

      const startColIndex = activeCell?.col ?? 0
      const startRowIndex = activeCell?.row ?? visibleRows.length
      const { rows: parsedRows, skippedHeader } = parseTSV(text, columns, startColIndex, emptyRow)

      if (parsedRows.length === 0) return
      if (skippedHeader) toast.info('已自動略過標題列')

      setRows(prev => {
        const newRows = [...prev]
        const visible = newRows.filter(r => r.status !== 'deleted')

        parsedRows.forEach((parsed, offset) => {
          const targetVisIndex = startRowIndex + offset
          if (targetVisIndex < visible.length) {
            // Overwrite existing row
            const targetRow = visible[targetVisIndex]
            const idx = newRows.findIndex(r => r.tempId === targetRow.tempId)
            if (idx !== -1) {
              let mergedData = { ...newRows[idx].data, ...parsed.updates }
              // Run auto-calc for pasted data
              if (onAutoCalc) {
                for (const key of Object.keys(parsed.updates) as (keyof T)[]) {
                  const col = columns.find(c => c.key === key)
                  if (col?.autoCalcSource) {
                    mergedData = { ...mergedData, ...onAutoCalc(mergedData, key) }
                  }
                }
              }
              newRows[idx] = {
                ...newRows[idx],
                data: mergedData,
                status: newRows[idx].status === 'new' ? 'new' : 'modified',
                errors: [],
              }
            }
          } else {
            // Append new row
            let rowData = { ...emptyRow(), year, ...parsed.updates } as Partial<T>
            if (onAutoCalc) {
              for (const key of Object.keys(parsed.updates) as (keyof T)[]) {
                const col = columns.find(c => c.key === key)
                if (col?.autoCalcSource) {
                  rowData = { ...rowData, ...onAutoCalc(rowData, key) }
                }
              }
            }
            newRows.push({
              tempId: crypto.randomUUID(),
              data: rowData,
              status: 'new',
              errors: [],
            })
          }
        })
        return newRows
      })

      toast.success(`已貼上 ${parsedRows.length} 列資料`)
    },
    [activeCell, visibleRows.length, columns, emptyRow, year, onAutoCalc]
  )

  // ------ Keyboard navigation ------
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
      const currentNavIdx = editableColumns.findIndex(({ i }) => i === colIndex)

      switch (e.key) {
        case 'Tab': {
          e.preventDefault()
          if (e.shiftKey) {
            const prev = editableColumns[currentNavIdx - 1]
            if (prev) {
              setActiveCell({ row: rowIndex, col: prev.i })
            } else if (rowIndex > 0) {
              const lastCol = editableColumns[editableColumns.length - 1]
              setActiveCell({ row: rowIndex - 1, col: lastCol.i })
            }
          } else {
            const next = editableColumns[currentNavIdx + 1]
            if (next) {
              setActiveCell({ row: rowIndex, col: next.i })
            } else {
              // End of row → next row first cell
              const nextRow = rowIndex + 1
              if (nextRow >= visibleRows.length) addRow()
              setActiveCell({ row: nextRow, col: editableColumns[0].i })
            }
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          const nextRow = rowIndex + 1
          if (nextRow >= visibleRows.length) addRow()
          setActiveCell({ row: nextRow, col: colIndex })
          break
        }
        case 'Escape': {
          e.preventDefault()
          setActiveCell(null)
          break
        }
      }
    },
    [editableColumns, visibleRows.length, addRow]
  )

  // ------ Validate & Save ------
  const handleSave = useCallback(async () => {
    // Validate required fields
    let hasErrors = false
    setRows(prev =>
      prev.map(r => {
        if (r.status === 'clean' || r.status === 'deleted') return r
        const errs: string[] = []
        columns.forEach(col => {
          if (col.required) {
            const val = r.data[col.key]
            if (val === undefined || val === null || val === '' || val === 0) {
              errs.push(`${col.label} 為必填`)
            }
          }
        })
        if (errs.length > 0) hasErrors = true
        return { ...r, errors: errs }
      })
    )
    if (hasErrors) {
      toast.error('請修正標示的欄位後再儲存')
      return
    }

    setSaving(true)
    try {
      const toInsert = rows
        .filter(r => r.status === 'new')
        .map(r => {
          const { id, created_at, updated_at, ...rest } = r.data as Record<string, unknown>
          return rest as Partial<T>
        })

      const toUpdate = rows
        .filter(r => r.status === 'modified')
        .map(r => ({
          id: r.originalId!,
          data: r.data,
        }))

      const toDelete = rows
        .filter(r => r.status === 'deleted' && r.originalId)
        .map(r => r.originalId!)

      const result = await onBatchSave(toInsert, toUpdate, toDelete)

      if (result.errors.length === 0) {
        toast.success(`已成功儲存 ${result.successCount} 筆記錄`)
      } else {
        toast.warning(`${result.successCount} 筆成功，${result.errors.length} 筆失敗`)
        // Mark failed rows
        setRows(prev =>
          prev.map(r => {
            const err = result.errors.find(e => e.tempId === r.tempId || e.tempId === r.originalId)
            if (err) return { ...r, errors: [err.message] }
            return r
          })
        )
      }
    } catch (err) {
      console.error('Spreadsheet batch save error:', err)
      toast.error('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }, [rows, columns, onBatchSave])

  // ------ Close guard ------
  const handleClose = useCallback(() => {
    if (hasUnsaved && !confirm('試算表中有未儲存的變更，確定要離開嗎？')) return
    onClose()
  }, [hasUnsaved, onClose])

  // ------ Number formatter ------
  const fmt = (n: unknown) => {
    const num = typeof n === 'number' ? n : 0
    return new Intl.NumberFormat('zh-TW').format(num)
  }

  const accent = ACCENT_COLORS[accentColor]

  // ------ Render ------
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Table2 className="w-4 h-4" />
          <span>試算表模式</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新增列
        </button>
        {deletedCount > 0 && (
          <button
            onClick={undoAllDeleted}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-warning bg-warning/10 hover:bg-warning/20 rounded-lg transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            復原刪除 ({deletedCount})
          </button>
        )}
        {hasUnsaved && (
          <>
            <button
              onClick={discardAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-accent transition-colors"
            >
              放棄變更
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50',
                accent.btn
              )}
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? '儲存中...' : `儲存 ${pendingChanges.length} 筆變更`}
            </button>
          </>
        )}
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          離開
        </button>
      </div>

      {/* Spreadsheet table */}
      <div
        ref={containerRef}
        className="bg-card rounded-xl border border-border overflow-hidden"
        onPaste={handlePaste}
        tabIndex={0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs sticky top-0 z-20">
                <th className="px-2 py-2.5 text-center w-10 text-muted-foreground/60">#</th>
                {columns.map((col, ci) => (
                  <th
                    key={String(col.key)}
                    className={cn('px-2 py-2.5 text-left whitespace-nowrap', col.width)}
                  >
                    {col.label}
                    {col.required && <span className="text-destructive ml-0.5">*</span>}
                    {col.readOnly && <span className="text-muted-foreground/60 ml-1 text-[10px]">自動</span>}
                  </th>
                ))}
                <th className="px-2 py-2.5 text-center w-12"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2}>
                    <EmptyState
                      type="no-data"
                      icon={ClipboardList}
                      title="尚無資料"
                      description="點擊「新增列」或直接貼上資料"
                    />
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, ri) => (
                  <tr
                    key={row.tempId}
                    className={cn(
                      'border-t border-border/50 transition-colors',
                      ROW_STATUS_CLASSES[row.status],
                      row.errors.length > 0 && 'bg-destructive/10 border-l-4 border-l-destructive'
                    )}
                  >
                    {/* Row number */}
                    <td className="px-2 py-1 text-center text-xs text-muted-foreground/60 tabular-nums">
                      {ri + 1}
                    </td>

                    {/* Data cells */}
                    {columns.map((col, ci) => {
                      const isActive = activeCell?.row === ri && activeCell?.col === ci
                      const value = row.data[col.key]
                      const cellKey = `${ri}:${ci}`
                      const isRequired = col.required && row.errors.some(e => e.includes(col.label))

                      if (col.readOnly) {
                        return (
                          <td
                            key={String(col.key)}
                            className={cn('px-2 py-1 text-muted-foreground italic bg-muted/30', col.width)}
                            title="自動計算"
                          >
                            <span className="text-xs tabular-nums">
                              {col.type === 'number' ? fmt(value) : String(value ?? '')}
                            </span>
                          </td>
                        )
                      }

                      return (
                        <td
                          key={String(col.key)}
                          className={cn(
                            'px-0.5 py-0.5',
                            col.width,
                            isRequired && 'bg-destructive/10'
                          )}
                          onClick={() => setActiveCell({ row: ri, col: ci })}
                        >
                          {col.type === 'select' ? (
                            <select
                              ref={el => {
                                if (el) cellRefs.current.set(cellKey, el)
                                else cellRefs.current.delete(cellKey)
                              }}
                              value={String(value ?? '')}
                              onChange={e => updateCell(ri, col.key, e.target.value)}
                              onKeyDown={e => handleCellKeyDown(e, ri, ci)}
                              onFocus={() => setActiveCell({ row: ri, col: ci })}
                              className={cn(
                                'w-full h-8 px-1.5 text-xs border rounded transition-all bg-transparent',
                                isActive
                                  ? `ring-2 ${accent.ring} border-transparent bg-card`
                                  : 'border-transparent hover:border-border'
                              )}
                            >
                              <option value="">--</option>
                              {col.options?.map(o => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          ) : col.type === 'date' ? (
                            <input
                              ref={el => {
                                if (el) cellRefs.current.set(cellKey, el)
                                else cellRefs.current.delete(cellKey)
                              }}
                              type="date"
                              value={String(value ?? '')}
                              onChange={e => updateCell(ri, col.key, e.target.value || null)}
                              onKeyDown={e => handleCellKeyDown(e, ri, ci)}
                              onFocus={() => setActiveCell({ row: ri, col: ci })}
                              className={cn(
                                'w-full h-8 px-1.5 text-xs border rounded transition-all bg-transparent',
                                isActive
                                  ? `ring-2 ${accent.ring} border-transparent bg-card`
                                  : 'border-transparent hover:border-border'
                              )}
                            />
                          ) : col.type === 'number' ? (
                            <input
                              ref={el => {
                                if (el) cellRefs.current.set(cellKey, el)
                                else cellRefs.current.delete(cellKey)
                              }}
                              type="number"
                              value={value === 0 ? '' : String(value ?? '')}
                              onChange={e => updateCell(ri, col.key, e.target.value === '' ? 0 : Number(e.target.value))}
                              onKeyDown={e => handleCellKeyDown(e, ri, ci)}
                              onFocus={() => setActiveCell({ row: ri, col: ci })}
                              className={cn(
                                'w-full h-8 px-1.5 text-xs text-right border rounded transition-all bg-transparent tabular-nums',
                                isActive
                                  ? `ring-2 ${accent.ring} border-transparent bg-card`
                                  : 'border-transparent hover:border-border'
                              )}
                              placeholder="0"
                            />
                          ) : (
                            <input
                              ref={el => {
                                if (el) cellRefs.current.set(cellKey, el)
                                else cellRefs.current.delete(cellKey)
                              }}
                              type="text"
                              value={String(value ?? '')}
                              onChange={e => updateCell(ri, col.key, e.target.value)}
                              onKeyDown={e => handleCellKeyDown(e, ri, ci)}
                              onFocus={() => setActiveCell({ row: ri, col: ci })}
                              className={cn(
                                'w-full h-8 px-1.5 text-xs border rounded transition-all bg-transparent',
                                isActive
                                  ? `ring-2 ${accent.ring} border-transparent bg-card`
                                  : 'border-transparent hover:border-border'
                              )}
                            />
                          )}
                        </td>
                      )
                    })}

                    {/* Delete action */}
                    <td className="px-1 py-1 text-center">
                      <button
                        onClick={() => toggleDelete(ri)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10 transition-colors"
                        title="刪除此列"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 px-1">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-success/30 border border-success" />
          新增列
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-warning/30 border border-warning" />
          已修改
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-destructive/30 border border-destructive" />
          待刪除
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-destructive/20 border border-destructive" />
          驗證錯誤
        </span>
        <span className="ml-auto text-muted-foreground/60">支援從 Excel 直接貼上（Ctrl+V）</span>
      </div>
    </div>
  )
}
