import { useEffect } from 'react'
import { X, AlertTriangle, RotateCcw, Unlink } from 'lucide-react'
import { RejectionReasonDisplay } from './RejectionReasonDisplay'
import type { PendingPaymentItem } from '@/lib/payments/types'
import { isKolBankInfoComplete } from '@/types/schemas'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import { CURRENT_YEAR } from '@/lib/constants'

const PAYMENT_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => `${CURRENT_YEAR}年${i + 1}月`)

interface ExpandedItemPanelProps {
    item: PendingPaymentItem
    mergeGroupItems: PendingPaymentItem[]
    batchExpenseType: string
    batchAccountingSubject: string
    batchPaymentMonth: string
    onExpenseTypeChange: (itemId: string, value: string) => void
    onAccountingSubjectChange: (itemId: string, value: string) => void
    onExpectedPaymentMonthChange: (itemId: string, value: string) => void
    onClearRejection: (paymentRequestId: string) => void
    onUnmerge: (groupId: string) => void
    onOpenBankInfoModal: (item: PendingPaymentItem) => void
    onResetToBatch: (itemId: string) => void
    onClose: () => void
}

export function ExpandedItemPanel({
    item,
    mergeGroupItems,
    batchExpenseType,
    batchAccountingSubject,
    batchPaymentMonth,
    onExpenseTypeChange,
    onAccountingSubjectChange,
    onExpectedPaymentMonthChange,
    onClearRejection,
    onUnmerge,
    onOpenBankInfoModal,
    onResetToBatch,
    onClose,
}: ExpandedItemPanelProps) {
    const { expenseTypeNames, accountingSubjectNames } = useExpenseDefaults()

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const hasBankInfo = item.kols?.bank_info ? isKolBankInfoComplete(item.kols.bank_info) : false

    const isSameAsBatch =
        item.expense_type_input === batchExpenseType &&
        item.accounting_subject_input === batchAccountingSubject &&
        item.expected_payment_month_input === batchPaymentMonth

    return (
        <div className="bg-accent/30 border-t border-border animate-in fade-in slide-in-from-top-1 duration-150">
            {/* 主列：所有控制項壓縮在同一行 */}
            <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">帳務</span>
                <select
                    value={item.expense_type_input || '勞務報酬'}
                    onChange={(e) => onExpenseTypeChange(item.id, e.target.value)}
                    className="h-6 text-[11px] bg-card border border-border rounded px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    {expenseTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                    value={item.accounting_subject_input || ''}
                    onChange={(e) => onAccountingSubjectChange(item.id, e.target.value)}
                    className="h-6 text-[11px] bg-card border border-border rounded px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    <option value="">未設定</option>
                    {accountingSubjectNames.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                    value={item.expected_payment_month_input || ''}
                    onChange={(e) => onExpectedPaymentMonthChange(item.id, e.target.value)}
                    className="h-6 text-[11px] bg-card border border-border rounded px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    {PAYMENT_MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                <span className="text-border">|</span>

                {!isSameAsBatch && (
                    <button
                        onClick={() => onResetToBatch(item.id)}
                        className="inline-flex items-center text-[10px] text-info hover:text-info/80 shrink-0"
                    >
                        <RotateCcw className="h-3 w-3 mr-0.5" />
                        重置批次
                    </button>
                )}

                {/* 銀行資訊 */}
                {item.kols && !hasBankInfo && (
                    <button
                        onClick={() => onOpenBankInfoModal(item)}
                        className="inline-flex items-center text-[10px] text-warning hover:text-warning/80 shrink-0"
                    >
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        銀行帳號不完整
                    </button>
                )}
                {item.kols && hasBankInfo && (
                    <button
                        onClick={() => onOpenBankInfoModal(item)}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline shrink-0"
                    >
                        查看/編輯銀行資訊
                    </button>
                )}

                {/* 合併解除（inline） */}
                {item.merge_group_id && (
                    <button
                        onClick={() => onUnmerge(item.merge_group_id!)}
                        className="inline-flex items-center gap-0.5 text-[10px] text-warning hover:text-warning/80 shrink-0"
                    >
                        <Unlink className="h-3 w-3" />
                        {mergeGroupItems.length > 1 ? `解除合併(${mergeGroupItems.length}筆)` : '清除合併'}
                    </button>
                )}

                <div className="flex-1" />
                <button
                    onClick={onClose}
                    className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded shrink-0"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* 駁回原因（條件顯示，這個無法壓縮成一行） */}
            {item.rejection_reason && (
                <div className="px-4 pb-2">
                    <RejectionReasonDisplay
                        item={item}
                        onClear={() => onClearRejection(item.payment_request_id!)}
                        onUnmerge={onUnmerge}
                    />
                </div>
            )}
        </div>
    )
}
