import React from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Filter, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ApprovalControlsProps {
    selectedCount: number
    onBatchApprove: () => void
    onBatchReject: () => void
    onRefresh: () => void
    isProcessing?: boolean
    className?: string
}

export function ApprovalControls({
    selectedCount,
    onBatchApprove,
    onBatchReject,
    onRefresh,
    isProcessing = false,
    className
}: ApprovalControlsProps) {
    return (
        <div className={cn("flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm", className)}>
            <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-700">
                        已選擇: <span className="text-indigo-600">{selectedCount}</span> 筆
                    </span>
                </div>

                <div className="h-6 w-px bg-gray-200" />

                <div className="flex items-center space-x-2">
                    <Button
                        size="sm"
                        onClick={onBatchApprove}
                        disabled={selectedCount === 0 || isProcessing}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        批量核准
                    </Button>

                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={onBatchReject}
                        disabled={selectedCount === 0 || isProcessing}
                    >
                        <XCircle className="h-4 w-4 mr-1.5" />
                        批量駁回
                    </Button>
                </div>
            </div>

            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isProcessing}
                    title="重新整理"
                >
                    <RotateCcw className={cn("h-4 w-4", isProcessing && "animate-spin")} />
                </Button>
            </div>
        </div>
    )
}
