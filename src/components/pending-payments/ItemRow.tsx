import { Paperclip, Trash2, CheckCircle, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RejectionReasonDisplay } from './RejectionReasonDisplay'
import type { PendingPaymentItem } from '@/lib/payments/types'
import { useState } from 'react'

interface ItemRowProps {
    item: PendingPaymentItem
    displayItem: PendingPaymentItem
    selectedMergeType: 'account' | null
    selectedForMerge: string[]
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
    onInvoiceNumberChange: (itemId: string, value: string) => void
    onPaymentSelection: (itemId: string, checked: boolean) => void
}

export function ItemRow({
    item,
    displayItem,
    selectedMergeType,
    selectedForMerge,
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
    onInvoiceNumberChange,
    onPaymentSelection
}: ItemRowProps) {
    const [isSaving, setIsSaving] = useState(false)

    const handleSave = async () => {
        setIsSaving(true)
        await onSaveCost(item.id, item.cost_amount_input, item.remittance_name_input)
        setIsSaving(false)
    }

    return (
        <tr className={`hover:bg-gray-50 ${item.merge_color}`}>
            {/* KOL */}
            <td className="px-2 py-2 align-top text-xs text-gray-500">
                {item.kols?.name || '自訂項目'}
            </td>

            {/* Service */}
            <td className="px-2 py-2 align-top text-xs">
                <div className="font-medium text-gray-900">{item.service}</div>
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
                        className="w-24 text-right h-7 text-xs"
                        placeholder="請輸入成本"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="儲存"
                    >
                        <Save className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </td>

            {/* Merge */}
            <td className="px-2 py-2 align-top text-xs">
                {selectedMergeType && canMergeWith(item) && !item.merge_group_id && (
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedForMerge.includes(item.id)}
                            onChange={(e) => onMergeSelection(item.id, e.target.checked)}
                            className="mr-1 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs">選擇合併</span>
                    </label>
                )}
                {item.merge_group_id && (
                    <div className="text-xs flex items-center">
                        <span className="bg-blue-100 px-1.5 py-0.5 rounded text-[10px]">
                            合併{item.is_merge_leader && ' (主)'}
                        </span>
                        {item.is_merge_leader && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onUnmerge(item.merge_group_id!)}
                                className="ml-1 h-5 w-5 p-0 text-orange-500 hover:text-orange-700"
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
                                className={`h-8 w-8 p-0 flex-shrink-0 ${displayItem.attachments?.length > 0 ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-gray-400'}`}
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
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                                    : ''
                                    }`}
                            />
                        </div>
                        {canSelectForPayment(item) && (
                            <div className="flex items-center text-green-600 mt-1 text-xs font-medium pl-1">
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
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
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
