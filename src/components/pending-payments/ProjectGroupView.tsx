import { ChevronDown, ChevronRight, Building2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, Paperclip, Trash2, AlertCircle, Unlink, X } from 'lucide-react'
import { PendingPaymentItem } from '@/lib/payments/types'
import { ProjectGroup } from '@/lib/payments/types'
import { ItemRow } from './ItemRow'

interface ProjectGroupViewProps {
    groups: ProjectGroup<PendingPaymentItem>[]
    onToggleProject: (projectId: string) => void
    // 傳遞給列表項目的所有必要 props
    onSelect: (itemId: string, checked: boolean) => void
    onCostChange: (itemId: string, value: string) => void
    onRemittanceNameChange: (itemId: string, value: string) => void
    onSaveCost: (itemId: string, cost: number, remittanceName: string | null) => void
    onInvoiceChange: (itemId: string, value: string) => void
    onFileModalOpen: (item: PendingPaymentItem) => void
    onMergeSelection: (itemId: string, checked: boolean) => void
    onUnmerge: (groupId: string) => void
    onClearRejection: (requestId: string) => void
    selectedItems: string[]
    selectedForMerge: string[]
    selectedMergeType: 'account' | null
    isMergeMode: boolean // NEW PROP
    canSelectForPayment: (item: PendingPaymentItem) => boolean
    canMergeWith: (item: PendingPaymentItem) => boolean
    shouldShowControls: (item: PendingPaymentItem) => boolean
    isValidInvoiceFormat: (invoice: string | null | undefined) => boolean
}

export function ProjectGroupView({
    groups,
    onToggleProject,
    onSelect,
    onCostChange,
    onRemittanceNameChange,
    onSaveCost,
    onInvoiceChange,
    onFileModalOpen,
    onMergeSelection,
    onUnmerge,
    onClearRejection,
    selectedItems,
    selectedForMerge,
    selectedMergeType,
    isMergeMode, // NEW PROP
    canSelectForPayment,
    canMergeWith,
    shouldShowControls,
    isValidInvoiceFormat
}: ProjectGroupViewProps) {

    if (groups.length === 0) {
        return (
            <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">沒有待請款項目</h3>
                <p className="mt-1 text-sm text-gray-500">目前沒有需要處理的項目</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {groups.map((group) => (
                <div key={group.projectId} className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                    {/* 專案標題列 */}
                    <div
                        className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => onToggleProject(group.projectId)}
                    >
                        <div className="flex items-center space-x-3">
                            {group.isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-gray-500" />
                            ) : (
                                <ChevronRight className="h-5 w-5 text-gray-500" />
                            )}
                            <Building2 className="h-5 w-5 text-blue-600" />
                            <div>
                                <div className="font-medium text-gray-900">{group.projectName}</div>
                                <div className="text-xs text-gray-500">
                                    {group.clientName || '未知客戶'} • {group.items.length} 筆項目
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="text-right">
                                <div className="text-sm font-medium text-gray-900">
                                    總成本: NT$ {group.totalCost.toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                    已備妥: {group.readyItems}/{group.totalItems}
                                </div>
                            </div>
                            {/* 進度條 */}
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${group.hasRejected ? 'bg-red-500' :
                                        group.readyItems === group.totalItems ? 'bg-green-500' : 'bg-blue-500'
                                        }`}
                                    style={{ width: `${(group.readyItems / group.totalItems) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 展開的項目列表 */}
                    {group.isExpanded && (
                        <div className="border-t border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">KOL</th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合作項目</th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">匯款戶名/公司名稱</th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">成本金額</th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">合併</th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">檢核文件</th>
                                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">申請付款</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {group.items.map((item) => {
                                        const displayItem = item.merge_group_id
                                            ? group.items.find(i => i.merge_group_id === item.merge_group_id && i.is_merge_leader) || item
                                            : item;

                                        return (
                                            <ItemRow
                                                key={item.id}
                                                item={item}
                                                displayItem={displayItem}
                                                selectedMergeType={selectedMergeType}
                                                selectedForMerge={selectedForMerge}
                                                isMergeMode={isMergeMode} // Pass to ItemRow
                                                canMergeWith={canMergeWith}
                                                canSelectForPayment={canSelectForPayment}
                                                shouldShowControls={shouldShowControls}
                                                isValidInvoiceFormat={isValidInvoiceFormat}
                                                onCostAmountChange={onCostChange}
                                                onRemittanceNameChange={onRemittanceNameChange}
                                                onSaveCost={onSaveCost}
                                                onMergeSelection={onMergeSelection}
                                                onUnmerge={onUnmerge}
                                                onClearRejection={onClearRejection}
                                                onOpenFileModal={onFileModalOpen}
                                                onInvoiceNumberChange={onInvoiceChange}
                                                onPaymentSelection={onSelect}
                                            />
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
