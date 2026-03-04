'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Columns3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ColumnKey, COLUMN_DEFS } from './flat-view-constants'

interface ColumnVisibilityPopoverProps {
  visible: Set<ColumnKey>
  onToggle: (key: ColumnKey) => void
}

export function ColumnVisibilityPopover({ visible, onToggle }: ColumnVisibilityPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const open = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) })
    setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [isOpen])

  const hideableColumns = COLUMN_DEFS.filter(c => c.hideable)
  const hiddenCount = hideableColumns.filter(c => !visible.has(c.key)).length

  return (
    <>
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        onClick={open}
        className={cn('gap-1.5', hiddenCount > 0 && 'border-primary/30 text-primary')}
      >
        <Columns3 className="h-4 w-4" />
        欄位 {hiddenCount > 0 && <span className="text-xs">({hiddenCount} 隱藏)</span>}
      </Button>
      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 w-52 bg-card border rounded-lg shadow-xl p-3 space-y-1 max-h-80 overflow-y-auto"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-xs text-muted-foreground font-medium mb-2">顯示欄位</p>
          {hideableColumns.map(col => (
            <label key={col.key} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-muted rounded text-sm">
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="rounded border-border text-primary focus:ring-ring h-3.5 w-3.5"
              />
              <span className="truncate">{col.label}</span>
            </label>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
