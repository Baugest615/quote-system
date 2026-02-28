'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FilterValue } from '@/hooks/useColumnFilters'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ColumnFilterPopoverProps {
  /** Current filter value (null = no filter) */
  value: FilterValue | null
  /** Filter type to render */
  filterType: 'text' | 'select' | 'number' | 'date'
  /** Options for select type */
  options?: string[]
  /** Callback when filter is applied or cleared */
  onChange: (value: FilterValue | null) => void
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ColumnFilterPopover({
  value,
  filterType,
  options = [],
  onChange,
}: ColumnFilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const hasFilter = value != null && isFilterActive(value)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`p-0.5 rounded hover:bg-muted transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(prev => !prev)
        }}
        title="篩選"
      >
        <Filter className="h-3.5 w-3.5" />
      </button>
      {isOpen && (
        <FilterPanel
          ref={panelRef}
          triggerRef={triggerRef}
          filterType={filterType}
          options={options}
          value={value}
          onChange={onChange}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Filter panel (portal)
// ---------------------------------------------------------------------------

import { forwardRef } from 'react'

interface FilterPanelProps {
  triggerRef: React.RefObject<HTMLButtonElement>
  filterType: 'text' | 'select' | 'number' | 'date'
  options: string[]
  value: FilterValue | null
  onChange: (value: FilterValue | null) => void
  onClose: () => void
}

const FilterPanel = forwardRef<HTMLDivElement, FilterPanelProps>(
  function FilterPanel({ triggerRef, filterType, options, value, onChange, onClose }, ref) {
    const [position, setPosition] = useState({ top: 0, left: 0 })

    useEffect(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const panelWidth = 240
        // Prevent overflow on right edge
        const left = Math.min(rect.left, window.innerWidth - panelWidth - 16)
        setPosition({
          top: rect.bottom + 4,
          left: Math.max(8, left),
        })
      }
    }, [triggerRef])

    if (typeof window === 'undefined') return null

    return createPortal(
      <div
        ref={ref}
        className="fixed z-[100] w-60 bg-card border border-border rounded-lg shadow-xl p-3 space-y-3"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {filterType === 'text' && (
          <TextFilter value={value as { type: 'text'; value: string } | null} onChange={onChange} />
        )}
        {filterType === 'select' && (
          <SelectFilter
            value={value as { type: 'select'; selected: string[] } | null}
            options={options}
            onChange={onChange}
          />
        )}
        {filterType === 'number' && (
          <NumberFilter value={value as { type: 'number'; min?: number; max?: number } | null} onChange={onChange} />
        )}
        {filterType === 'date' && (
          <DateFilter value={value as { type: 'date'; start?: string; end?: string } | null} onChange={onChange} />
        )}
        <div className="flex justify-between pt-1 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => { onChange(null); onClose() }}
          >
            <X className="h-3 w-3 mr-1" /> 清除
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
          >
            確定
          </Button>
        </div>
      </div>,
      document.body,
    )
  },
)

// ---------------------------------------------------------------------------
// Sub-filters
// ---------------------------------------------------------------------------

function TextFilter({
  value,
  onChange,
}: {
  value: { type: 'text'; value: string } | null
  onChange: (v: FilterValue | null) => void
}) {
  return (
    <Input
      placeholder="搜尋..."
      className="h-8 text-sm"
      value={value?.value ?? ''}
      onChange={(e) => {
        const v = e.target.value
        onChange(v ? { type: 'text', value: v } : null)
      }}
      autoFocus
    />
  )
}

function SelectFilter({
  value,
  options,
  onChange,
}: {
  value: { type: 'select'; selected: string[] } | null
  options: string[]
  onChange: (v: FilterValue | null) => void
}) {
  const selected = value?.selected ?? []
  const allSelected = selected.length === options.length

  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt]
    onChange(next.length > 0 ? { type: 'select', selected: next } : null)
  }

  const toggleAll = () => {
    onChange(allSelected ? null : { type: 'select', selected: [...options] })
  }

  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      <label className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-muted rounded text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="rounded border-border text-primary focus:ring-ring h-3.5 w-3.5"
        />
        <span className="text-muted-foreground">全選</span>
      </label>
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-muted rounded text-sm">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="rounded border-border text-primary focus:ring-ring h-3.5 w-3.5"
          />
          <span className="truncate">{opt}</span>
        </label>
      ))}
    </div>
  )
}

function NumberFilter({
  value,
  onChange,
}: {
  value: { type: 'number'; min?: number; max?: number } | null
  onChange: (v: FilterValue | null) => void
}) {
  const handleChange = (field: 'min' | 'max', raw: string) => {
    const num = raw === '' ? undefined : parseFloat(raw)
    const current = value ?? { type: 'number' as const }
    const next = {
      type: 'number' as const,
      min: field === 'min' ? num : current.min,
      max: field === 'max' ? num : current.max,
    }
    onChange(next.min != null || next.max != null ? next : null)
  }

  return (
    <div className="space-y-2">
      <Input
        type="number"
        placeholder="最小值"
        className="h-8 text-sm"
        value={value?.min ?? ''}
        onChange={(e) => handleChange('min', e.target.value)}
        autoFocus
      />
      <Input
        type="number"
        placeholder="最大值"
        className="h-8 text-sm"
        value={value?.max ?? ''}
        onChange={(e) => handleChange('max', e.target.value)}
      />
    </div>
  )
}

function DateFilter({
  value,
  onChange,
}: {
  value: { type: 'date'; start?: string; end?: string } | null
  onChange: (v: FilterValue | null) => void
}) {
  const handleChange = (field: 'start' | 'end', raw: string) => {
    const current = value ?? { type: 'date' as const }
    const next = {
      type: 'date' as const,
      start: field === 'start' ? (raw || undefined) : current.start,
      end: field === 'end' ? (raw || undefined) : current.end,
    }
    onChange(next.start || next.end ? next : null)
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-muted-foreground">從</label>
        <Input
          type="date"
          className="h-8 text-sm"
          value={value?.start ?? ''}
          onChange={(e) => handleChange('start', e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">至</label>
        <Input
          type="date"
          className="h-8 text-sm"
          value={value?.end ?? ''}
          onChange={(e) => handleChange('end', e.target.value)}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFilterActive(v: FilterValue): boolean {
  switch (v.type) {
    case 'text': return !!v.value
    case 'select': return v.selected.length > 0
    case 'number': return v.min != null || v.max != null
    case 'date': return !!v.start || !!v.end
  }
}
