// 發票號碼輸入組件
// 統一的發票號碼輸入框，包含格式驗證

import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Receipt, AlertCircle, CheckCircle } from 'lucide-react'
import { isValidInvoiceFormat } from '@/lib/payments/validation'
import { cn } from '@/lib/utils'

export interface InvoiceInputProps {
    value: string | null
    onChange: (value: string) => void
    disabled?: boolean
    placeholder?: string
    className?: string
    showValidation?: boolean
}

export function InvoiceInput({
    value,
    onChange,
    disabled = false,
    placeholder = '發票號碼 (AB-12345678)',
    className,
    showValidation = true
}: InvoiceInputProps) {
    const [isFocused, setIsFocused] = useState(false)

    const isValid = value ? isValidInvoiceFormat(value) : null
    const showError = showValidation && value && !isValid && !isFocused
    const showSuccess = showValidation && isValid

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let newValue = e.target.value.toUpperCase()

        // 自動添加連字號
        if (newValue.length === 2 && !newValue.includes('-')) {
            newValue = newValue + '-'
        }

        // 限制格式：2個字母 + 連字號 + 8個數字
        if (newValue.length > 11) {
            newValue = newValue.slice(0, 11)
        }

        onChange(newValue)
    }

    return (
        <div className="relative">
            <div className="relative">
                <Receipt className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    type="text"
                    value={value || ''}
                    onChange={handleChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    disabled={disabled}
                    placeholder={placeholder}
                    className={cn(
                        'pl-10 pr-10',
                        showError && 'border-red-500 focus:border-red-500 focus:ring-red-500',
                        showSuccess && 'border-green-500 focus:border-green-500 focus:ring-green-500',
                        className
                    )}
                    maxLength={11}
                />
                {showSuccess && (
                    <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-green-600" />
                )}
                {showError && (
                    <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-600" />
                )}
            </div>
            {showError && (
                <div className="mt-1 text-xs text-red-600">
                    格式錯誤，正確格式：AB-12345678
                </div>
            )}
        </div>
    )
}
