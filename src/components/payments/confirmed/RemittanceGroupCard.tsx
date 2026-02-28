'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, User, ShieldCheck, Building2, Calculator, Zap } from 'lucide-react'
import type { MergedRemittanceGroup, RemittanceSettings } from '@/lib/payments/types'
import type { WithholdingSettings } from '@/types/custom.types'
import { checkWithholdingApplicability } from '@/lib/payments/aggregation'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'
import { PaymentRecordRow } from './PaymentRecordRow'
import { getMergeLabel } from '@/lib/mergeLabel'

type GroupSettings = RemittanceSettings[string]

interface RemittanceGroupCardProps {
    group: MergedRemittanceGroup
    withholdingRates?: WithholdingSettings | null
    settings?: GroupSettings
    onUpdateSettings?: (remittanceName: string, updates: Partial<GroupSettings>) => void
    onRevertItem?: (itemId: string) => void
    isAdmin?: boolean
}

export function RemittanceGroupCard({
    group,
    withholdingRates,
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

    // 費率
    const taxRate = withholdingRates?.income_tax_rate ?? DEFAULT_WITHHOLDING.income_tax_rate
    const nhiRate = withholdingRates?.nhi_supplement_rate ?? DEFAULT_WITHHOLDING.nhi_supplement_rate

    // 即時計算扣除項（優先用 settings，fallback 用 group 預計算值）
    const subtotal = group.totalAmount
    const tax = settings?.hasTax ? Math.floor(subtotal * taxRate) : group.totalTax
    const insurance = settings?.hasInsurance ? Math.floor(subtotal * nhiRate) : group.totalInsurance
    const fee = settings?.hasRemittanceFee ? (settings.remittanceFeeAmount || 0) : group.totalFee
    const netTotal = subtotal - tax - insurance - fee

    // 代扣適用性判斷
    const applicability = checkWithholdingApplicability(group, withholdingRates)

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
                    {(tax > 0 || insurance > 0 || fee > 0) && (
                        <div className="text-xs text-muted-foreground">
                            總額 {subtotal.toLocaleString()}
                            {tax > 0 && ` · 稅 -${tax.toLocaleString()}`}
                            {insurance > 0 && ` · 健保 -${insurance.toLocaleString()}`}
                            {fee > 0 && ` · 匯費 -${fee.toLocaleString()}`}
                        </div>
                    )}
                </div>
            </div>

            {/* 展開明細 */}
            {isExpanded && (
                <div className="border-t border-border">
                    {/* 匯費/代扣設定區 */}
                    {onUpdateSettings && settings && (
                        <div className="px-4 py-3 bg-muted/20 border-b border-border">
                            {applicability.showWithholding ? (
                                <div className="bg-card/60 rounded-lg p-3 border border-info/25">
                                    <div className="flex items-center gap-2 mb-2 text-info font-medium text-sm">
                                        <Calculator className="h-4 w-4" />
                                        付款試算設定
                                        <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded inline-flex items-center gap-1 font-normal">
                                            <Zap className="h-3 w-3" />
                                            已達門檻 (≥{(withholdingRates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold).toLocaleString()})
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-sm">
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-info/80 transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-border text-info focus:ring-info"
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
                                                    className="w-16 h-7 text-sm border-border rounded focus:ring-info focus:border-info px-2 py-0"
                                                    value={settings.remittanceFeeAmount}
                                                    onChange={(e) => onUpdateSettings(group.remittanceName, { remittanceFeeAmount: Number(e.target.value) })}
                                                />
                                            </div>
                                        )}
                                        <div className="w-px h-4 bg-border mx-1 hidden md:block" />
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-info/80 transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-border text-info focus:ring-info"
                                                checked={settings.hasTax}
                                                onChange={(e) => onUpdateSettings(group.remittanceName, { hasTax: e.target.checked })}
                                            />
                                            <span>代扣所得稅 ({(taxRate * 100).toFixed(0)}%)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-info/80 transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-border text-info focus:ring-info"
                                                checked={settings.hasInsurance}
                                                onChange={(e) => onUpdateSettings(group.remittanceName, { hasInsurance: e.target.checked })}
                                            />
                                            <span>代扣二代健保 ({(nhiRate * 100).toFixed(2)}%)</span>
                                        </label>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-card/60 rounded-lg p-3 border border-border">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <ShieldCheck className="h-4 w-4" />
                                        {applicability.reason === 'personal_claim' && '個人報帳項目，無需代扣'}
                                        {applicability.reason === 'company_account' && '公司戶，免代扣'}
                                        {applicability.reason === 'exempt' && '免扣（公會）'}
                                        {applicability.reason === 'below_threshold' && `未達門檻 (<${(withholdingRates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold).toLocaleString()})`}
                                    </div>
                                    {/* 非個人報帳仍可設定匯費 */}
                                    {!group.isPersonalClaim && (
                                        <div className="flex items-center gap-3 mt-2 text-sm">
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
                                    )}
                                </div>
                            )}
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
                                {tax > 0 && (
                                    <tr className="text-destructive">
                                        <td colSpan={colSpan} className="px-4 py-1 text-right">扣除：所得稅 ({(taxRate * 100).toFixed(0)}%)</td>
                                        <td className="px-4 py-1 text-right">- NT$ {tax.toLocaleString()}</td>
                                    </tr>
                                )}
                                {insurance > 0 && (
                                    <tr className="text-destructive">
                                        <td colSpan={colSpan} className="px-4 py-1 text-right">扣除：二代健保 ({(nhiRate * 100).toFixed(2)}%)</td>
                                        <td className="px-4 py-1 text-right">- NT$ {insurance.toLocaleString()}</td>
                                    </tr>
                                )}
                                {fee > 0 && (
                                    <tr className="text-destructive">
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
