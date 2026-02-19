// 專案標題組件
// 用於顯示專案資訊、統計和操作按鈕

import React from 'react'
import { FolderOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { PaymentStatusBadge, PaymentStatusType } from './PaymentStatusBadge'
import { formatCurrency } from '@/lib/payments/formatting'
import { getCompletionPercentage } from '@/lib/payments/grouping'
import type { ProjectGroup } from '@/lib/payments/types'
import { cn } from '@/lib/utils'

export interface ProjectHeaderProps<T = any> {
    group: ProjectGroup<T>
    onToggle?: () => void
    actions?: React.ReactNode
    showProgress?: boolean
    className?: string
}

export function ProjectHeader<T>({
    group,
    onToggle,
    actions,
    showProgress = true,
    className
}: ProjectHeaderProps<T>) {
    const completionPercentage = getCompletionPercentage(group)

    // 狀態映射
    const statusMap: Record<typeof group.status, PaymentStatusType> = {
        pending: 'incomplete',
        partial: 'pending',
        complete: 'ready',
        rejected: 'rejected'
    }

    return (
        <div
            className={cn(
                'border-b px-6 py-4 bg-secondary hover:bg-secondary/50 transition-colors',
                className
            )}
        >
            <div className="flex items-center justify-between">
                {/* Left side */}
                <div className="flex items-center space-x-3 flex-1">
                    {/* Expand/Collapse button */}
                    {onToggle && (
                        <button
                            onClick={onToggle}
                            className="text-muted-foreground hover:text-foreground/70 transition-colors"
                            aria-label={group.isExpanded ? '收合' : '展開'}
                        >
                            {group.isExpanded ? (
                                <ChevronDown className="h-5 w-5" />
                            ) : (
                                <ChevronRight className="h-5 w-5" />
                            )}
                        </button>
                    )}

                    {/* Project icon */}
                    <FolderOpen className="h-5 w-5 text-primary flex-shrink-0" />

                    {/* Project info */}
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">
                            {group.projectName}
                        </h3>
                        {group.clientName && (
                            <p className="text-sm text-muted-foreground truncate">
                                客戶：{group.clientName}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center space-x-4 ml-4">
                    {/* Stats */}
                    <div className="flex items-center space-x-3 text-sm">
                        <span className="text-muted-foreground">
                            <span className="font-medium text-foreground">{group.totalItems}</span> 個項目
                        </span>
                        <span className="text-muted-foreground">|</span>
                        <span className="font-semibold text-foreground">
                            {formatCurrency(group.totalCost)}
                        </span>
                    </div>

                    {/* Status badge */}
                    <PaymentStatusBadge status={statusMap[group.status]} size="sm" />

                    {/* Actions */}
                    {actions && <div className="flex items-center space-x-2">{actions}</div>}
                </div>
            </div>

            {/* Progress bar */}
            {showProgress && group.status === 'partial' && (
                <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>完成進度</span>
                        <span>{group.readyItems}/{group.totalItems} ({completionPercentage}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                            className="bg-success h-full transition-all duration-300 ease-out"
                            style={{ width: `${completionPercentage}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
