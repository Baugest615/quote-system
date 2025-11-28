// 成本輸入組件
// 統一的成本金額輸入框，包含驗證和格式化

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import { formatNumber } from '@/lib/payments/formatting'
import { cn } from '@/lib/utils'

export interface CostInputProps {
    value: number
    onChange: (value: number) => void
    disabled?: boolean
    placeholder?: string
    className?: string
    showValidation?: boolean
    min?: number
    max?: number
    id?: string
    name?: string
}

export function CostInput({
    value,
    onChange,
    disabled = false,
    placeholder = '請輸入成本',
    className,
    showValidation = true,
    min = 0,
    max = 10000000,
    id,
    name
}: CostInputProps) {
    const [inputValue, setInputValue] = useState(value.toString())
    const [isFocused, setIsFocused] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // 同步外部值
    useEffect(() => {
        if (!isFocused) {
            setInputValue(value.toString())
        }
    }, [value, isFocused])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        setInputValue(newValue)

        // 驗證
        if (newValue === '') {
            setError(showValidation ? '成本金額為必填' : null)
            onChange(0)
            return
        }

        const numValue = parseFloat(newValue)
        if (isNaN(numValue)) {
            setError(showValidation ? '請輸入有效的數字' : null)
            return
        }

        if (numValue < min) {
            setError(showValidation ? `金額不得小於 ${formatNumber(min)}` : null)
            return
        }

        if (numValue > max) {
            setError(showValidation ? `金額不得大於 ${formatNumber(max)}` : null)
            return
        }

        setError(null)
        onChange(numValue)
    }

    const handleBlur = () => {
        setIsFocused(false)

        // 格式化顯示
        if (value > 0) {
            setInputValue(value.toString())
        }
    }

    const handleFocus = () => {
        setIsFocused(true)
    }

    const hasError = showValidation && error

    return (
        <div className="relative">
            <Input
                type="number"
                id={id}
                name={name}
                value={inputValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={disabled}
                placeholder={placeholder}
                className={cn(
                    'text-right',
                    hasError && 'border-red-500 focus:border-red-500 focus:ring-red-500',
                    className
                )}
                min={min}
                max={max}
                step="0.01"
            />
            {hasError && (
                <div className="absolute -bottom-5 left-0 flex items-center text-xs text-red-600">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {error}
                </div>
            )}
        </div>
    )
}
