import { Plus, Save, X, Undo2, Table2, FilterX } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpreadsheetToolbarProps {
    isFiltered: boolean
    filterCount: number
    onClearFilters: () => void
    allowInsert: boolean
    onAddRow: () => void
    deletedCount: number
    onUndoAllDeleted: () => void
    hasUnsaved: boolean
    pendingCount: number
    saving: boolean
    onDiscardAll: () => void
    onSave: () => void
    onClose: () => void
    accentBtnClass: string
}

export function SpreadsheetToolbar({
    isFiltered, filterCount, onClearFilters,
    allowInsert, onAddRow,
    deletedCount, onUndoAllDeleted,
    hasUnsaved, pendingCount, saving, onDiscardAll, onSave,
    onClose, accentBtnClass,
}: SpreadsheetToolbarProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Table2 className="w-4 h-4" />
                <span>試算表模式</span>
            </div>
            <div className="flex-1" />
            {isFiltered && (
                <button onClick={onClearFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors">
                    <FilterX className="w-3.5 h-3.5" />清除篩選 ({filterCount})
                </button>
            )}
            {allowInsert && (
                <button onClick={onAddRow} disabled={isFiltered}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isFiltered ? '篩選中無法新增列，請先清除篩選' : undefined}>
                    <Plus className="w-3.5 h-3.5" />新增列
                </button>
            )}
            {deletedCount > 0 && (
                <button onClick={onUndoAllDeleted}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-warning bg-warning/10 hover:bg-warning/20 rounded-lg transition-colors">
                    <Undo2 className="w-3.5 h-3.5" />復原刪除 ({deletedCount})
                </button>
            )}
            {hasUnsaved && (
                <>
                    <button onClick={onDiscardAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-accent transition-colors">
                        放棄變更
                    </button>
                    <button onClick={onSave} disabled={saving}
                        className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50', accentBtnClass)}>
                        <Save className="w-3.5 h-3.5" />
                        {saving ? '儲存中...' : `儲存 ${pendingCount} 筆變更`}
                    </button>
                </>
            )}
            <button onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />離開
            </button>
        </div>
    )
}
