'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { SpreadsheetColumn, SpreadsheetRow, RowStatus, BatchSaveResult } from '@/lib/spreadsheet-utils'
import { parseTSV } from '@/lib/spreadsheet-utils'

interface UseSpreadsheetOperationsOptions<T extends { id: string }> {
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
}

export function useSpreadsheetOperations<T extends { id: string }>({
  columns,
  initialRows,
  year,
  emptyRow,
  onAutoCalc,
  onBatchSave,
}: UseSpreadsheetOperationsOptions<T>) {
  const confirm = useConfirm()

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
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map())

  // ------ Sync from server data (React Query refetch) ------
  const prevInitialRef = useRef(initialRows)
  useEffect(() => {
    // 只有在 initialRows 實際變化且無未儲存的變更時，才同步
    if (prevInitialRef.current === initialRows) return
    prevInitialRef.current = initialRows

    const hasPending = rows.some(r => r.status !== 'clean')
    if (hasPending) return

    setRows(
      initialRows.map(r => ({
        tempId: r.id,
        originalId: r.id,
        data: { ...r } as Partial<T>,
        status: 'clean' as RowStatus,
        errors: [],
      }))
    )
  }, [initialRows, rows])

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
    setTimeout(() => {
      const firstEditable = editableColumns[0]
      if (firstEditable) {
        const newIndex = rows.filter(r => r.status !== 'deleted').length
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
          const col = columns.find(c => c.key === colKey)
          let calcUpdates: Partial<T> = {}
          if ((col?.autoCalcSource || col?.autoCalcTrigger) && onAutoCalc) {
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
        if (r.status === 'new') return r
        return { ...r, status: 'deleted' as RowStatus, errors: [] }
      }).filter(r => !(r.tempId === visRow.tempId && visRow.status === 'new'))
    })
  }, [])

  const undoAllDeleted = useCallback(() => {
    setRows(prev => prev.map(r =>
      r.status === 'deleted' ? { ...r, status: r.originalId ? 'clean' : 'new' as RowStatus } : r
    ))
  }, [])

  const discardAll = useCallback(async () => {
    const ok = await confirm({ title: '放棄變更', description: '確定要放棄所有未儲存的變更嗎？' })
    if (!ok) return
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
  }, [initialRows, confirm])

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
            const targetRow = visible[targetVisIndex]
            const idx = newRows.findIndex(r => r.tempId === targetRow.tempId)
            if (idx !== -1) {
              let mergedData = { ...newRows[idx].data, ...parsed.updates }
              if (onAutoCalc) {
                for (const key of Object.keys(parsed.updates) as (keyof T)[]) {
                  const col = columns.find(c => c.key === key)
                  if (col?.autoCalcSource || col?.autoCalcTrigger) {
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
          const { id: _id, created_at: _created_at, updated_at: _updated_at, ...rest } = r.data as Record<string, unknown>
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
        // 重置所有列為 clean 狀態，移除已刪除列
        setRows(prev =>
          prev
            .filter(r => r.status !== 'deleted')
            .map(r => ({
              ...r,
              status: 'clean' as RowStatus,
              errors: [],
            }))
        )
        setActiveCell(null)
        toast.success(`已成功儲存 ${result.successCount} 筆記錄`)
      } else {
        toast.warning(`${result.successCount} 筆成功，${result.errors.length} 筆失敗`)
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

  return {
    // State
    rows,
    visibleRows,
    deletedCount,
    pendingChanges,
    hasUnsaved,
    activeCell,
    setActiveCell,
    saving,
    cellRefs,
    editableColumns,
    // Actions
    addRow,
    updateCell,
    toggleDelete,
    undoAllDeleted,
    discardAll,
    handlePaste,
    handleCellKeyDown,
    handleSave,
  }
}
