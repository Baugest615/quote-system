'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface BatchInvoicePopoverProps {
  selectedCount: number
  onApply: (invoiceNumber: string) => void
  onCancel: () => void
}

const INVOICE_REGEX = /^[A-Za-z]{2}-\d{8}$/

export function BatchInvoicePopover({ selectedCount, onApply, onCancel }: BatchInvoicePopoverProps) {
  const [value, setValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const isValid = INVOICE_REGEX.test(value)

  const openPopover = () => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
    setIsOpen(true)
  }

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // 點擊外部關閉
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const handleApply = () => {
    if (!isValid) return
    onApply(value.toUpperCase())
    setValue('')
    setIsOpen(false)
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        onClick={openPopover}
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
      >
        <FileText className="h-4 w-4" />
        批次填入發票 ({selectedCount})
      </Button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 bg-card border rounded-lg shadow-lg p-4 w-80"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">批次填入發票號碼</h4>
            <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            將套用至已選取的 {selectedCount} 筆項目
          </p>

          <div className="space-y-3">
            <div>
              <Input
                ref={inputRef}
                placeholder="例：AB-12345678"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply()
                  if (e.key === 'Escape') setIsOpen(false)
                }}
                className={value && !isValid ? 'border-destructive' : ''}
              />
              {value && !isValid && (
                <p className="text-xs text-destructive mt-1">格式：2 字母 + 連字號 + 8 位數字</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setIsOpen(false); onCancel() }}>
                取消
              </Button>
              <Button size="sm" onClick={handleApply} disabled={!isValid}>
                套用
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
