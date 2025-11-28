import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PaymentStatusBadge } from '../shared/PaymentStatusBadge'
import { Eye, Download, AlertCircle, CheckCircle, XCircle, FileText, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaymentRequestItem } from '@/lib/payments/types'

interface RequestItemRowProps {
    item: PaymentRequestItem
    isSelected: boolean
    onSelect: (checked: boolean) => void
    onApprove: (item: PaymentRequestItem) => void
    onReject: (item: PaymentRequestItem, reason: string) => void
    onViewFiles: (item: PaymentRequestItem) => void
    isProcessing?: boolean
}

export function RequestItemRow({
    item,
    isSelected,
    onSelect,
    onApprove,
    onReject,
    onViewFiles,
    isProcessing = false
}: RequestItemRowProps) {
    const [rejectReason, setRejectReason] = React.useState('')
    const [showRejectInput, setShowRejectInput] = React.useState(false)

    const handleRejectSubmit = () => {
        if (!rejectReason.trim()) return
        onReject(item, rejectReason)
        setShowRejectInput(false)
        setRejectReason('')
    }

    return (
        <tr className={cn(
            "hover:bg-gray-50 transition-colors",
            isSelected && "bg-blue-50/50"
        )}>
            {/* 選取框 */}
            <td className="px-4 py-4 align-top w-10">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(e.target.checked)}
                    disabled={isProcessing}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mt-1"
                />
            </td>

            {/* 專案與申請資訊 */}
            <td className="px-4 py-4 align-top">
                <div className="flex flex-col space-y-1">
                    <span className="font-medium text-gray-900">{item.quotations?.project_name || '未命名專案'}</span>
                    <span className="text-xs text-gray-500">
                        申請日期: {new Date(item.request_date || '').toLocaleDateString('zh-TW')}
                    </span>
                    {item.merge_group_id && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 w-fit">
                            合併申請 {item.is_merge_leader ? '(主)' : ''}
                        </span>
                    )}
                </div>
            </td>

            {/* KOL 與服務 */}
            <td className="px-4 py-4 align-top">
                <div className="flex flex-col space-y-1">
                    <span className="text-sm text-gray-900">{item.kols?.name || '未知 KOL'}</span>
                    <span className="text-xs text-gray-500">{item.service}</span>
                </div>
            </td>

            {/* 金額 */}
            <td className="px-4 py-4 align-top text-right">
                <span className="text-sm font-medium text-gray-900">
                    ${item.cost_amount?.toLocaleString()}
                </span>
            </td>

            {/* 附件與發票 */}
            <td className="px-4 py-4 align-top">
                <div className="flex flex-col space-y-2">
                    {/* 附件按鈕 */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewFiles(item)}
                        className="w-full justify-start text-xs h-8"
                    >
                        <Paperclip className="h-3 w-3 mr-2" />
                        {item.parsed_attachments?.length || 0} 個附件
                    </Button>

                    {/* 發票號碼 */}
                    <div className="flex items-center text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded border">
                        <FileText className="h-3 w-3 mr-2 text-gray-400" />
                        {item.invoice_number || '無發票號碼'}
                    </div>
                </div>
            </td>

            {/* 狀態 */}
            <td className="px-4 py-4 align-top">
                <PaymentStatusBadge status={item.verification_status || 'pending'} />
            </td>

            {/* 操作 */}
            <td className="px-4 py-4 align-top text-right">
                <div className="flex flex-col space-y-2 items-end">
                    {!showRejectInput ? (
                        <>
                            <Button
                                size="sm"
                                onClick={() => onApprove(item)}
                                disabled={isProcessing}
                                className="bg-green-600 hover:bg-green-700 text-white w-20 h-8 text-xs"
                            >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                核准
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setShowRejectInput(true)}
                                disabled={isProcessing}
                                className="w-20 h-8 text-xs"
                            >
                                <XCircle className="h-3 w-3 mr-1" />
                                駁回
                            </Button>
                        </>
                    ) : (
                        <div className="flex flex-col space-y-2 w-48 animate-in fade-in slide-in-from-right-5 duration-200">
                            <Input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="請輸入駁回原因..."
                                className="text-xs h-8"
                                autoFocus
                            />
                            <div className="flex space-x-2 justify-end">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setShowRejectInput(false)
                                        setRejectReason('')
                                    }}
                                    className="h-7 px-2 text-xs"
                                >
                                    取消
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={handleRejectSubmit}
                                    disabled={!rejectReason.trim() || isProcessing}
                                    className="h-7 px-2 text-xs"
                                >
                                    確認駁回
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    )
}
