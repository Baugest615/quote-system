import { Paperclip, Save, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusDot, getItemStatus } from './StatusDot'
import type { PendingPaymentItem } from '@/lib/payments/types'
import { parseKolBankInfo, isKolBankInfoComplete } from '@/types/schemas'
import { Trash2, Unlink } from 'lucide-react'
import { useState } from 'react'

interface CompactItemRowProps {
    item: PendingPaymentItem
    displayItem: PendingPaymentItem
    isExpanded: boolean
    onToggleExpand: (itemId: string) => void
    // 批次設定（判斷非預設 badge）
    batchExpenseType: string
    batchAccountingSubject: string
    batchPaymentMonth: string
    // Merge
    isMergeMode: boolean
    selectedForMerge: string[]
    canMergeWith: (item: PendingPaymentItem) => boolean
    onMergeSelection: (itemId: string, checked: boolean) => void
    onUnmerge: (groupId: string) => void
    // Payment
    canSelectForPayment: (item: PendingPaymentItem) => boolean
    shouldShowControls: (item: PendingPaymentItem) => boolean
    onPaymentSelection: (itemId: string, checked: boolean) => void
    // Cost & Remittance
    onCostAmountChange: (itemId: string, value: string) => void
    onRemittanceNameChange: (itemId: string, value: string) => void
    onSaveCost: (itemId: string, cost: number, remittanceName: string | null) => void
    // Files & Invoice
    onOpenFileModal: (item: PendingPaymentItem) => void
    onOpenBankInfoModal: (item: PendingPaymentItem) => void
    onInvoiceNumberChange: (itemId: string, value: string) => void
    isValidInvoiceFormat: (invoice: string | null | undefined) => boolean
    mergeGroupItems: PendingPaymentItem[]
}

export function CompactItemRow({
    item,
    displayItem,
    isExpanded,
    onToggleExpand,
    batchExpenseType,
    batchAccountingSubject,
    batchPaymentMonth,
    isMergeMode,
    selectedForMerge,
    canMergeWith,
    onMergeSelection,
    onUnmerge,
    canSelectForPayment,
    shouldShowControls,
    onPaymentSelection,
    onCostAmountChange,
    onRemittanceNameChange,
    onSaveCost,
    onOpenFileModal,
    onOpenBankInfoModal,
    onInvoiceNumberChange,
    isValidInvoiceFormat,
    mergeGroupItems,
}: CompactItemRowProps) {
    const [isSaving, setIsSaving] = useState(false)
    const status = getItemStatus(item)

    const handleSave = async () => {
        setIsSaving(true)
        await onSaveCost(item.id, item.cost_amount_input, item.remittance_name_input)
        setIsSaving(false)
    }

    // 銀行帳戶資訊
    const bankInfo = item.kols?.bank_info ? parseKolBankInfo(item.kols.bank_info) : null
    const bankTypeLabel = bankInfo?.bankType === 'individual' ? '勞報' : bankInfo?.bankType === 'company' ? '發票' : null
    const hasBankInfo = item.kols?.bank_info ? isKolBankInfoComplete(item.kols.bank_info) : false
    const isCostModified = item.original_cost > 0 && item.cost_amount_input !== item.original_cost

    const handleRowClick = (e: React.MouseEvent) => {
        // 排除互動元素的點擊
        const target = e.target as HTMLElement
        if (
            target.closest('input') ||
            target.closest('button') ||
            target.closest('select') ||
            target.closest('label')
        ) return
        onToggleExpand(item.id)
    }

    return (
        <tr
            className={`hover:bg-accent/50 transition-colors cursor-pointer ${item.merge_color} ${
                isExpanded ? 'bg-accent/30' : ''
            } ${item.rejection_reason ? 'border-l-2 border-l-destructive' : ''}`}
            onClick={handleRowClick}
        >
            {/* Status Dot */}
            <td className="px-2 py-2 align-middle w-8">
                <div className="flex items-center gap-1">
                    {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <StatusDot status={status} rejectionReason={item.rejection_reason} />
                </div>
            </td>

            {/* KOL/服務 */}
            <td className="px-2 py-2 align-middle text-xs">
                <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-foreground font-medium">{item.kols?.name || '自訂項目'}</span>
                    {item.kols && !hasBankInfo && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onOpenBankInfoModal(item) }}
                            className="text-warning hover:text-warning/80"
                            title="銀行帳號資訊不完整"
                        >
                            <AlertTriangle className="h-3 w-3" />
                        </button>
                    )}
                    {bankTypeLabel && (
                        <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                            bankInfo?.bankType === 'individual'
                                ? 'bg-info/15 text-info border border-info/25'
                                : 'bg-warning/15 text-warning border border-warning/25'
                        }`}>
                            {bankTypeLabel}
                        </span>
                    )}
                    {item.merge_group_id && mergeGroupItems.length > 1 && (
                        <span
                            className="px-1 py-0.5 rounded text-[10px] bg-info/15 text-info cursor-help"
                            title={`合併群組：${mergeGroupItems.map(mi => mi.kols?.name || '自訂項目').join('、')}`}
                        >
                            合併{item.is_merge_leader && '(主)'} · {mergeGroupItems.length}筆
                        </span>
                    )}
                    {item.merge_group_id && mergeGroupItems.length <= 1 && (
                        <span
                            className="px-1 py-0.5 rounded text-[10px] bg-warning/15 text-warning cursor-help"
                            title="孤立合併記錄，請展開明細清除"
                        >
                            合併異常
                        </span>
                    )}
                    {/* 帳務標籤 */}
                    {(item.expense_type_input || item.accounting_subject_input) && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            {[item.expense_type_input, item.accounting_subject_input].filter(Boolean).join('/')}
                        </span>
                    )}
                    {item.expected_payment_month_input && (
                        <span className={`text-[10px] px-1 py-0.5 rounded border ${
                            item.expected_payment_month_input !== batchPaymentMonth
                                ? 'bg-info/10 text-info border-info/20'
                                : 'bg-muted/50 text-muted-foreground border-border/50'
                        }`}>
                            {item.expected_payment_month_input}
                        </span>
                    )}
                </div>
            </td>

            {/* 合作項目 (Service) */}
            <td className="px-2 py-2 align-middle text-xs">
                <span className="font-medium text-foreground">{item.service}</span>
                {item.rejection_reason && (
                    <div className="text-[10px] text-destructive mt-0.5 truncate max-w-[200px]" title={item.rejection_reason}>
                        駁回：{item.rejection_reason}
                    </div>
                )}
            </td>

            {/* 匯款/成本 */}
            <td className="px-2 py-2 align-middle text-xs">
                <div className="flex items-center gap-1">
                    <Input
                        value={item.remittance_name_input || ''}
                        onChange={(e) => onRemittanceNameChange(item.id, e.target.value)}
                        className="w-24 h-7 text-xs"
                        placeholder="戶名"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-muted-foreground">/</span>
                    <Input
                        type="number"
                        value={item.cost_amount_input || ''}
                        onChange={(e) => onCostAmountChange(item.id, e.target.value)}
                        className={`w-20 text-right h-7 text-xs ${isCostModified ? 'border-warning/50 bg-warning/5' : ''}`}
                        placeholder="成本"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleSave() }}
                        disabled={isSaving}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-primary/10"
                        title="儲存"
                    >
                        <Save className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </td>

            {/* 合併（僅 merge 模式） */}
            {isMergeMode && (
                <td className="px-2 py-2 align-middle text-xs w-20">
                    {canMergeWith(item) && !item.merge_group_id && (
                        <label className="flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                checked={selectedForMerge.includes(item.id)}
                                onChange={(e) => onMergeSelection(item.id, e.target.checked)}
                                className="mr-1 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="text-[10px] text-muted-foreground">合併</span>
                        </label>
                    )}
                    {item.merge_group_id && item.is_merge_leader && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); onUnmerge(item.merge_group_id!) }}
                            className="h-5 px-1 text-warning hover:text-warning/80"
                            title="解除合併"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    )}
                </td>
            )}

            {/* 文件 + 發票 */}
            <td className="px-2 py-2 align-middle text-xs">
                {shouldShowControls(item) && (
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); onOpenFileModal(item) }}
                            className={`h-7 w-7 p-0 flex-shrink-0 ${
                                displayItem.attachments?.length > 0
                                    ? 'text-primary border-primary/30 bg-primary/10'
                                    : 'text-muted-foreground'
                            }`}
                            title={displayItem.attachments?.length > 0 ? `${displayItem.attachments.length} 個檔案` : '上傳檔案'}
                        >
                            <Paperclip className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                            placeholder="AB-12345678"
                            value={displayItem.invoice_number_input || ''}
                            onChange={(e) => onInvoiceNumberChange(item.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className={`flex-1 text-xs h-7 min-w-[110px] ${
                                displayItem.invoice_number_input &&
                                !isValidInvoiceFormat(displayItem.invoice_number_input)
                                    ? 'border-destructive focus:border-destructive focus:ring-destructive'
                                    : ''
                            }`}
                        />
                    </div>
                )}
            </td>

            {/* 申請付款 */}
            <td className="px-2 py-2 align-middle text-center w-12">
                {shouldShowControls(item) && (
                    <input
                        type="checkbox"
                        checked={item.is_selected}
                        onChange={(e) => onPaymentSelection(item.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={!canSelectForPayment(item)}
                        className="h-4 w-4 text-primary focus:ring-primary border-border rounded cursor-pointer"
                        title={!canSelectForPayment(item) ? '需檢附文件或正確格式的發票號碼' : '申請付款'}
                    />
                )}
            </td>
        </tr>
    )
}
