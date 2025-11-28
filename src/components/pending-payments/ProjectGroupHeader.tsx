// Project Group Header Component for Pending Payments

import { ChevronDown, ChevronRight, FolderOpen, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectGroup, getCompletionPercentage, getStatusBadgeColor } from '@/lib/pending-payments/grouping-utils'

interface ProjectGroupHeaderProps {
    group: ProjectGroup
    onToggle: (projectId: string) => void
    onSelectAll?: (projectId: string) => void
}

export function ProjectGroupHeader({ group, onToggle, onSelectAll }: ProjectGroupHeaderProps) {
    const completionPercentage = getCompletionPercentage(group)
    const badgeColor = getStatusBadgeColor(group)

    return (
        <div
            className={`border-b px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${group.hasRejected ? 'bg-red-50' : ''
                }`}
            onClick={() => onToggle(group.projectId)}
        >
            <div className="flex items-center justify-between">
                {/* Left side: Project info */}
                <div className="flex items-center space-x-3 flex-1">
                    {/* Expand/Collapse icon */}
                    <div className="flex-shrink-0">
                        {group.isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-gray-500" />
                        ) : (
                            <ChevronRight className="h-5 w-5 text-gray-500" />
                        )}
                    </div>

                    {/* Project icon */}
                    <FolderOpen className="h-5 w-5 text-indigo-500 flex-shrink-0" />

                    {/* Project name and client */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                            <h3 className="font-semibold text-gray-900 truncate">
                                {group.projectName}
                            </h3>
                            {group.hasRejected && (
                                <span className="flex items-center text-xs text-red-600">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    有駁回項目
                                </span>
                            )}
                        </div>
                        {group.clientName && (
                            <p className="text-sm text-gray-500 truncate">
                                客戶：{group.clientName}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right side: Stats */}
                <div className="flex items-center space-x-4 ml-4" onClick={(e) => e.stopPropagation()}>
                    {/* Items count */}
                    <div className="text-sm text-gray-600">
                        <span className="font-medium">{group.totalItems}</span> 個項目
                    </div>

                    {/* Total cost */}
                    <div className="text-sm font-semibold text-gray-900">
                        NT$ {group.totalCost.toLocaleString()}
                    </div>

                    {/* Completion badge */}
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${badgeColor}`}>
                        {completionPercentage === 100 ? (
                            <span className="flex items-center">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                已備妥
                            </span>
                        ) : (
                            <span>
                                {group.readyItems}/{group.totalItems} 完成
                            </span>
                        )}
                    </div>

                    {/* Select all button (optional) */}
                    {onSelectAll && completionPercentage === 100 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation()
                                onSelectAll(group.projectId)
                            }}
                            className="text-xs"
                        >
                            全選
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            {!group.hasRejected && completionPercentage > 0 && completionPercentage < 100 && (
                <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                    <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${completionPercentage}%` }}
                    />
                </div>
            )}
        </div>
    )
}
