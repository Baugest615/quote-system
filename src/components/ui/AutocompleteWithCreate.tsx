'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Input } from './input'
import { cn } from '@/lib/utils'
import { X, Plus } from 'lucide-react'

// --- Types ---
export interface AutocompleteOption<T = unknown> {
  label: string
  value: string
  description?: string
  data?: T
}

interface AutocompleteWithCreateProps<T = unknown> {
  selectedId: string | null
  inputText: string
  onSelect: (id: string, data?: T) => void
  onCreateIntent: (text: string) => void
  onClear: () => void
  options: AutocompleteOption<T>[]
  placeholder?: string
  disabled?: boolean
  allowCreate?: boolean
  createLabel?: string
  className?: string
  onSearch?: (term: string) => void
}

// --- Portal Dropdown (inline, position-aware) ---
function DropdownPortal({
  isOpen,
  triggerRef,
  children,
}: {
  isOpen: boolean
  triggerRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      })
    }

    updatePosition()

    // Recalculate on scroll/resize so dropdown follows the trigger
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, triggerRef])

  if (!isOpen || typeof window === 'undefined') return null

  return createPortal(
    <div
      className="fixed z-50 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
      style={{
        top: `${pos.top + 4}px`,
        left: `${pos.left}px`,
        minWidth: `${pos.width}px`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}

// --- Main Component ---
export function AutocompleteWithCreate<T = unknown>({
  selectedId,
  inputText,
  onSelect,
  onCreateIntent,
  onClear,
  options,
  placeholder = '搜尋或輸入...',
  disabled = false,
  allowCreate = true,
  createLabel = '新增',
  className,
  onSearch,
}: AutocompleteWithCreateProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [localInput, setLocalInput] = useState(inputText)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isCreateMode, setIsCreateMode] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Sync external inputText changes
  useEffect(() => {
    if (selectedId) {
      const opt = options.find((o) => o.value === selectedId)
      setLocalInput(opt?.label || inputText)
      setIsCreateMode(false)
    } else if (inputText) {
      setLocalInput(inputText)
    }
  }, [selectedId, inputText, options])

  // Filter options
  const filteredOptions = useMemo(() => {
    const term = localInput.trim().toLowerCase()
    if (!term) return options
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        (opt.description && opt.description.toLowerCase().includes(term))
    )
  }, [localInput, options])

  // Should show "create new" option?
  const showCreateOption = useMemo(() => {
    if (!allowCreate || !localInput.trim()) return false
    const exactMatch = options.some(
      (opt) => opt.label.toLowerCase() === localInput.trim().toLowerCase()
    )
    return !exactMatch
  }, [allowCreate, localInput, options])

  // Total items in dropdown (filtered + optional create)
  const totalItems = filteredOptions.length + (showCreateOption ? 1 : 0)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        if (isOpen) {
          handleBlurCommit()
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, localInput, selectedId, allowCreate])

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.children
      if (items[highlightedIndex]) {
        ;(items[highlightedIndex] as HTMLElement).scrollIntoView({
          block: 'nearest',
        })
      }
    }
  }, [highlightedIndex, isOpen])

  // When dropdown closes with uncommitted text
  const handleBlurCommit = useCallback(() => {
    setIsOpen(false)
    const trimmed = localInput.trim()
    if (!trimmed) {
      // Empty input → clear
      if (selectedId || isCreateMode) {
        onClear()
        setIsCreateMode(false)
      }
      return
    }
    // If already has a valid selection, keep it
    if (selectedId) return
    // Otherwise, treat as create intent
    if (allowCreate && trimmed) {
      onCreateIntent(trimmed)
      setIsCreateMode(true)
    }
  }, [localInput, selectedId, isCreateMode, allowCreate, onClear, onCreateIntent])

  const handleSelectOption = useCallback(
    (option: AutocompleteOption<T>) => {
      setLocalInput(option.label)
      setIsOpen(false)
      setIsCreateMode(false)
      onSelect(option.value, option.data)
    },
    [onSelect]
  )

  const handleCreateClick = useCallback(() => {
    const trimmed = localInput.trim()
    if (trimmed) {
      setIsOpen(false)
      setIsCreateMode(true)
      onCreateIntent(trimmed)
    }
  }, [localInput, onCreateIntent])

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setLocalInput('')
      setIsCreateMode(false)
      setIsOpen(false)
      onClear()
    },
    [onClear]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalInput(val)
    setHighlightedIndex(0)
    if (!isOpen) setIsOpen(true)
    // Trigger external search (for lazy-loading)
    onSearch?.(val)
    // If user edits text after selecting, clear the selection
    if (selectedId) {
      const opt = options.find((o) => o.value === selectedId)
      if (opt && val !== opt.label) {
        onClear()
        setIsCreateMode(false)
      }
    }
  }

  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true)
      setHighlightedIndex(0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex < filteredOptions.length) {
          handleSelectOption(filteredOptions[highlightedIndex])
        } else if (showCreateOption) {
          handleCreateClick()
        }
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  const hasValue = selectedId || (isCreateMode && localInput.trim())

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={localInput}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full pr-8',
            isCreateMode && 'border-amber-400 focus-visible:ring-amber-400'
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasValue && (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <DropdownPortal isOpen={isOpen && !disabled} triggerRef={containerRef}>
        <div ref={listRef}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, index) => (
              <div
                key={opt.value}
                onClick={() => handleSelectOption(opt)}
                className={cn(
                  'px-3 py-2 text-sm cursor-pointer border-b last:border-b-0 border-border/30',
                  index === highlightedIndex
                    ? 'bg-accent'
                    : 'hover:bg-accent/50',
                  opt.value === selectedId && 'text-primary font-medium'
                )}
              >
                <div>{opt.label}</div>
                {opt.description && (
                  <div className="text-xs text-muted-foreground">
                    {opt.description}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground italic">
              無相符結果
            </div>
          )}
          {showCreateOption && (
            <div
              onClick={handleCreateClick}
              className={cn(
                'px-3 py-2.5 text-sm cursor-pointer border-t border-dashed border-border',
                'flex items-center gap-1.5 text-blue-600 dark:text-blue-400',
                highlightedIndex === filteredOptions.length
                  ? 'bg-blue-50 dark:bg-blue-950/30'
                  : 'hover:bg-blue-50 dark:hover:bg-blue-950/30'
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              {createLabel}：「{localInput.trim()}」
            </div>
          )}
        </div>
      </DropdownPortal>
    </div>
  )
}
