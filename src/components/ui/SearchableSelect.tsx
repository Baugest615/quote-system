'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'
import { ChevronDown, X } from 'lucide-react'

export interface SelectOption<T = unknown> {
  label: string
  value: string
  description?: string
  data?: T
}

interface SearchableSelectProps<T = unknown> {
  value: string | null
  onChange: (value: string, data?: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  className?: string
  disabled?: boolean
  clearable?: boolean
  loading?: boolean
}

/**
 * 通用可搜尋下拉選單，適用於表單場景
 * 支援搜尋篩選、鍵盤操作、清除選項
 */
export function SearchableSelect<T = unknown>({
  value,
  onChange,
  options,
  placeholder = '搜尋選擇...',
  className,
  disabled = false,
  clearable = true,
  loading = false,
}: SearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.value === value)

  const filteredOptions = searchTerm.trim()
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (opt.description && opt.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : options

  // 關閉下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 聚焦
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      setHighlightedIndex(0)
    }
  }, [isOpen])

  const handleSelect = useCallback((option: SelectOption<T>) => {
    onChange(option.value, option.data)
    setIsOpen(false)
    setSearchTerm('')
  }, [onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('', undefined)
    setSearchTerm('')
  }, [onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSearchTerm('')
        break
    }
  }

  // 自動捲動至高亮項目
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.children
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* 觸發按鈕 */}
      {!isOpen ? (
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
            'hover:bg-accent/50 transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
            !selectedOption && 'text-muted-foreground'
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {clearable && value && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      ) : (
        <Input
          ref={inputRef}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setHighlightedIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full"
        />
      )}

      {/* 下拉選單 */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-card shadow-lg"
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">載入中...</div>
          ) : filteredOptions.length > 0 ? (
            filteredOptions.map((opt, index) => (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt)}
                className={cn(
                  'px-3 py-2 text-sm cursor-pointer border-b last:border-b-0 border-border/30',
                  index === highlightedIndex ? 'bg-accent' : 'hover:bg-accent/50',
                  opt.value === value && 'text-primary font-medium'
                )}
              >
                <div>{opt.label}</div>
                {opt.description && (
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                )}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground italic">
              無相符結果
            </div>
          )}
        </div>
      )}
    </div>
  )
}
