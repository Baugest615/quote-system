import { useRef, useEffect, useMemo } from 'react'
import { FileText, User, ShieldCheck } from 'lucide-react'
import { PaymentConfirmation } from '@/lib/payments/types'
import { groupItemsByRemittance } from '@/lib/payments/grouping'
import { checkWithholdingApplicability } from '@/lib/payments/aggregation'
import { PaymentRecordRow } from './PaymentRecordRow'
import { RemittanceSettings } from '@/lib/payments/types'
import type { WithholdingSettings } from '@/types/custom.types'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'
import { getMergeLabel } from '@/lib/mergeLabel'

interface ConfirmationDetailsProps {
    confirmation: PaymentConfirmation
    settings: RemittanceSettings
    updateSettings?: (remittanceName: string, updates: Partial<RemittanceSettings[string]>) => void
    getSettings: (remittanceName: string) => RemittanceSettings[string]
    withholdingRates?: WithholdingSettings | null
    onRevertItem?: (itemId: string) => void
}

export function ConfirmationDetails({ confirmation, settings, updateSettings, getSettings, withholdingRates, onRevertItem }: ConfirmationDetailsProps) {
    const remittanceGroups = groupItemsByRemittance(confirmation.payment_confirmation_items)

    // 合併群組標籤映射（A, B, C...）
    const mergeGroupLabelMap = useMemo(() => {
        const map = new Map<string, string>()
        let index = 0
        confirmation.payment_confirmation_items.forEach(item => {
            const mgId = item.payment_requests?.merge_group_id
            if (mgId && !map.has(mgId)) {
                map.set(mgId, getMergeLabel(index))
                index++
            }
        })
        return map
    }, [confirmation.payment_confirmation_items])

    // 門檻自動判斷：首次展開時，對沒有已儲存設定的群組自動預設代扣勾選
    // 僅在可編輯模式（有 updateSettings）時才執行
    const autoInitDone = useRef(false)
    useEffect(() => {
        if (!updateSettings) return
        if (autoInitDone.current) return
        if (remittanceGroups.length === 0) return
        autoInitDone.current = true

        const taxThreshold = withholdingRates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold
        const nhiThreshold = withholdingRates?.nhi_threshold ?? DEFAULT_WITHHOLDING.nhi_threshold
        const feeDefault = withholdingRates?.remittance_fee_default ?? DEFAULT_WITHHOLDING.remittance_fee_default

        remittanceGroups.forEach(group => {
            // 已有儲存設定的群組跳過（使用者已手動調整過）
            if (settings[group.remittanceName]) return

            const isPersonalClaim = group.items.some(
                item => item.source_type === 'personal' || item.expense_claim_id
            )
            const applicability = checkWithholdingApplicability(
                { ...group, isPersonalClaim },
                withholdingRates
            )

            if (!applicability.showWithholding) {
                // 不適用代扣的群組：所有代扣設為 false
                updateSettings(group.remittanceName, {
                    hasTax: false,
                    hasInsurance: false,
                    hasRemittanceFee: !isPersonalClaim,  // 非個人報帳才預設顯示匯費
                    remittanceFeeAmount: feeDefault,
                })
                return
            }

            updateSettings(group.remittanceName, {
                hasTax: group.totalAmount >= taxThreshold,
                hasInsurance: group.totalAmount >= nhiThreshold,
                hasRemittanceFee: false,
                remittanceFeeAmount: feeDefault,
            })
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (remittanceGroups.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                <p>此確認記錄沒有關聯的項目</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 p-4">
            {remittanceGroups.map((group, groupIndex) => {
                const settings = getSettings(group.remittanceName)
                const isPersonalClaim = group.items.some(
                    item => item.source_type === 'personal' || item.expense_claim_id
                )

                // 即時計算（匯費從 settings，代扣依門檻自動判斷——不依賴 DB 可能過期的值）
                const subtotal = group.totalAmount
                const fee = settings.hasRemittanceFee ? settings.remittanceFeeAmount : 0
                const taxRate = withholdingRates?.income_tax_rate ?? DEFAULT_WITHHOLDING.income_tax_rate
                const nhiRate = withholdingRates?.nhi_supplement_rate ?? DEFAULT_WITHHOLDING.nhi_supplement_rate
                const taxThreshold = withholdingRates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold
                const nhiThreshold = withholdingRates?.nhi_threshold ?? DEFAULT_WITHHOLDING.nhi_threshold
                const applicability = checkWithholdingApplicability(
                    { ...group, isPersonalClaim },
                    withholdingRates
                )
                const tax = applicability.showWithholding && subtotal >= taxThreshold
                    ? Math.floor(subtotal * taxRate) : 0
                const insurance = applicability.showWithholding && subtotal >= nhiThreshold
                    ? Math.floor(subtotal * nhiRate) : 0
                const netTotal = subtotal - fee - tax - insurance
                const colSpan = onRevertItem ? 6 : 5

                return (
                    <div key={groupIndex} className="border rounded-lg overflow-hidden shadow-none bg-card">
                        {/* 匯款戶名標題與設定區 */}
                        <div className="bg-info/10 border-b p-4">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                {/* 左側：基本資訊 */}
                                <div className="flex items-start space-x-3">
                                    <User className="h-6 w-6 text-info mt-1" />
                                    <div>
                                        <div className="font-semibold text-lg text-foreground flex items-center gap-2">
                                            {group.remittanceName}
                                            {group.isCompanyAccount && (
                                                <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded font-normal inline-flex items-center gap-1">
                                                    <ShieldCheck className="h-3 w-3" />
                                                    公司戶
                                                </span>
                                            )}
                                            {!group.isCompanyAccount && !group.isWithholdingExempt && !isPersonalClaim && (
                                                <span className="text-xs bg-chart-4/20 text-chart-4 px-2 py-0.5 rounded font-normal">
                                                    勞報
                                                </span>
                                            )}
                                            {!group.isCompanyAccount && group.isWithholdingExempt && (
                                                <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded font-normal inline-flex items-center gap-1">
                                                    <ShieldCheck className="h-3 w-3" />
                                                    免扣
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                            {group.bankName && (
                                                <span><span className="font-medium">銀行:</span> {group.bankName}</span>
                                            )}
                                            {group.branchName && (
                                                <span><span className="font-medium">分行:</span> {group.branchName}</span>
                                            )}
                                            {group.accountNumber && (
                                                <span><span className="font-medium">帳號:</span> {group.accountNumber}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 右側：匯費設定（個人報帳不顯示） */}
                                {!isPersonalClaim && (
                                    <div className="bg-card/60 rounded-lg p-3 border border-border">
                                        <div className="flex items-center gap-3 text-sm">
                                            <label className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-border"
                                                    checked={settings.hasRemittanceFee}
                                                    disabled={!updateSettings}
                                                    onChange={(e) => updateSettings?.(group.remittanceName, { hasRemittanceFee: e.target.checked })}
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
                                                        disabled={!updateSettings}
                                                        onChange={(e) => updateSettings?.(group.remittanceName, { remittanceFeeAmount: Number(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 項目列表 */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-secondary">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">專案名稱</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">KOL/服務</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">執行內容</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">匯款戶名</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">備註</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">匯款金額</th>
                                        {onRevertItem && (
                                            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-16">操作</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-border">
                                    {group.items.map((item) => (
                                        <PaymentRecordRow
                                            key={item.id}
                                            item={item}
                                            groupLabel={item.payment_requests?.merge_group_id ? mergeGroupLabelMap.get(item.payment_requests.merge_group_id) : undefined}
                                            onRevertItem={onRevertItem}
                                        />
                                    ))}
                                </tbody>
                                {/* 結算列 */}
                                <tfoot className="bg-muted/20 font-medium text-sm">
                                    <tr>
                                        <td colSpan={colSpan} className="px-4 py-2 text-right text-muted-foreground">小計</td>
                                        <td className="px-4 py-2 text-right text-foreground">
                                            NT$ {subtotal.toLocaleString()}
                                        </td>
                                    </tr>
                                    {fee > 0 && (
                                        <tr className="text-warning">
                                            <td colSpan={colSpan} className="px-4 py-1 text-right">扣除：匯費</td>
                                            <td className="px-4 py-1 text-right">- NT$ {fee.toLocaleString()}</td>
                                        </tr>
                                    )}
                                    {tax > 0 && (
                                        <tr className="text-warning">
                                            <td colSpan={colSpan} className="px-4 py-1 text-right">扣除：代扣所得稅</td>
                                            <td className="px-4 py-1 text-right">- NT$ {tax.toLocaleString()}</td>
                                        </tr>
                                    )}
                                    {insurance > 0 && (
                                        <tr className="text-warning">
                                            <td colSpan={colSpan} className="px-4 py-1 text-right">扣除：代扣二代健保</td>
                                            <td className="px-4 py-1 text-right">- NT$ {insurance.toLocaleString()}</td>
                                        </tr>
                                    )}
                                    <tr className="bg-info/10 border-t border-info/25">
                                        <td colSpan={colSpan} className="px-4 py-3 text-right text-info font-bold">實付金額</td>
                                        <td className="px-4 py-3 text-right text-info font-bold text-lg">
                                            NT$ {netTotal.toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
