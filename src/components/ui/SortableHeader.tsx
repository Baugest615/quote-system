'use client'

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import type { SortState } from '@/hooks/useTableSort'

interface SortableHeaderProps<K extends string = string> {
  label: string
  sortKey: K
  sortState: SortState<K>
  onToggleSort: (key: K) => void
  /** Optional filter popover rendered via ColumnFilterPopover */
  filterContent?: React.ReactNode
  className?: string
}

export function SortableHeader<K extends string = string>({
  label,
  sortKey,
  sortState,
  onToggleSort,
  filterContent,
  className = '',
}: SortableHeaderProps<K>) {
  const isActive = sortState.key === sortKey

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors select-none"
        onClick={() => onToggleSort(sortKey)}
      >
        <span className="truncate">{label}</span>
        {isActive && sortState.direction === 'asc' && (
          <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0" />
        )}
        {isActive && sortState.direction === 'desc' && (
          <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0" />
        )}
        {!isActive && (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30 shrink-0" />
        )}
      </button>
      {filterContent}
    </div>
  )
}
