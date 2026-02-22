import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PaymentStatusBadge } from '../shared/PaymentStatusBadge'
import { Eye, Download, AlertCircle, CheckCircle, XCircle, FileText, Paperclip, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaymentRequestItem } from '@/lib/payments/types'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'

interface RequestItemRowProps {
    item: PaymentRequestItem
    isSelected: boolean
    onSelect: (checked: boolean) => void
    onApprove: (item: PaymentRequestItem, overrideExpenseType?: string, overrideSubject?: string) => void
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
    const { expenseTypeNames, accountingSubjectNames, defaultSubjectsMap } = useExpenseDefaults()
    const [rejectReason, setRejectReason] = React.useState('')
    const [showRejectInput, setShowRejectInput] = React.useState(false)
    const [showOverride, setShowOverride] = React.useState(false)
    const [overrideExpenseType, setOverrideExpenseType] = React.useState('')
    const [overrideSubject, setOverrideSubject] = React.useState('')

    const handleRejectSubmit = () => {
        if (!rejectReason.trim()) return
        onReject(item, rejectReason)
        setShowRejectInput(false)
        setRejectReason('')
    }

    const handleOverrideExpenseTypeChange = (value: string) => {
        setOverrideExpenseType(value)
        if (value) {
            setOverrideSubject(defaultSubjectsMap[value] || '')
        }
    }

    return (
        <tr className={cn(
            "hover:bg-secondary transition-colors",
            isSelected && "bg-info/10"
        )}>
            {/* 選取框 */}
            <td className="px-4 py-4 align-top w-10">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(e.target.checked)}
                    disabled={isProcessing}
                    className="h-4 w-4 text-primary focus:ring-primary border-border rounded mt-1"
                />
            </td>

            {/* 專案與申請資訊 */}
            <td className="px-4 py-4 align-top">
                <div className="flex flex-col space-y-1">
                    <span className="font-medium text-foreground">{item.quotations?.project_name || '未命名專案'}</span>
                    <span className="text-xs text-muted-foreground">
                        申請日期: {new Date(item.request_date || '').toLocaleDateString('zh-TW')}
                    </span>
                    {item.merge_group_id && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-info/15 text-info w-fit">
                            合併申請 {item.is_merge_leader ? '(主)' : ''}
                        </span>
                    )}
                </div>
            </td>

            {/* KOL 與服務 */}
            <td className="px-4 py-4 align-top">
                <div className="flex flex-col space-y-1">
                    <span className="text-sm text-foreground">{item.kols?.name || '未知 KOL'}</span>
                    <span className="text-xs text-muted-foreground">{item.service}</span>
                    {/* 申請人選的帳務分類 */}
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                        {item.expense_type && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground border border-border">
                                {item.expense_type}
                            </span>
                        )}
                        {item.accounting_subject && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-info/10 text-info border border-info/20">
                                {item.accounting_subject}
                            </span>
                        )}
                        <button
                            onClick={() => setShowOverride(!showOverride)}
                            className="inline-flex items-center text-[10px] text-muted-foreground hover:text-foreground"
                            title="調整帳務分類"
                        >
                            <Settings2 className="h-3 w-3" />
                        </button>
                    </div>
                    {/* Inline 覆蓋區 */}
                    {showOverride && (
                        <div className="mt-1 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                            <select
                                value={overrideExpenseType}
                                onChange={(e) => handleOverrideExpenseTypeChange(e.target.value)}
                                className="w-full h-6 text-[10px] bg-secondary border border-border rounded px-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="">維持原設定</option>
                                {expenseTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select
                                value={overrideSubject}
                                onChange={(e) => setOverrideSubject(e.target.value)}
                                className="w-full h-6 text-[10px] bg-secondary border border-border rounded px-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="">維持原設定</option>
                                {accountingSubjectNames.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </td>

            {/* 金額 */}
            <td className="px-4 py-4 align-top text-right">
                <span className="text-sm font-medium text-foreground">
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
                    <div className="flex items-center text-xs text-muted-foreground bg-secondary px-2 py-1 rounded border">
                        <FileText className="h-3 w-3 mr-2 text-muted-foreground" />
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
                                onClick={() => onApprove(item, overrideExpenseType || undefined, overrideSubject || undefined)}
                                disabled={isProcessing}
                                className="bg-success hover:bg-success/90 text-white w-20 h-8 text-xs"
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
