import { useEffect, useRef, useState } from 'react'
import { X, Save, AlertTriangle, RotateCcw, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RejectionReasonDisplay } from './RejectionReasonDisplay'
import type { PendingPaymentItem } from '@/lib/payments/types'
import { parseKolBankInfo, isKolBankInfoComplete } from '@/types/schemas'
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
    onCostAmountChange: (itemId: string, value: string) => void
    onRemittanceNameChange: (itemId: string, value: string) => void
    onSaveCost: (itemId: string, cost: number, remittanceName: string | null) => void
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
    onCostAmountChange,
    onRemittanceNameChange,
    onSaveCost,
    onClearRejection,
    onUnmerge,
    onOpenBankInfoModal,
    onResetToBatch,
    onClose,
}: ExpandedItemPanelProps) {
    const { expenseTypeNames, accountingSubjectNames } = useExpenseDefaults()
    const [isSaving, setIsSaving] = useState(false)
    const panelRef = useRef<HTMLDivElement>(null)

    // Escape 鍵收合
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleSave = async () => {
        setIsSaving(true)
        await onSaveCost(item.id, item.cost_amount_input, item.remittance_name_input)
        setIsSaving(false)
    }

    const isCostModified = item.original_cost > 0 && item.cost_amount_input !== item.original_cost
    const hasBankInfo = item.kols?.bank_info ? isKolBankInfoComplete(item.kols.bank_info) : false

    const isSameAsBatch =
        item.expense_type_input === batchExpenseType &&
        item.accounting_subject_input === batchAccountingSubject &&
        item.expected_payment_month_input === batchPaymentMonth

    return (
        <div
            ref={panelRef}
            className="px-4 py-3 bg-accent/30 border-t border-border animate-in fade-in slide-in-from-top-1 duration-150"
        >
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">編輯明細</span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 左欄：支出分類 */}
                <div className="space-y-2">
                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">支出分類</div>
                    <div className="flex flex-wrap gap-2">
                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-0.5">支出種類</label>
                            <select
                                value={item.expense_type_input || '勞務報酬'}
                                onChange={(e) => onExpenseTypeChange(item.id, e.target.value)}
                                className="h-7 text-xs bg-card border border-border rounded px-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-[100px]"
                            >
                                {expenseTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-0.5">會計科目</label>
                            <select
                                value={item.accounting_subject_input || ''}
                                onChange={(e) => onAccountingSubjectChange(item.id, e.target.value)}
                                className="h-7 text-xs bg-card border border-border rounded px-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-[100px]"
                            >
                                <option value="">未設定</option>
                                {accountingSubjectNames.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-0.5">預計支付月份</label>
                            <select
                                value={item.expected_payment_month_input || ''}
                                onChange={(e) => onExpectedPaymentMonthChange(item.id, e.target.value)}
                                className="h-7 text-xs bg-card border border-border rounded px-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-[100px]"
                            >
                                {PAYMENT_MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isSameAsBatch ? (
                            <span className="text-[10px] text-muted-foreground">與批次設定相同</span>
                        ) : (
                            <span className="text-[10px] text-info">與批次設定不同</span>
                        )}
                        {!isSameAsBatch && (
                            <button
                                onClick={() => onResetToBatch(item.id)}
                                className="inline-flex items-center text-[10px] text-muted-foreground hover:text-foreground"
                            >
                                <RotateCcw className="h-3 w-3 mr-0.5" />
                                重置為批次設定
                            </button>
                        )}
                    </div>
                </div>

                {/* 右欄：成本 & 匯款 */}
                <div className="space-y-2">
                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">成本 & 匯款</div>
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-0.5">匯款戶名</label>
                            <Input
                                value={item.remittance_name_input || ''}
                                onChange={(e) => onRemittanceNameChange(item.id, e.target.value)}
                                className="w-36 h-7 text-xs"
                                placeholder="戶名/公司名稱"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-0.5">成本金額</label>
                            <div className="flex items-center gap-1">
                                <Input
                                    type="number"
                                    value={item.cost_amount_input || ''}
                                    onChange={(e) => onCostAmountChange(item.id, e.target.value)}
                                    className={`w-28 text-right h-7 text-xs ${isCostModified ? 'border-warning/50 bg-warning/5' : ''}`}
                                    placeholder="金額"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-primary/10"
                                    title="儲存成本與匯款戶名"
                                >
                                    <Save className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    {isCostModified && (
                        <div className="text-[10px] text-muted-foreground">
                            報價金額: NT$ {item.original_cost.toLocaleString()}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {item.kols && !hasBankInfo && (
                            <button
                                onClick={() => onOpenBankInfoModal(item)}
                                className="inline-flex items-center text-[10px] text-warning hover:text-warning/80"
                            >
                                <AlertTriangle className="h-3 w-3 mr-0.5" />
                                銀行帳號不完整，點擊補填
                            </button>
                        )}
                        {item.kols && hasBankInfo && (
                            <button
                                onClick={() => onOpenBankInfoModal(item)}
                                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                            >
                                查看/編輯銀行資訊
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 合併資訊 */}
            {item.merge_group_id && mergeGroupItems.length > 1 && (
                <div className="mt-3 p-2.5 rounded-md border border-info/20 bg-info/5">
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                            <Unlink className="h-3 w-3 text-info" />
                            <span className="text-[10px] font-medium text-info uppercase tracking-wider">
                                合併群組（共 {mergeGroupItems.length} 筆）
                            </span>
                        </div>
                        <button
                            onClick={() => onUnmerge(item.merge_group_id!)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-warning hover:text-warning/80 hover:bg-warning/10 transition-colors"
                        >
                            <Unlink className="h-3 w-3" />
                            解除合併
                        </button>
                    </div>
                    <div className="space-y-0.5">
                        {mergeGroupItems.map(mi => (
                            <div key={mi.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="w-1.5 h-1.5 rounded-full bg-info/50 flex-shrink-0" />
                                <span className={mi.id === item.id ? 'text-foreground font-medium' : ''}>
                                    {mi.kols?.name || '自訂項目'}
                                </span>
                                <span className="text-muted-foreground/60">—</span>
                                <span className={mi.id === item.id ? 'text-foreground' : ''}>{mi.service}</span>
                                {mi.is_merge_leader && (
                                    <span className="px-1 py-0.5 rounded text-[9px] bg-info/15 text-info">主</span>
                                )}
                                {mi.id === item.id && (
                                    <span className="text-[9px] text-muted-foreground">← 目前</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 孤立合併記錄（群組中只剩自己） */}
            {item.merge_group_id && mergeGroupItems.length <= 1 && (
                <div className="mt-3 p-2.5 rounded-md border border-warning/20 bg-warning/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3 text-warning" />
                            <span className="text-[10px] font-medium text-warning">
                                此項目有殘留的合併記錄，合併群組中的其他成員已不存在
                            </span>
                        </div>
                        <button
                            onClick={() => onUnmerge(item.merge_group_id!)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-warning hover:text-warning/80 hover:bg-warning/10 transition-colors"
                        >
                            <Unlink className="h-3 w-3" />
                            清除合併狀態
                        </button>
                    </div>
                </div>
            )}

            {/* 駁回原因 */}
            {item.rejection_reason && (
                <div className="mt-3">
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
