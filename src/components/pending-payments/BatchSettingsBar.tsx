import { Settings, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import { CURRENT_YEAR } from '@/lib/constants'

const PAYMENT_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => `${CURRENT_YEAR}年${i + 1}月`)

interface BatchSettingsBarProps {
    expenseType: string
    accountingSubject: string
    paymentMonth: string
    onExpenseTypeChange: (value: string) => void
    onAccountingSubjectChange: (value: string) => void
    onPaymentMonthChange: (value: string) => void
    onApplyToFiltered: () => void
    filteredItemCount: number
    hasActiveFilters: boolean
    isCollapsed: boolean
    onToggleCollapse: () => void
}

export function BatchSettingsBar({
    expenseType,
    accountingSubject,
    paymentMonth,
    onExpenseTypeChange,
    onAccountingSubjectChange,
    onPaymentMonthChange,
    onApplyToFiltered,
    filteredItemCount,
    hasActiveFilters,
    isCollapsed,
    onToggleCollapse,
}: BatchSettingsBarProps) {
    const { expenseTypeNames, accountingSubjectNames } = useExpenseDefaults()

    return (
        <div className="bg-secondary/50 border border-border rounded-lg overflow-hidden">
            {/* 標題列（始終可見） */}
            <div
                className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-secondary/80 transition-colors"
                onClick={onToggleCollapse}
            >
                <div className="flex items-center space-x-2">
                    {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    {isCollapsed ? (
                        <span className="text-sm text-muted-foreground">
                            批次設定：
                            <span className="text-foreground font-medium ml-1">
                                {expenseType} / {accountingSubject} / {paymentMonth}
                            </span>
                        </span>
                    ) : (
                        <span className="text-sm font-medium text-foreground">批次設定</span>
                    )}
                </div>
                {isCollapsed && (
                    <span className="text-xs text-muted-foreground">
                        {hasActiveFilters ? `篩選中 ${filteredItemCount} 筆` : `共 ${filteredItemCount} 筆`}
                    </span>
                )}
            </div>

            {/* 展開區 */}
            {!isCollapsed && (
                <div className="px-4 pb-3 pt-1 border-t border-border animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-1">支出種類</label>
                            <select
                                value={expenseType}
                                onChange={(e) => onExpenseTypeChange(e.target.value)}
                                className="h-8 text-xs bg-card border border-border text-foreground rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring min-w-[120px]"
                            >
                                {expenseTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-1">會計科目</label>
                            <select
                                value={accountingSubject}
                                onChange={(e) => onAccountingSubjectChange(e.target.value)}
                                className="h-8 text-xs bg-card border border-border text-foreground rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring min-w-[120px]"
                            >
                                <option value="">未設定</option>
                                {accountingSubjectNames.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="text-[10px] text-muted-foreground mb-1">預計支付月份</label>
                            <select
                                value={paymentMonth}
                                onChange={(e) => onPaymentMonthChange(e.target.value)}
                                className="h-8 text-xs bg-card border border-border text-foreground rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring min-w-[120px]"
                            >
                                {PAYMENT_MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onApplyToFiltered}
                            disabled={filteredItemCount === 0}
                            className="h-8 text-xs"
                        >
                            {hasActiveFilters
                                ? `套用至篩選結果 ${filteredItemCount} 筆`
                                : `套用至全部 ${filteredItemCount} 筆`}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
