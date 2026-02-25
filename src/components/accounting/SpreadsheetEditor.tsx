'use client'

import { useCallback, useRef } from 'react'
import { Plus, Save, X, Undo2, Trash2, Table2, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchableSelectCell } from '@/components/quotes/v2/SearchableSelectCell'
import type { SpreadsheetColumn, RowStatus, BatchSaveResult } from '@/lib/spreadsheet-utils'
import { useSpreadsheetOperations } from '@/hooks/accounting/useSpreadsheetOperations'

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
// Constants
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
  const {
    visibleRows,
    deletedCount,
    pendingChanges,
    hasUnsaved,
    activeCell,
    setActiveCell,
    saving,
    cellRefs,
    addRow,
    updateCell,
    toggleDelete,
    undoAllDeleted,
    discardAll,
    handlePaste,
    handleCellKeyDown,
    handleSave,
  } = useSpreadsheetOperations({ columns, initialRows, year, emptyRow, onAutoCalc, onBatchSave })

  const confirm = useConfirm()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(async () => {
    if (hasUnsaved) {
      const ok = await confirm({
        title: '未儲存的變更',
        description: '試算表中有未儲存的變更，確定要離開嗎？',
      })
      if (!ok) return
    }
    onClose()
  }, [hasUnsaved, onClose, confirm])

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
                {columns.map((col) => (
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
                          ) : col.type === 'autocomplete' ? (
                            <SearchableSelectCell
                              value={String(value ?? '')}
                              onChange={(val) => updateCell(ri, col.key, val)}
                              options={(col.suggestions || []).map(s => ({ label: s, value: s }))}
                              placeholder="搜尋..."
                              allowCustomValue={true}
                              className="text-xs"
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
