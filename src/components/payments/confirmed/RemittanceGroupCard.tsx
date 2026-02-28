'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, User, ShieldCheck, Building2 } from 'lucide-react'
import type { MergedRemittanceGroup, RemittanceSettings } from '@/lib/payments/types'
import { PaymentRecordRow } from './PaymentRecordRow'
import { getMergeLabel } from '@/lib/mergeLabel'

type GroupSettings = RemittanceSettings[string]

interface RemittanceGroupCardProps {
    group: MergedRemittanceGroup
    settings?: GroupSettings
    onUpdateSettings?: (remittanceName: string, updates: Partial<GroupSettings>) => void
    onRevertItem?: (itemId: string) => void
    isAdmin?: boolean
}

export function RemittanceGroupCard({
    group,
    settings,
    onUpdateSettings,
    onRevertItem,
    isAdmin,
}: RemittanceGroupCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // 合併群組標籤映射
    const mergeGroupLabelMap = useMemo(() => {
        const map = new Map<string, string>()
        let index = 0
        group.items.forEach(item => {
            const mgId = item.payment_requests?.merge_group_id
            if (mgId && !map.has(mgId)) {
                map.set(mgId, getMergeLabel(index))
                index++
            }
        })
        return map
    }, [group.items])

    // 即時計算（只計算匯費，代扣由 WithholdingTab 獨立處理）
    const subtotal = group.totalAmount
    const fee = settings?.hasRemittanceFee ? (settings.remittanceFeeAmount || 0) : group.totalFee
    const netTotal = subtotal - fee

    // 是否顯示退回按鈕（僅 Admin + 有 handler + confirmation items）
    const showRevert = isAdmin && onRevertItem
    const colSpan = showRevert ? 6 : 5

    return (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
            {/* 標題列 */}
            <div
                className="flex items-center justify-between cursor-pointer hover:bg-secondary/50 px-4 py-3"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    {isExpanded ?
                        <ChevronDown className="h-4 w-4 text-muted-foreground" /> :
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    }
                    {group.isCompanyAccount ?
                        <Building2 className="h-5 w-5 text-success" /> :
                        <User className="h-5 w-5 text-info" />
                    }
                    <div>
                        <div className="font-medium text-foreground flex items-center gap-2">
                            {group.remittanceName}
                            {group.isCompanyAccount && (
                                <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded inline-flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3" />
                                    公司戶
                                </span>
                            )}
                            {!group.isCompanyAccount && group.isWithholdingExempt && (
                                <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded inline-flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3" />
                                    免扣
                                </span>
                            )}
                            {group.isPersonalClaim && (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                    個人報帳
                                </span>
                            )}
                            {group.payrollItems.length > 0 && group.items.length === 0 && group.expenseItems.length === 0 && (
                                <span className="text-xs bg-info/20 text-info px-2 py-0.5 rounded">
                                    薪資
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                            {group.bankName && <span>{group.bankName}</span>}
                            {group.branchName && <span>{group.branchName}</span>}
                            {group.accountNumber && <span>{group.accountNumber}</span>}
                        </div>
                    </div>
                </div>

                {/* 金額摘要 */}
                <div className="text-right">
                    <div className="font-bold text-info">
                        NT$ {netTotal.toLocaleString()}
                    </div>
                    {fee > 0 && (
                        <div className="text-xs text-muted-foreground">
                            總額 {subtotal.toLocaleString()} · 匯費 -{fee.toLocaleString()}
                        </div>
                    )}
                </div>
            </div>

            {/* 展開明細 */}
            {isExpanded && (
                <div className="border-t border-border">
                    {/* 匯費設定區（只有專案項目才顯示，薪資/個人報帳不顯示） */}
                    {onUpdateSettings && settings && group.items.length > 0 && !group.isPersonalClaim && (
                        <div className="px-4 py-3 bg-muted/20 border-b border-border">
                            <div className="flex items-center gap-3 text-sm">
                                <label className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors">
                                    <input
                                        type="checkbox"
                                        className="rounded border-border"
                                        checked={settings.hasRemittanceFee}
                                        onChange={(e) => onUpdateSettings(group.remittanceName, { hasRemittanceFee: e.target.checked })}
                                    />
                                    <span>匯費自付 (扣除)</span>
                                </label>
                                {settings.hasRemittanceFee && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">$</span>
                                        <input
                                            type="number"
                                            className="w-16 h-7 text-sm border-border rounded px-2 py-0"
                                            value={settings.remittanceFeeAmount}
                                            onChange={(e) => onUpdateSettings(group.remittanceName, { remittanceFeeAmount: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 來源清單明細 */}
                    {group.confirmationBreakdowns.length > 1 && (
                        <div className="px-4 py-2 bg-muted/20 border-b border-border">
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                來自 {group.confirmationBreakdowns.length} 筆確認清單
                            </div>
                            <div className="space-y-1">
                                {group.confirmationBreakdowns.map((bd, i) => (
                                    <div key={i} className="flex justify-between text-xs text-muted-foreground">
                                        <span>{bd.confirmationDate}</span>
                                        <span>小計 {bd.subtotal.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 項目表格 */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-secondary">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">專案名稱</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">KOL/服務</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">執行內容</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">匯款戶名</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">備註</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">匯款金額</th>
                                    {showRevert && (
                                        <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-16">操作</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-border">
                                {group.items.map((item) => (
                                    <PaymentRecordRow
                                        key={item.id}
                                        item={item}
                                        groupLabel={item.payment_requests?.merge_group_id ? mergeGroupLabelMap.get(item.payment_requests.merge_group_id) : undefined}
                                        onRevertItem={showRevert ? onRevertItem : undefined}
                                    />
                                ))}
                                {group.expenseItems.map((expense) => (
                                    <tr key={expense.id} className="text-sm hover:bg-secondary">
                                        <td className="px-4 py-3 text-foreground">
                                            {expense.project_name || '—'}
                                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning/20 text-warning">
                                                進項
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-foreground/70">{expense.vendor_name || '—'}</td>
                                        <td className="px-4 py-3 text-foreground/70">{expense.expense_type || '—'}</td>
                                        <td className="px-4 py-3 text-foreground/70">{group.remittanceName}</td>
                                        <td className="px-4 py-3 text-foreground/70 max-w-40 truncate" title={expense.note || ''}>{expense.note || '—'}</td>
                                        <td className="px-4 py-3 text-right font-medium text-foreground">
                                            NT$ {(expense.total_amount || expense.amount || 0).toLocaleString()}
                                        </td>
                                        {showRevert && <td />}
                                    </tr>
                                ))}
                                {group.payrollItems.map((p) => (
                                    <tr key={p.id} className="text-sm hover:bg-secondary">
                                        <td className="px-4 py-3 text-foreground">
                                            {p.salary_month || '—'}
                                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-info/20 text-info">
                                                薪資
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-foreground/70">{p.employee_name || '—'}</td>
                                        <td className="px-4 py-3 text-foreground/70">人事薪資</td>
                                        <td className="px-4 py-3 text-foreground/70">{group.remittanceName}</td>
                                        <td className="px-4 py-3 text-foreground/70 max-w-40 truncate" title={p.note || ''}>{p.note || '—'}</td>
                                        <td className="px-4 py-3 text-right font-medium text-foreground">
                                            NT$ {(p.net_salary || 0).toLocaleString()}
                                        </td>
                                        {showRevert && <td />}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-muted/20 font-medium text-sm">
                                <tr>
                                    <td colSpan={colSpan} className="px-4 py-2 text-right text-muted-foreground">小計</td>
                                    <td className="px-4 py-2 text-right">NT$ {subtotal.toLocaleString()}</td>
                                </tr>
                                {fee > 0 && (
                                    <tr className="text-warning">
                                        <td colSpan={colSpan} className="px-4 py-1 text-right">扣除：匯費</td>
                                        <td className="px-4 py-1 text-right">- NT$ {fee.toLocaleString()}</td>
                                    </tr>
                                )}
                                <tr className="bg-info/10 border-t border-info/25">
                                    <td colSpan={colSpan} className="px-4 py-2 text-right text-info font-bold">實付金額</td>
                                    <td className="px-4 py-2 text-right text-info font-bold text-lg">
                                        NT$ {netTotal.toLocaleString()}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
