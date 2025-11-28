// 空狀態組件
// 當沒有資料時顯示的友好提示

import React from 'react'
import { FileText, Search, Filter, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EmptyStateType = 'no-data' | 'no-results' | 'no-filter-results' | 'error'

export interface EmptyStateProps {
    type?: EmptyStateType
    title?: string
    description?: string
    action?: {
        label: string
        onClick: () => void
    }
    className?: string
}

const EMPTY_STATE_CONFIG = {
    'no-data': {
        icon: Inbox,
        defaultTitle: '沒有資料',
        defaultDescription: '目前沒有任何項目'
    },
    'no-results': {
        icon: Search,
        defaultTitle: '沒有找到結果',
        defaultDescription: '請嘗試其他搜尋關鍵字'
    },
    'no-filter-results': {
        icon: Filter,
        defaultTitle: '沒有符合條件的項目',
        defaultDescription: '請調整篩選條件'
    },
    'error': {
        icon: FileText,
        defaultTitle: '載入失敗',
        defaultDescription: '無法載入資料，請稍後再試'
    }
} as const

export function EmptyState({
    type = 'no-data',
    title,
    description,
    action,
    className
}: EmptyStateProps) {
    const config = EMPTY_STATE_CONFIG[type]
    const Icon = config.icon

    return (
        <div className={cn('text-center py-12', className)}>
            <Icon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-sm font-medium text-gray-900">
                {title || config.defaultTitle}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
                {description || config.defaultDescription}
            </p>
            {action && (
                <div className="mt-6">
                    <Button onClick={action.onClick} variant="outline">
                        {action.label}
                    </Button>
                </div>
            )}
        </div>
    )
}
