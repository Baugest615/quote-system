'use client'

import { useCallback, useRef, useMemo } from 'react'
import { Trash2, ClipboardList, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import type { SpreadsheetColumn, RowStatus, SpreadsheetRow, BatchSaveResult } from '@/lib/spreadsheet-utils'
import { useSpreadsheetOperations } from '@/hooks/accounting/useSpreadsheetOperations'
import { useTableSort } from '@/hooks/useTableSort'
import { useColumnFilters } from '@/hooks/useColumnFilters'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover'
import { SpreadsheetToolbar } from './spreadsheet/SpreadsheetToolbar'
import { SpreadsheetCell } from './spreadsheet/SpreadsheetCell'
import { SpreadsheetLegend } from './spreadsheet/SpreadsheetLegend'

// ---------------------------------------------------------------------------
// Props & Constants
// ---------------------------------------------------------------------------

interface SpreadsheetEditorProps<T extends { id: string }> {
  columns: SpreadsheetColumn<T>[]
  initialRows: T[]
  year: number
  emptyRow: () => Partial<T>
  onAutoCalc?: (row: Partial<T>, changedKey: keyof T) => Partial<T>
  onBatchSave: (toInsert: Partial<T>[], toUpdate: { id: string; data: Partial<T> }[], toDelete: string[]) => Promise<BatchSaveResult>
  canDelete?: (row: T) => boolean
  allowInsert?: boolean
  accentColor?: 'blue' | 'red' | 'purple'
  onClose: () => void
}

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

interface DisplayRow<T> {
  row: SpreadsheetRow<T>
  origIdx: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpreadsheetEditor<T extends { id: string }>({
  columns, initialRows, year, emptyRow, onAutoCalc, onBatchSave,
  canDelete, allowInsert = true, accentColor = 'blue', onClose,
}: SpreadsheetEditorProps<T>) {
  const {
    visibleRows, deletedCount, pendingChanges, hasUnsaved, activeCell, setActiveCell,
    saving, cellRefs, editableColumns, addRow, updateCell, toggleDelete, undoAllDeleted,
    discardAll, handlePaste, handleCellKeyDown, handleSave,
  } = useSpreadsheetOperations({ columns, initialRows, year, emptyRow, onAutoCalc, onBatchSave })

  const confirm = useConfirm()
  const containerRef = useRef<HTMLDivElement>(null)
  const { filters, setFilter, clearAll: clearFilters, filterData, activeCount: filterCount } = useColumnFilters<T>()
  const isFiltered = filterCount > 0
  const { sortState, toggleSort, resetSort } = useTableSort<string>()
  const isSorted = sortState.key != null
  const accent = ACCENT_COLORS[accentColor]

  // Build display rows: filter → index → sort
  const displayRows: DisplayRow<T>[] = useMemo(() => {
    const filteredVisible = isFiltered
      ? visibleRows.filter(row => filterData([row.data as T]).length > 0)
      : visibleRows
    const indexed = filteredVisible.map(row => ({ row, origIdx: visibleRows.indexOf(row) }))
    if (!sortState.key || !sortState.direction) return indexed
    const key = sortState.key, dir = sortState.direction === 'asc' ? 1 : -1
    return [...indexed].sort((a, b) => {
      const aVal = (a.row.data as Record<string, unknown>)[key]
      const bVal = (b.row.data as Record<string, unknown>)[key]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
      return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
    })
  }, [visibleRows, sortState.key, sortState.direction, isFiltered, filterData])

  const handleAddRow = useCallback(() => {
    if (!allowInsert || isFiltered) return
    if (isSorted) resetSort()
    addRow()
  }, [allowInsert, isFiltered, isSorted, resetSort, addRow])

  const handlePasteWithSort = useCallback((e: React.ClipboardEvent) => {
    if (isFiltered) { e.preventDefault(); return }
    if (isSorted) resetSort()
    handlePaste(e)
  }, [isFiltered, isSorted, resetSort, handlePaste])

  // Keyboard navigation in sorted view
  const handleSortedCellKeyDown = useCallback(
    (e: React.KeyboardEvent, origIdx: number, visualRow: number, colIndex: number) => {
      if (!isSorted) { handleCellKeyDown(e, origIdx, colIndex); return }
      switch (e.key) {
        case 'Tab': {
          e.preventDefault()
          const currentNavIdx = editableColumns.findIndex(({ i }) => i === colIndex)
          if (e.shiftKey) {
            const prev = editableColumns[currentNavIdx - 1]
            if (prev) setActiveCell({ row: origIdx, col: prev.i })
            else if (visualRow > 0) setActiveCell({ row: displayRows[visualRow - 1].origIdx, col: editableColumns[editableColumns.length - 1].i })
          } else {
            const next = editableColumns[currentNavIdx + 1]
            if (next) setActiveCell({ row: origIdx, col: next.i })
            else {
              const nextVi = visualRow + 1
              if (nextVi >= displayRows.length) { handleAddRow(); return }
              setActiveCell({ row: displayRows[nextVi].origIdx, col: editableColumns[0].i })
            }
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          const nextVi = visualRow + 1
          if (nextVi >= displayRows.length) { handleAddRow(); return }
          setActiveCell({ row: displayRows[nextVi].origIdx, col: colIndex })
          break
        }
        case 'Escape': { e.preventDefault(); setActiveCell(null); break }
      }
    },
    [isSorted, handleCellKeyDown, editableColumns, displayRows, setActiveCell, handleAddRow],
  )

  const handleClose = useCallback(async () => {
    if (hasUnsaved) {
      const ok = await confirm({ title: '未儲存的變更', description: '試算表中有未儲存的變更，確定要離開嗎？' })
      if (!ok) return
    }
    onClose()
  }, [hasUnsaved, onClose, confirm])

  const fmt = (n: unknown) => new Intl.NumberFormat('zh-TW').format(typeof n === 'number' ? n : 0)

  return (
    <div className="space-y-3">
      <SpreadsheetToolbar
        isFiltered={isFiltered} filterCount={filterCount} onClearFilters={clearFilters}
        allowInsert={allowInsert} onAddRow={handleAddRow}
        deletedCount={deletedCount} onUndoAllDeleted={undoAllDeleted}
        hasUnsaved={hasUnsaved} pendingCount={pendingChanges.length} saving={saving}
        onDiscardAll={discardAll} onSave={handleSave}
        onClose={handleClose} accentBtnClass={accent.btn}
      />

      <div ref={containerRef} className="bg-card rounded-xl border border-border overflow-hidden"
        onPaste={handlePasteWithSort} tabIndex={0}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs sticky top-0 z-20">
                <th className="px-2 py-2.5 text-center w-10 text-muted-foreground/60">#</th>
                {columns.map((col) => (
                  <th key={String(col.key)} className={cn('px-2 py-2.5 text-left whitespace-nowrap', col.width)}>
                    <SortableHeader label={col.label} sortKey={String(col.key)} sortState={sortState} onToggleSort={toggleSort}
                      filterContent={
                        <ColumnFilterPopover
                          filterType={col.type === 'select' ? 'select' : col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          options={col.type === 'select' ? col.options : undefined}
                          value={filters.get(col.key as keyof T) ?? null}
                          onChange={(v) => setFilter(col.key as keyof T, v)} />
                      } />
                    {col.required && <span className="text-destructive ml-0.5">*</span>}
                    {col.readOnly && <span className="text-muted-foreground/60 ml-1 text-[10px]">自動</span>}
                  </th>
                ))}
                <th className="px-2 py-2.5 text-center w-12"></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr><td colSpan={columns.length + 2}>
                  <EmptyState type="no-data" icon={ClipboardList} title="尚無資料"
                    description={allowInsert ? '點擊「新增列」或直接貼上資料' : '目前沒有可編輯的資料'} />
                </td></tr>
              ) : (
                displayRows.map(({ row, origIdx }, vi) => (
                  <tr key={row.tempId} className={cn(
                    'border-t border-border/50 transition-colors',
                    ROW_STATUS_CLASSES[row.status],
                    row.errors.length > 0 && 'bg-destructive/10 border-l-4 border-l-destructive'
                  )}>
                    <td className="px-2 py-1 text-center text-xs text-muted-foreground/60 tabular-nums">{vi + 1}</td>
                    {columns.map((col, ci) => (
                      <SpreadsheetCell<T> key={String(col.key)}
                        col={col} value={row.data[col.key]}
                        isActive={activeCell?.row === origIdx && activeCell?.col === ci}
                        isRequired={!!col.required && row.errors.some(e => e.includes(col.label))}
                        cellKey={`${origIdx}:${ci}`} origIdx={origIdx} visualRow={vi} colIndex={ci}
                        accentRing={accent.ring} cellRefs={cellRefs}
                        onUpdateCell={updateCell} onSetActiveCell={setActiveCell}
                        onKeyDown={handleSortedCellKeyDown} fmt={fmt} />
                    ))}
                    <td className="px-1 py-1 text-center">
                      {(!canDelete || canDelete(row.data as T)) ? (
                        <button onClick={() => toggleDelete(origIdx)}
                          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10 transition-colors"
                          title="刪除此列" aria-label="刪除此列">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="p-1 text-muted-foreground/30 cursor-not-allowed" title="系統自動建立，不可刪除">
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SpreadsheetLegend allowInsert={allowInsert} />
    </div>
  )
}
