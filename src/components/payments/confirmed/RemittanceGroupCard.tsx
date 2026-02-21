'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, User, ShieldCheck, Building2 } from 'lucide-react'
import type { MergedRemittanceGroup } from '@/lib/payments/types'
import type { WithholdingSettings } from '@/types/custom.types'
import { checkWithholdingApplicability } from '@/lib/payments/aggregation'
import { PaymentRecordRow } from './PaymentRecordRow'

interface RemittanceGroupCardProps {
    group: MergedRemittanceGroup
    withholdingRates?: WithholdingSettings | null
}

export function RemittanceGroupCard({ group, withholdingRates }: RemittanceGroupCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const applicability = checkWithholdingApplicability(group, withholdingRates)

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
                        NT$ {group.netTotal.toLocaleString()}
                    </div>
                    {(group.totalTax > 0 || group.totalInsurance > 0 || group.totalFee > 0) && (
                        <div className="text-xs text-muted-foreground">
                            總額 {group.totalAmount.toLocaleString()}
                            {group.totalTax > 0 && ` · 稅 -${group.totalTax.toLocaleString()}`}
                            {group.totalInsurance > 0 && ` · 健保 -${group.totalInsurance.toLocaleString()}`}
                            {group.totalFee > 0 && ` · 匯費 -${group.totalFee.toLocaleString()}`}
                        </div>
                    )}
                </div>
            </div>

            {/* 展開明細 */}
            {isExpanded && (
                <div className="border-t border-border">
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
                                        <span>
                                            小計 {bd.subtotal.toLocaleString()}
                                            {bd.tax > 0 && ` · 稅 -${bd.tax.toLocaleString()}`}
                                            {bd.insurance > 0 && ` · 健保 -${bd.insurance.toLocaleString()}`}
                                            {bd.fee > 0 && ` · 匯費 -${bd.fee.toLocaleString()}`}
                                        </span>
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
                                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">匯款金額</th>
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-border">
                                {group.items.map((item) => (
                                    <PaymentRecordRow key={item.id} item={item} />
                                ))}
                            </tbody>
                            <tfoot className="bg-muted/20 font-medium text-sm">
                                <tr>
                                    <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">小計</td>
                                    <td className="px-4 py-2 text-right">NT$ {group.totalAmount.toLocaleString()}</td>
                                </tr>
                                {group.totalTax > 0 && (
                                    <tr className="text-destructive">
                                        <td colSpan={4} className="px-4 py-1 text-right">扣除：所得稅</td>
                                        <td className="px-4 py-1 text-right">- NT$ {group.totalTax.toLocaleString()}</td>
                                    </tr>
                                )}
                                {group.totalInsurance > 0 && (
                                    <tr className="text-destructive">
                                        <td colSpan={4} className="px-4 py-1 text-right">扣除：二代健保</td>
                                        <td className="px-4 py-1 text-right">- NT$ {group.totalInsurance.toLocaleString()}</td>
                                    </tr>
                                )}
                                {group.totalFee > 0 && (
                                    <tr className="text-destructive">
                                        <td colSpan={4} className="px-4 py-1 text-right">扣除：匯費</td>
                                        <td className="px-4 py-1 text-right">- NT$ {group.totalFee.toLocaleString()}</td>
                                    </tr>
                                )}
                                <tr className="bg-info/10 border-t border-info/25">
                                    <td colSpan={4} className="px-4 py-2 text-right text-info font-bold">實付金額</td>
                                    <td className="px-4 py-2 text-right text-info font-bold text-lg">
                                        NT$ {group.netTotal.toLocaleString()}
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
