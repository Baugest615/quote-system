import React from 'react'
import { ChevronDown, ChevronRight, Building2, FileText } from 'lucide-react'
import { PendingPaymentItem } from '@/lib/payments/types'
import { ProjectGroup } from '@/lib/payments/types'
import { CompactItemRow } from './CompactItemRow'
import { ExpandedItemPanel } from './ExpandedItemPanel'

interface ProjectGroupViewProps {
    groups: ProjectGroup<PendingPaymentItem>[]
    onToggleProject: (projectId: string) => void
    // 展開列管理
    expandedRows: Set<string>
    onToggleExpand: (itemId: string) => void
    // 批次設定
    batchExpenseType: string
    batchAccountingSubject: string
    batchPaymentMonth: string
    // 傳遞給列表項目的所有必要 props
    onSelect: (itemId: string, checked: boolean) => void
    onCostChange: (itemId: string, value: string) => void
    onRemittanceNameChange: (itemId: string, value: string) => void
    onSaveCost: (itemId: string, cost: number, remittanceName: string | null) => void
    onInvoiceChange: (itemId: string, value: string) => void
    onFileModalOpen: (item: PendingPaymentItem) => void
    onOpenBankInfoModal: (item: PendingPaymentItem) => void
    onMergeSelection: (itemId: string, checked: boolean) => void
    onUnmerge: (groupId: string) => void
    onClearRejection: (requestId: string) => void
    onExpenseTypeChange: (itemId: string, value: string) => void
    onAccountingSubjectChange: (itemId: string, value: string) => void
    onExpectedPaymentMonthChange: (itemId: string, value: string) => void
    onResetToBatch: (itemId: string) => void
    selectedItems: string[]
    selectedForMerge: string[]
    selectedMergeType: 'account' | null
    isMergeMode: boolean
    canSelectForPayment: (item: PendingPaymentItem) => boolean
    canMergeWith: (item: PendingPaymentItem) => boolean
    shouldShowControls: (item: PendingPaymentItem) => boolean
    isValidInvoiceFormat: (invoice: string | null | undefined) => boolean
}

export function ProjectGroupView({
    groups,
    onToggleProject,
    expandedRows,
    onToggleExpand,
    batchExpenseType,
    batchAccountingSubject,
    batchPaymentMonth,
    onSelect,
    onCostChange,
    onRemittanceNameChange,
    onSaveCost,
    onInvoiceChange,
    onFileModalOpen,
    onOpenBankInfoModal,
    onMergeSelection,
    onUnmerge,
    onClearRejection,
    onExpenseTypeChange,
    onAccountingSubjectChange,
    onExpectedPaymentMonthChange,
    onResetToBatch,
    selectedItems,
    selectedForMerge,
    selectedMergeType,
    isMergeMode,
    canSelectForPayment,
    canMergeWith,
    shouldShowControls,
    isValidInvoiceFormat
}: ProjectGroupViewProps) {

    const colSpan = isMergeMode ? 7 : 6

    if (groups.length === 0) {
        return (
            <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-medium text-foreground">沒有待請款專案項目</h3>
                <p className="mt-1 text-sm text-muted-foreground">目前沒有需要處理的項目</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {groups.map((group) => (
                <div key={group.projectId} className="bg-card shadow-none border border-border rounded-lg overflow-hidden">
                    {/* 專案標題列 */}
                    <div
                        className="flex items-center justify-between p-3 bg-secondary cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => onToggleProject(group.projectId)}
                    >
                        <div className="flex items-center space-x-3">
                            {group.isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                            <Building2 className="h-5 w-5 text-info" />
                            <div>
                                <div className="font-medium text-foreground">{group.projectName}</div>
                                <div className="text-xs text-muted-foreground">
                                    {group.clientName || '未知客戶'} • {group.items.length} 筆項目
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="text-right">
                                <div className="text-sm font-medium text-foreground">
                                    NT$ {group.totalCost.toLocaleString()}
                                </div>
                                <div className="text-xs">
                                    {group.totalItems - group.readyItems > 0 ? (
                                        <span className="text-warning">
                                            待請款: {group.totalItems - group.readyItems} 筆
                                        </span>
                                    ) : (
                                        <span className="text-success">已就緒</span>
                                    )}
                                </div>
                            </div>
                            {/* 進度條 */}
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all ${group.hasRejected ? 'bg-destructive' :
                                        group.readyItems === group.totalItems ? 'bg-success' : 'bg-info'
                                        }`}
                                    style={{ width: `${(group.readyItems / group.totalItems) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 展開的項目列表 */}
                    {group.isExpanded && (
                        <div className="border-t border-border overflow-x-auto">
                            <table className="min-w-full divide-y divide-border">
                                <thead className="bg-secondary">
                                    <tr>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-8"></th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-40">KOL/服務</th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">合作項目</th>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-56">匯款/成本</th>
                                        {isMergeMode && (
                                            <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">合併</th>
                                        )}
                                        <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-48">檢核文件</th>
                                        <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">付款</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-border">
                                    {group.items.map((item) => {
                                        const displayItem = item.merge_group_id
                                            ? group.items.find(i => i.merge_group_id === item.merge_group_id && i.is_merge_leader) || item
                                            : item;
                                        const isExpanded = expandedRows.has(item.id)
                                        const mergeGroupItems = item.merge_group_id
                                            ? group.items.filter(i => i.merge_group_id === item.merge_group_id)
                                            : []

                                        return (
                                            <React.Fragment key={item.id}>
                                                <CompactItemRow
                                                    item={item}
                                                    displayItem={displayItem}
                                                    isExpanded={isExpanded}
                                                    onToggleExpand={onToggleExpand}
                                                    batchExpenseType={batchExpenseType}
                                                    batchAccountingSubject={batchAccountingSubject}
                                                    batchPaymentMonth={batchPaymentMonth}
                                                    isMergeMode={isMergeMode}
                                                    selectedForMerge={selectedForMerge}
                                                    canMergeWith={canMergeWith}
                                                    onMergeSelection={onMergeSelection}
                                                    onUnmerge={onUnmerge}
                                                    canSelectForPayment={canSelectForPayment}
                                                    shouldShowControls={shouldShowControls}
                                                    onPaymentSelection={onSelect}
                                                    onCostAmountChange={onCostChange}
                                                    onRemittanceNameChange={onRemittanceNameChange}
                                                    onSaveCost={onSaveCost}
                                                    onOpenFileModal={onFileModalOpen}
                                                    onOpenBankInfoModal={onOpenBankInfoModal}
                                                    onInvoiceNumberChange={onInvoiceChange}
                                                    isValidInvoiceFormat={isValidInvoiceFormat}
                                                    mergeGroupItems={mergeGroupItems}
                                                />
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={colSpan} className="p-0">
                                                            <ExpandedItemPanel
                                                                item={item}
                                                                mergeGroupItems={mergeGroupItems}
                                                                batchExpenseType={batchExpenseType}
                                                                batchAccountingSubject={batchAccountingSubject}
                                                                batchPaymentMonth={batchPaymentMonth}
                                                                onExpenseTypeChange={onExpenseTypeChange}
                                                                onAccountingSubjectChange={onAccountingSubjectChange}
                                                                onExpectedPaymentMonthChange={onExpectedPaymentMonthChange}
                                                                onCostAmountChange={onCostChange}
                                                                onRemittanceNameChange={onRemittanceNameChange}
                                                                onSaveCost={onSaveCost}
                                                                onClearRejection={onClearRejection}
                                                                onUnmerge={onUnmerge}
                                                                onOpenBankInfoModal={onOpenBankInfoModal}
                                                                onResetToBatch={onResetToBatch}
                                                                onClose={() => onToggleExpand(item.id)}
                                                            />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
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
