// 統一的狀態徽章組件
// 用於顯示各種狀態（待審核、已核准、已駁回等）

import React from 'react'
import {
    Clock,
    CheckCircle,
    XCircle,
    Receipt,
    AlertCircle,
    FileCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type PaymentStatusType =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'confirmed'
    | 'ready'
    | 'incomplete'

export interface PaymentStatusBadgeProps {
    status: PaymentStatusType
    size?: 'sm' | 'md' | 'lg'
    showIcon?: boolean
    className?: string
}

const STATUS_CONFIG = {
    pending: {
        label: '待審核',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: Clock
    },
    approved: {
        label: '已核准',
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle
    },
    rejected: {
        label: '已駁回',
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle
    },
    confirmed: {
        label: '已確認',
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: Receipt
    },
    ready: {
        label: '已備妥',
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: FileCheck
    },
    incomplete: {
        label: '待補件',
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        icon: AlertCircle
    }
} as const

const SIZE_CONFIG = {
    sm: {
        container: 'px-2 py-0.5 text-xs',
        icon: 'h-3 w-3'
    },
    md: {
        container: 'px-2.5 py-1 text-sm',
        icon: 'h-3.5 w-3.5'
    },
    lg: {
        container: 'px-3 py-1.5 text-base',
        icon: 'h-4 w-4'
    }
} as const

export function PaymentStatusBadge({
    status,
    size = 'md',
    showIcon = true,
    className
}: PaymentStatusBadgeProps) {
    const config = STATUS_CONFIG[status]
    const sizeConfig = SIZE_CONFIG[size]
    const Icon = config.icon

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border font-medium',
                config.color,
                sizeConfig.container,
                className
            )}
        >
            {showIcon && <Icon className={cn(sizeConfig.icon, 'mr-1')} />}
            {config.label}
        </span>
    )
}
