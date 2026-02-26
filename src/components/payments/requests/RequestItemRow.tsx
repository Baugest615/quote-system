import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PaymentStatusBadge } from '../shared/PaymentStatusBadge'
import { CheckCircle, XCircle, FileText, Paperclip, Settings2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaymentRequestItem } from '@/lib/payments/types'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'

// merge_color (bg class) → border-left HSL color
const MERGE_BORDER_COLORS: Record<string, string> = {
    'bg-chart-1/15': 'hsl(var(--chart-1))',
    'bg-chart-2/15': 'hsl(var(--chart-2))',
    'bg-chart-3/15': 'hsl(var(--chart-3))',
    'bg-chart-4/15': 'hsl(var(--chart-4))',
    'bg-chart-5/15': 'hsl(var(--chart-5))',
    'bg-destructive/15': 'hsl(var(--destructive))',
}

// merge_color → badge 淡色背景 class
const MERGE_BADGE_COLORS: Record<string, string> = {
    'bg-chart-1/15': 'bg-[hsl(var(--chart-1))]/20 text-[hsl(var(--chart-1))]',
    'bg-chart-2/15': 'bg-[hsl(var(--chart-2))]/20 text-[hsl(var(--chart-2))]',
    'bg-chart-3/15': 'bg-[hsl(var(--chart-3))]/20 text-[hsl(var(--chart-3))]',
    'bg-chart-4/15': 'bg-[hsl(var(--chart-4))]/20 text-[hsl(var(--chart-4))]',
    'bg-chart-5/15': 'bg-[hsl(var(--chart-5))]/20 text-[hsl(var(--chart-5))]',
    'bg-destructive/15': 'bg-destructive/20 text-destructive',
}

interface RequestItemRowProps {
    item: PaymentRequestItem
    isSelected: boolean
    onSelect: (checked: boolean) => void
    onApprove: (item: PaymentRequestItem, overrideExpenseType?: string, overrideSubject?: string) => void
    onReject: (item: PaymentRequestItem, reason: string) => void
    onViewFiles: (item: PaymentRequestItem) => void
    isProcessing?: boolean
    groupLabel?: string
    mergeGroupItems?: PaymentRequestItem[]
}

export function RequestItemRow({
    item,
    isSelected,
    onSelect,
    onApprove,
    onReject,
    onViewFiles,
    isProcessing = false,
    groupLabel,
    mergeGroupItems
}: RequestItemRowProps) {
    const { expenseTypeNames, accountingSubjectNames, defaultSubjectsMap } = useExpenseDefaults()
    const [rejectReason, setRejectReason] = React.useState('')
    const [showRejectInput, setShowRejectInput] = React.useState(false)
    const [showOverride, setShowOverride] = React.useState(false)
    const [overrideExpenseType, setOverrideExpenseType] = React.useState('')
    const [overrideSubject, setOverrideSubject] = React.useState('')
    const [isExpanded, setIsExpanded] = React.useState(false)

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

    const handleRowClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.closest('input') || target.closest('button') || target.closest('select')) return
        setIsExpanded(!isExpanded)
    }

    // 非 leader 的合併成員：隱藏 checkbox 和操作按鈕
    const isMergeMember = !!item.merge_group_id && !item.is_merge_leader

    const borderColor = item.merge_group_id && item.merge_color
        ? MERGE_BORDER_COLORS[item.merge_color] || 'hsl(var(--info))'
        : undefined

    const badgeClass = item.merge_group_id && item.merge_color
        ? MERGE_BADGE_COLORS[item.merge_color] || 'bg-info/15 text-info'
        : 'bg-info/15 text-info'

    const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

    return (
        <>
            <tr
                className={cn(
                    "hover:bg-secondary transition-colors cursor-pointer",
                    isSelected && "bg-info/10"
                )}
                style={borderColor ? { borderLeft: `4px solid ${borderColor}` } : undefined}
                onClick={handleRowClick}
            >
                {/* 選取框 */}
                <td className="px-4 py-4 align-top w-10">
                    <div className="flex items-center gap-1">
                        {isMergeMember ? (
                            <div className="h-4 w-4 mt-1" />
                        ) : (
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => onSelect(e.target.checked)}
                                disabled={isProcessing}
                                className="h-4 w-4 text-primary focus:ring-primary border-border rounded mt-1"
                            />
                        )}
                        {isExpanded
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground mt-1" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground mt-1" />
                        }
                    </div>
                </td>

                {/* 專案與申請資訊 */}
                <td className="px-4 py-4 align-top">
                    <div className="flex flex-col space-y-1">
                        <span className="font-medium text-foreground">{item.quotations?.project_name || '未命名專案'}</span>
                        <span className="text-xs text-muted-foreground">
                            申請日期: {new Date(item.request_date || '').toLocaleDateString('zh-TW')}
                        </span>
                        {item.merge_group_id && groupLabel && (
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium w-fit",
                                badgeClass
                            )}>
                                合併 {groupLabel}{item.is_merge_leader ? '(主)' : ''}
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
                    {isMergeMember ? (
                        <span className="text-xs text-muted-foreground italic">隨主項</span>
                    ) : (
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
                    )}
                </td>
            </tr>

            {/* 展開面板 */}
            {isExpanded && (
                <tr
                    style={borderColor ? { borderLeft: `4px solid ${borderColor}` } : undefined}
                >
                    <td colSpan={7} className="px-0 py-0">
                        <div className="px-8 py-3 bg-accent/30 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* 左：報價明細 */}
                                <div className="space-y-2">
                                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">報價明細</div>
                                    {item.category && (
                                        <div className="text-xs text-muted-foreground">
                                            類別: {item.category}
                                        </div>
                                    )}
                                    <div className="text-sm text-foreground">
                                        {item.quantity || 1} × NT$ {fmt(item.price || 0)} = NT$ {fmt((item.quantity || 1) * (item.price || 0))}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        請款金額: <span className="text-foreground font-medium">NT$ {fmt(item.cost_amount || 0)}</span>
                                    </div>
                                    {item.quotations?.clients?.name && (
                                        <div className="text-xs text-muted-foreground">
                                            客戶: {item.quotations.clients.name}
                                        </div>
                                    )}
                                    {item.remark && (
                                        <div className="text-xs text-muted-foreground">
                                            備註: {item.remark}
                                        </div>
                                    )}
                                </div>

                                {/* 右：合併群組成員 */}
                                {item.merge_group_id && mergeGroupItems && mergeGroupItems.length > 1 && (
                                    <div className="space-y-2">
                                        <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                            合併群組 {groupLabel}（共 {mergeGroupItems.length} 筆，合計 NT$ {fmt(mergeGroupItems.reduce((sum, mi) => sum + (mi.cost_amount || 0), 0))}）
                                        </div>
                                        <div className="space-y-1">
                                            {mergeGroupItems.map(mi => (
                                                <div key={mi.id} className="flex items-center gap-2 text-xs">
                                                    <span
                                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: borderColor || 'hsl(var(--info))' }}
                                                    />
                                                    <span className={mi.id === item.id ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                                                        {mi.kols?.name || '未知'}
                                                    </span>
                                                    <span className="text-muted-foreground/50">—</span>
                                                    <span className={mi.id === item.id ? 'text-foreground' : 'text-muted-foreground'}>
                                                        {mi.service || ''}
                                                    </span>
                                                    <span className="ml-auto text-foreground font-medium">
                                                        NT$ {fmt(mi.cost_amount || 0)}
                                                    </span>
                                                    {mi.is_merge_leader && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-info/15 text-info">主</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}
