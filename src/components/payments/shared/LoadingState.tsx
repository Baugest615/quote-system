// 載入狀態組件
// 統一的載入動畫

import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LoadingStateProps {
    message?: string
    size?: 'sm' | 'md' | 'lg'
    fullScreen?: boolean
    className?: string
}

const SIZE_CONFIG = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16'
} as const

export function LoadingState({
    message = '載入中...',
    size = 'md',
    fullScreen = false,
    className
}: LoadingStateProps) {
    const content = (
        <div className={cn('flex flex-col items-center justify-center', className)}>
            <Loader2 className={cn('animate-spin text-indigo-600', SIZE_CONFIG[size])} />
            {message && (
                <p className="mt-4 text-sm text-gray-600">{message}</p>
            )}
        </div>
    )

    if (fullScreen) {
        return (
            <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
                {content}
            </div>
        )
    }

    return (
        <div className="py-12">
            {content}
        </div>
    )
}
