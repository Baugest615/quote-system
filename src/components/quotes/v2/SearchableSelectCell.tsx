'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { cn } from '@/lib/utils'

interface Option {
    label: string
    value: string
    subLabel?: string
    data?: any
}

interface SearchableSelectCellProps {
    value: string | null
    onChange: (value: string, data?: any) => void
    options: Option[]
    placeholder?: string
    className?: string
    displayValue?: string // Optional: what to show when not editing (if different from value)
    allowCustomValue?: boolean // 🆕 New prop for free editing
}

export function SearchableSelectCell({
    value,
    onChange,
    options,
    placeholder = '搜尋...',
    className,
    displayValue,
    allowCustomValue = false
}: SearchableSelectCellProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Initialize search term when editing starts
    useEffect(() => {
        if (isEditing) {
            // Find current label to show as initial search term
            const currentOption = options.find(opt => opt.value === value)
            setSearchTerm(currentOption ? currentOption.label : (displayValue || value || ''))
            setIsOpen(true)
            setTimeout(() => inputRef.current?.focus(), 0)
        }
    }, [isEditing, value, options, displayValue])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node) &&
                !(event.target as HTMLElement).closest('.portal-dropdown-content')
            ) {
                // 🆕 If custom value is allowed and no option selected, use search term
                if (allowCustomValue && isEditing) {
                    // Only update if value changed
                    if (searchTerm !== value && searchTerm !== displayValue) {
                        onChange(searchTerm)
                    }
                }
                setIsEditing(false)
                setIsOpen(false)
            }
        }

        if (isEditing) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isEditing, allowCustomValue, searchTerm, value, displayValue, onChange])

    const filteredOptions = searchTerm.trim()
        ? options.filter(opt =>
            opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        : options

    const handleSelect = (option: Option) => {
        onChange(option.value, option.data)
        setIsEditing(false)
        setIsOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (filteredOptions.length > 0) {
                handleSelect(filteredOptions[0])
            } else if (allowCustomValue) {
                // 🆕 Allow custom value on Enter if no options match
                onChange(searchTerm)
                setIsEditing(false)
                setIsOpen(false)
            }
        } else if (e.key === 'Escape') {
            setIsEditing(false)
            setIsOpen(false)
        }
    }

    if (isEditing) {
        return (
            <div ref={containerRef} className="w-full h-full relative">
                <Input
                    ref={inputRef}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={cn(
                        "w-full h-8 p-1 text-sm rounded-none border-blue-500 focus:ring-0",
                        className
                    )}
                    placeholder={placeholder}
                />
                <PortalDropdown
                    isOpen={isOpen}
                    triggerRef={containerRef}
                    className="portal-dropdown-content max-h-60 w-64 overflow-y-auto bg-white border shadow-lg rounded-md z-[9999]"
                >
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt) => (
                            <div
                                key={opt.value}
                                onClick={() => handleSelect(opt)}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b last:border-b-0 border-gray-50"
                            >
                                <div className="font-medium text-gray-900">{opt.label}</div>
                                {opt.subLabel && (
                                    <div className="text-xs text-gray-500">{opt.subLabel}</div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="px-3 py-2 text-sm text-gray-500 italic">
                            {allowCustomValue ? '按 Enter 使用輸入值' : '無相符結果'}
                        </div>
                    )}
                </PortalDropdown>
            </div>
        )
    }

    // Display Mode
    const currentOption = options.find(opt => opt.value === value)
    const displayText = displayValue || (currentOption ? currentOption.label : value)

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={cn(
                "w-full h-full min-h-[2rem] flex items-center px-2 cursor-pointer hover:bg-gray-50 rounded text-sm truncate",
                !value && "text-gray-400",
                className
            )}
            title={displayText || ''}
        >
            {displayText || placeholder}
        </div>
    )
}
