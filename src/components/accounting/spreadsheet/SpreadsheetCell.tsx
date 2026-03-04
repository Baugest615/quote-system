import React from 'react'
import { cn } from '@/lib/utils'
import { SearchableSelectCell } from '@/components/quotes/v2/SearchableSelectCell'
import type { SpreadsheetColumn } from '@/lib/spreadsheet-utils'

interface SpreadsheetCellProps<T> {
    col: SpreadsheetColumn<T>
    value: unknown
    isActive: boolean
    isRequired: boolean
    cellKey: string
    origIdx: number
    visualRow: number
    colIndex: number
    accentRing: string
    cellRefs: React.MutableRefObject<Map<string, HTMLElement>>
    onUpdateCell: (origIdx: number, key: keyof T, value: any) => void
    onSetActiveCell: (cell: { row: number; col: number }) => void
    onKeyDown: (e: React.KeyboardEvent, origIdx: number, visualRow: number, colIndex: number) => void
    fmt: (n: unknown) => string
}

export function SpreadsheetCell<T>({
    col, value, isActive, isRequired, cellKey, origIdx, visualRow, colIndex,
    accentRing, cellRefs, onUpdateCell, onSetActiveCell, onKeyDown, fmt,
}: SpreadsheetCellProps<T>) {
    if (col.readOnly) {
        return (
            <td className={cn('px-2 py-1 text-muted-foreground italic bg-muted/30', col.width)} title="自動計算">
                <span className="text-xs tabular-nums">
                    {col.type === 'number' ? fmt(value) : String(value ?? '')}
                </span>
            </td>
        )
    }

    const inputClass = (extra?: string) => cn(
        'w-full h-8 px-1.5 text-xs border rounded transition-all bg-transparent',
        extra,
        isActive ? `ring-2 ${accentRing} border-transparent bg-card` : 'border-transparent hover:border-border'
    )

    const setRef = (el: HTMLElement | null) => {
        if (el) cellRefs.current.set(cellKey, el)
        else cellRefs.current.delete(cellKey)
    }

    return (
        <td className={cn('px-0.5 py-0.5', col.width, isRequired && 'bg-destructive/10')}
            onClick={() => onSetActiveCell({ row: origIdx, col: colIndex })}>
            {col.type === 'select' ? (
                <select ref={setRef as React.Ref<HTMLSelectElement>}
                    value={String(value ?? '')}
                    onChange={e => onUpdateCell(origIdx, col.key, e.target.value)}
                    onKeyDown={e => onKeyDown(e, origIdx, visualRow, colIndex)}
                    onFocus={() => onSetActiveCell({ row: origIdx, col: colIndex })}
                    className={inputClass()}>
                    <option value="">--</option>
                    {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : col.type === 'date' ? (
                <input ref={setRef as React.Ref<HTMLInputElement>} type="date"
                    value={String(value ?? '')}
                    onChange={e => onUpdateCell(origIdx, col.key, e.target.value || null)}
                    onKeyDown={e => onKeyDown(e, origIdx, visualRow, colIndex)}
                    onFocus={() => onSetActiveCell({ row: origIdx, col: colIndex })}
                    className={inputClass()} />
            ) : col.type === 'number' ? (
                <input ref={setRef as React.Ref<HTMLInputElement>} type="number"
                    value={value === 0 ? '' : String(value ?? '')}
                    onChange={e => onUpdateCell(origIdx, col.key, e.target.value === '' ? 0 : Number(e.target.value))}
                    onKeyDown={e => onKeyDown(e, origIdx, visualRow, colIndex)}
                    onFocus={() => onSetActiveCell({ row: origIdx, col: colIndex })}
                    className={inputClass('text-right tabular-nums')} placeholder="0" />
            ) : col.type === 'autocomplete' ? (
                <SearchableSelectCell
                    value={String(value ?? '')}
                    onChange={(val) => onUpdateCell(origIdx, col.key, val)}
                    options={col.suggestionOptions || (col.suggestions || []).map(s => ({ label: s, value: s }))}
                    placeholder="搜尋..." allowCustomValue={true} className="text-xs" />
            ) : (
                <input ref={setRef as React.Ref<HTMLInputElement>} type="text"
                    value={String(value ?? '')}
                    onChange={e => onUpdateCell(origIdx, col.key, e.target.value)}
                    onKeyDown={e => onKeyDown(e, origIdx, visualRow, colIndex)}
                    onFocus={() => onSetActiveCell({ row: origIdx, col: colIndex })}
                    className={inputClass()} />
            )}
        </td>
    )
}
