import { Paperclip, Trash2, CheckCircle, Save, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RejectionReasonDisplay } from './RejectionReasonDisplay'
import type { PendingPaymentItem } from '@/lib/payments/types'
import { parseKolBankInfo, isKolBankInfoComplete } from '@/types/schemas'
import { EXPENSE_TYPES } from '@/types/custom.types'
import { useState } from 'react'

const CURRENT_YEAR = new Date().getFullYear()
const PAYMENT_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => `${CURRENT_YEAR}年${i + 1}月`)

interface ItemRowProps {
    item: PendingPaymentItem
    displayItem: PendingPaymentItem
    selectedMergeType: 'account' | null
    selectedForMerge: string[]
    isMergeMode: boolean
    canMergeWith: (item: PendingPaymentItem) => boolean
    canSelectForPayment: (item: PendingPaymentItem) => boolean
    shouldShowControls: (item: PendingPaymentItem) => boolean
    isValidInvoiceFormat: (invoice: string | null | undefined) => boolean
    onCostAmountChange: (itemId: string, value: string) => void
    onRemittanceNameChange: (itemId: string, value: string) => void
    onSaveCost: (itemId: string, cost: number, remittanceName: string | null) => void
    onMergeSelection: (itemId: string, checked: boolean) => void
    onUnmerge: (groupId: string) => void
    onClearRejection: (paymentRequestId: string) => void
    onOpenFileModal: (item: PendingPaymentItem) => void
    onOpenBankInfoModal: (item: PendingPaymentItem) => void
    onInvoiceNumberChange: (itemId: string, value: string) => void
    onPaymentSelection: (itemId: string, checked: boolean) => void
    onExpenseTypeChange?: (itemId: string, value: string) => void
    onExpectedPaymentMonthChange?: (itemId: string, value: string) => void
}

export function ItemRow({
    item,
    displayItem,
    selectedMergeType,
    selectedForMerge,
    isMergeMode,
    canMergeWith,
    canSelectForPayment,
    shouldShowControls,
    isValidInvoiceFormat,
    onCostAmountChange,
    onRemittanceNameChange,
    onSaveCost,
    onMergeSelection,
    onUnmerge,
    onClearRejection,
    onOpenFileModal,
    onOpenBankInfoModal,
    onInvoiceNumberChange,
    onPaymentSelection,
    onExpenseTypeChange,
    onExpectedPaymentMonthChange
}: ItemRowProps) {
    const [isSaving, setIsSaving] = useState(false)

    const handleSave = async () => {
        setIsSaving(true)
        await onSaveCost(item.id, item.cost_amount_input, item.remittance_name_input)
        setIsSaving(false)
    }

    // Feature 1: 解析 bankType 用於顯示 Badge
    const bankInfo = item.kols?.bank_info ? parseKolBankInfo(item.kols.bank_info) : null
    const bankTypeLabel = bankInfo?.bankType === 'individual' ? '勞報' : bankInfo?.bankType === 'company' ? '發票' : null

    // Feature 3: 檢查匯款資料是否完整
    const hasBankInfo = item.kols?.bank_info ? isKolBankInfoComplete(item.kols.bank_info) : false

    // Feature 2: 成本是否與原始報價不同
    const isCostModified = item.original_cost > 0 && item.cost_amount_input !== item.original_cost

    return (
        <tr className={`hover:bg-accent ${item.merge_color}`}>
            {/* KOL/服務 */}
            <td className="px-2 py-2 align-top text-xs text-muted-foreground">
                <div className="flex items-center">
                    <span>{item.kols?.name || '自訂項目'}</span>
                    {item.kols && !hasBankInfo && (
                        <button
                            onClick={() => onOpenBankInfoModal(item)}
                            className="ml-1 text-warning hover:text-warning/80"
                            title="銀行帳號資訊不完整，點擊編輯"
                        >
                            <AlertTriangle className="h-3 w-3" />
                        </button>
                    )}
                </div>
                {bankTypeLabel && (
                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        bankInfo?.bankType === 'individual'
                            ? 'bg-info/15 text-info border border-info/25'
                            : 'bg-warning/15 text-warning border border-warning/25'
                    }`}>
                        {bankTypeLabel}
                    </span>
                )}
                {item.kols && !hasBankInfo && (
                    <div className="mt-1">
                        <button
                            onClick={() => onOpenBankInfoModal(item)}
                            className="text-[10px] text-warning underline hover:text-warning/80"
                        >
                            補填帳號資訊
                        </button>
                    </div>
                )}
            </td>

            {/* Service */}
            <td className="px-2 py-2 align-top text-xs">
                <div className="font-medium text-foreground">{item.service}</div>
                {onExpenseTypeChange && (
                    <select
                        value={item.expense_type_input || '勞務報酬'}
                        onChange={(e) => onExpenseTypeChange(item.id, e.target.value)}
                        className="mt-1 w-full h-6 text-[10px] bg-secondary border border-border rounded px-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                        {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                )}
                {onExpectedPaymentMonthChange && (
                    <select
                        value={item.expected_payment_month_input || ''}
                        onChange={(e) => onExpectedPaymentMonthChange(item.id, e.target.value)}
                        className="mt-1 w-full h-6 text-[10px] bg-secondary border border-border rounded px-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        title="預計支付月份"
                    >
                        {PAYMENT_MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                )}
                <RejectionReasonDisplay
                    item={item}
                    onClear={() => onClearRejection(item.payment_request_id!)}
                    onUnmerge={onUnmerge}
                />
            </td>

            {/* Remittance Name */}
            <td className="px-2 py-2 align-top text-xs">
                <Input
                    value={item.remittance_name_input || ''}
                    onChange={(e) => onRemittanceNameChange(item.id, e.target.value)}
                    className="w-32 h-7 text-xs"
                    placeholder="戶名/公司名稱"
                />
            </td>

            {/* Cost Amount */}
            <td className="px-2 py-2 align-top text-xs font-medium">
                <div className="flex items-center space-x-1">
                    <Input
                        type="number"
                        value={item.cost_amount_input || ''}
                        onChange={(e) => onCostAmountChange(item.id, e.target.value)}
                        className={`w-24 text-right h-7 text-xs ${
                            isCostModified ? 'border-warning/50 bg-warning/5' : ''
                        }`}
                        placeholder="請輸入成本"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-primary/10"
                        title="儲存"
                    >
                        <Save className="h-3.5 w-3.5" />
                    </Button>
                </div>
                {isCostModified && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                        報價: NT$ {item.original_cost.toLocaleString()}
                    </div>
                )}
            </td>

            {/* Merge */}
            <td className="px-2 py-2 align-top text-xs">
                {isMergeMode && canMergeWith(item) && !item.merge_group_id && (
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedForMerge.includes(item.id)}
                            onChange={(e) => onMergeSelection(item.id, e.target.checked)}
                            className="mr-1 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">選擇合併</span>
                    </label>
                )}
                {item.merge_group_id && (
                    <div className="text-xs flex items-center">
                        <span className="bg-info/15 px-1.5 py-0.5 rounded text-[10px]">
                            合併{item.is_merge_leader && ' (主)'}
                        </span>
                        {item.is_merge_leader && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onUnmerge(item.merge_group_id!)}
                                className="ml-1 h-5 w-5 p-0 text-warning hover:text-warning/80"
                                title="解除合併"
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                )}
            </td>

            {/* Documents */}
            <td className="px-2 py-2 align-top">
                {shouldShowControls(item) && (
                    <div>
                        <div className="flex items-center space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenFileModal(item)}
                                className={`h-8 w-8 p-0 flex-shrink-0 ${displayItem.attachments?.length > 0 ? 'text-primary border-primary/30 bg-primary/10' : 'text-muted-foreground'}`}
                                title={displayItem.attachments?.length > 0 ? `${displayItem.attachments.length} 個檔案` : '上傳/管理檔案'}
                            >
                                <Paperclip className="h-4 w-4" />
                            </Button>
                            <Input
                                placeholder="發票號碼 (AB-12345678)"
                                value={displayItem.invoice_number_input || ''}
                                onChange={(e) => onInvoiceNumberChange(item.id, e.target.value)}
                                className={`flex-1 text-xs h-8 ${displayItem.invoice_number_input &&
                                    !isValidInvoiceFormat(displayItem.invoice_number_input)
                                    ? 'border-destructive focus:border-destructive focus:ring-destructive'
                                    : ''
                                    }`}
                            />
                        </div>
                        {canSelectForPayment(item) && (
                            <div className="flex items-center text-success mt-1 text-xs font-medium pl-1">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                <span>已備妥</span>
                            </div>
                        )}
                    </div>
                )}
            </td>

            {/* Payment Selection */}
            <td className="px-2 py-2 align-top text-center">
                {shouldShowControls(item) && (
                    <input
                        type="checkbox"
                        checked={item.is_selected}
                        onChange={(e) => onPaymentSelection(item.id, e.target.checked)}
                        disabled={!canSelectForPayment(item)}
                        className="h-4 w-4 text-primary focus:ring-primary border-border rounded cursor-pointer"
                        title={
                            !canSelectForPayment(item)
                                ? '需檢附文件或正確格式的發票號碼'
                                : '申請付款'
                        }
                    />
                )}
            </td>
        </tr>
    )
}
