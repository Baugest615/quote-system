'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface EditableCellProps {
    value: any
    onChange: (value: any) => void
    type?: 'text' | 'number' | 'date' | 'select'
    options?: { label: string; value: string; color?: string }[]
    className?: string
    placeholder?: string
}

export function EditableCell({
    value,
    onChange,
    type = 'text',
    options = [],
    className,
    placeholder
}: EditableCellProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [localValue, setLocalValue] = useState(value)
    const inputRef = useRef<HTMLInputElement>(null)
    const selectRef = useRef<HTMLSelectElement>(null)

    useEffect(() => {
        setLocalValue(value)
    }, [value])

    useEffect(() => {
        if (isEditing) {
            if (type === 'select') {
                selectRef.current?.focus()
            } else {
                inputRef.current?.focus()
            }
        }
    }, [isEditing, type])

    const handleBlur = () => {
        setIsEditing(false)
        if (localValue !== value) {
            onChange(localValue)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur()
        } else if (e.key === 'Escape') {
            setLocalValue(value)
            setIsEditing(false)
        }
    }

    if (isEditing) {
        if (type === 'select') {
            return (
                <select
                    ref={selectRef}
                    value={localValue || ''}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className={cn(
                        "w-full h-full p-1 bg-white border border-blue-500 rounded focus:outline-none text-sm",
                        className
                    )}
                >
                    <option value="" disabled>請選擇</option>
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            )
        }

        return (
            <Input
                ref={inputRef}
                type={type}
                value={localValue || ''}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={cn(
                    "w-full h-8 p-1 text-sm rounded-none border-blue-500 focus:ring-0",
                    className
                )}
            />
        )
    }

    // Display Mode
    if (type === 'select') {
        const selectedOption = options.find(opt => opt.value === value)
        return (
            <div
                onClick={() => setIsEditing(true)}
                className={cn(
                    "w-full h-full min-h-[2rem] flex items-center px-2 cursor-pointer hover:bg-gray-50 rounded text-sm",
                    selectedOption?.color, // Apply color if available
                    className
                )}
            >
                {selectedOption ? selectedOption.label : <span className="text-gray-400">{placeholder || '未設定'}</span>}
            </div>
        )
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={cn(
                "w-full h-full min-h-[2rem] flex items-center px-2 cursor-pointer hover:bg-gray-50 rounded text-sm truncate",
                !value && "text-gray-400",
                className
            )}
        >
            {type === 'number' && value ? Number(value).toLocaleString() : (value || placeholder || '空')}
        </div>
    )
}
