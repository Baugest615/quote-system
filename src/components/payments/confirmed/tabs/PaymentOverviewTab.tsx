'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { DollarSign, Download, Users, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PaymentConfirmation, RemittanceSettings } from '@/lib/payments/types'
import type { WithholdingSettings, AccountingPayroll, AccountingExpense } from '@/types/custom.types'
import {
    getAvailableMonths,
    aggregateMonthlyRemittanceGroups,
    splitRemittanceGroups,
    exportBankTransferCsv,
    checkWithholdingApplicability,
} from '@/lib/payments/aggregation'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'
import { getBillingMonthKey } from '@/lib/payments/billingPeriod'
import { RemittanceGroupCard } from '../RemittanceGroupCard'

interface PaymentOverviewTabProps {
    confirmations: PaymentConfirmation[]
    withholdingRates?: WithholdingSettings | null
    payrollData?: AccountingPayroll[]
    expensesData?: AccountingExpense[]
    onUpdateSettings?: (confirmationId: string, remittanceName: string, updates: Partial<RemittanceSettings[string]>) => void
    onRevertItem?: (itemId: string) => void
    isAdmin?: boolean
}

export function PaymentOverviewTab({
    confirmations,
    withholdingRates,
    payrollData,
    expensesData,
    onUpdateSettings,
    onRevertItem,
    isAdmin,
}: PaymentOverviewTabProps) {
    const availableMonths = useMemo(
        () => getAvailableMonths(confirmations, expensesData, payrollData),
        [confirmations, expensesData, payrollData]
    )

    const [selectedMonth, setSelectedMonth] = useState(() => {
        const currentBillingMonth = getBillingMonthKey(new Date())
        return availableMonths.includes(currentBillingMonth) ? currentBillingMonth : (availableMonths[0] || currentBillingMonth)
    })

    const groups = useMemo(
        () => aggregateMonthlyRemittanceGroups(confirmations, selectedMonth, withholdingRates, expensesData, payrollData),
        [confirmations, selectedMonth, withholdingRates, expensesData, payrollData]
    )

    const { personalGroups, companyGroups } = useMemo(
        () => splitRemittanceGroups(groups),
        [groups]
    )

    // --- 聚合匯費設定：從各 confirmation 的 remittance_settings 合併 ---
    const [localSettings, setLocalSettings] = useState<Record<string, RemittanceSettings[string]>>({})
    const autoInitDone = useRef(false)

    // 從 confirmations 提取 settings 合併
    const mergedSettingsFromDb = useMemo(() => {
        const result: Record<string, RemittanceSettings[string]> = {}
        const monthConfirmations = confirmations.filter(c =>
            getBillingMonthKey(c.confirmation_date) === selectedMonth
        )
        for (const c of monthConfirmations) {
            const rs = c.remittance_settings
            if (!rs) continue
            for (const [name, s] of Object.entries(rs)) {
                if (!result[name]) result[name] = { ...s }
            }
        }
        return result
    }, [confirmations, selectedMonth])

    // 月份切換時重置 autoInit
    useEffect(() => {
        autoInitDone.current = false
        setLocalSettings({})
    }, [selectedMonth])

    // 自動初始化（首次展開時，對沒有已儲存設定的群組自動預設）
    // hasTax/hasInsurance 永遠依門檻重新計算（總覽 tab 為唯讀，不應從 DB 讀取過期值）
    // hasRemittanceFee/remittanceFeeAmount 才從 DB 讀取（使用者可控設定）
    useEffect(() => {
        if (autoInitDone.current) return
        if (groups.length === 0) return
        autoInitDone.current = true

        const taxThreshold = withholdingRates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold
        const nhiThreshold = withholdingRates?.nhi_threshold ?? DEFAULT_WITHHOLDING.nhi_threshold
        const feeDefault = withholdingRates?.remittance_fee_default ?? DEFAULT_WITHHOLDING.remittance_fee_default

        const inits: Record<string, RemittanceSettings[string]> = {}
        for (const group of groups) {
            const dbSettings = mergedSettingsFromDb[group.remittanceName]
            const applicability = checkWithholdingApplicability(group, withholdingRates)

            // hasTax/hasInsurance：永遠依據門檻自動判斷（忽略 DB 可能的過期值）
            const hasTax = applicability.showWithholding && group.totalAmount >= taxThreshold
            const hasInsurance = applicability.showWithholding && group.totalAmount >= nhiThreshold

            if (dbSettings) {
                // 已有 DB 設定：匯費用 DB 值，代扣重新計算
                inits[group.remittanceName] = {
                    hasTax,
                    hasInsurance,
                    hasRemittanceFee: dbSettings.hasRemittanceFee,
                    remittanceFeeAmount: dbSettings.remittanceFeeAmount,
                }
            } else {
                // 新群組：根據類型預設
                inits[group.remittanceName] = {
                    hasTax,
                    hasInsurance,
                    hasRemittanceFee: !applicability.showWithholding && group.items.length > 0 && !group.isPersonalClaim,
                    remittanceFeeAmount: feeDefault,
                }
            }
        }
        setLocalSettings(inits)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, mergedSettingsFromDb])

    // 找到 remittanceName 對應的所有 confirmation IDs
    const getConfirmationIdsForName = useCallback((remittanceName: string): string[] => {
        return groups
            .filter(g => g.remittanceName === remittanceName)
            .flatMap(g => g.confirmationBreakdowns.map(bd => bd.confirmationId))
    }, [groups])

    const handleUpdateSettings = useCallback((remittanceName: string, updates: Partial<RemittanceSettings[string]>) => {
        let mergedSettings: RemittanceSettings[string] | undefined

        setLocalSettings(prev => {
            const current = prev[remittanceName] || {
                hasRemittanceFee: false,
                remittanceFeeAmount: 30,
                hasTax: false,
                hasInsurance: false,
            }
            mergedSettings = { ...current, ...updates }
            return { ...prev, [remittanceName]: mergedSettings }
        })

        // 傳完整 merged settings（含 auto-init 的 hasTax/hasInsurance），避免 DB 覆蓋
        if (onUpdateSettings && mergedSettings) {
            const ids = getConfirmationIdsForName(remittanceName)
            for (const cid of ids) {
                onUpdateSettings(cid, remittanceName, mergedSettings)
            }
        }
    }, [onUpdateSettings, getConfirmationIdsForName])

    const getSettings = useCallback((remittanceName: string) => {
        return localSettings[remittanceName] || undefined
    }, [localSettings])

    // 彙總數字（匯費使用 localSettings 即時計算，代扣從 group 取得）
    const summary = useMemo(() => {
        let totalAmount = 0
        let totalFee = 0
        let totalTax = 0
        let totalInsurance = 0

        groups.forEach(g => {
            const s = localSettings[g.remittanceName]
            totalAmount += g.totalAmount
            totalFee += s?.hasRemittanceFee ? (s.remittanceFeeAmount || 0) : g.totalFee
            totalTax += g.totalTax
            totalInsurance += g.totalInsurance
        })

        const totalDeductions = totalFee + totalTax + totalInsurance
        return { totalAmount, totalFee, totalTax, totalInsurance, totalDeductions, netTotal: totalAmount - totalDeductions }
    }, [groups, localSettings])

    const hasAnyData = confirmations.length > 0
        || (expensesData && expensesData.length > 0)
        || (payrollData && payrollData.length > 0)

    if (!hasAnyData) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                目前沒有已確認的請款記錄
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* 月份選擇 + 匯出 */}
            <div className="flex items-center justify-between bg-card p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-info" />
                    <span className="font-medium text-foreground">{selectedMonth} 匯款總覽</span>
                    <span className="text-sm text-muted-foreground">
                        共 {groups.length} 個收款方
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="h-8 text-sm bg-secondary border border-border rounded px-2 text-foreground"
                    >
                        {availableMonths.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportBankTransferCsv(groups, selectedMonth)}
                        disabled={groups.length === 0}
                    >
                        <Download className="h-4 w-4 mr-1" />
                        匯款明細 CSV
                    </Button>
                </div>
            </div>

            {/* 彙總卡片 */}
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="匯款總額" value={summary.totalAmount} color="text-foreground" />
                <div className="rounded-lg p-3 border bg-secondary/50 border-border">
                    <div className="text-xs text-muted-foreground mb-1">扣除合計</div>
                    <div className="text-lg font-bold text-warning">
                        NT$ {summary.totalDeductions.toLocaleString()}
                    </div>
                    {summary.totalDeductions > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                            {summary.totalFee > 0 && <div>匯費 {summary.totalFee.toLocaleString()}</div>}
                            {summary.totalTax > 0 && <div>所得稅 {summary.totalTax.toLocaleString()}</div>}
                            {summary.totalInsurance > 0 && <div>健保 {summary.totalInsurance.toLocaleString()}</div>}
                        </div>
                    )}
                </div>
                <SummaryCard label="實付總額" value={summary.netTotal} color="text-info" highlight />
            </div>

            {/* 個人匯款區塊（含薪資） */}
            {personalGroups.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                        <Users className="h-5 w-5 text-info" />
                        個人匯款（{personalGroups.length} 人）
                    </div>
                    <div className="space-y-3">
                        {personalGroups.map((group) => (
                            <RemittanceGroupCard
                                key={group.remittanceName}
                                group={group}
                                settings={getSettings(group.remittanceName)}
                                onUpdateSettings={onUpdateSettings ? handleUpdateSettings : undefined}
                                onRevertItem={onRevertItem}
                                isAdmin={isAdmin}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 公司匯款區塊 */}
            {companyGroups.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                        <Building2 className="h-5 w-5 text-success" />
                        公司匯款（{companyGroups.length} 筆）
                    </div>
                    <div className="space-y-3">
                        {companyGroups.map((group) => (
                            <RemittanceGroupCard
                                key={group.remittanceName}
                                group={group}
                                settings={getSettings(group.remittanceName)}
                                onUpdateSettings={onUpdateSettings ? handleUpdateSettings : undefined}
                                onRevertItem={onRevertItem}
                                isAdmin={isAdmin}
                            />
                        ))}
                    </div>
                </div>
            )}

            {groups.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    {selectedMonth} 沒有匯款資料
                </div>
            )}
        </div>
    )
}

function SummaryCard({ label, value, color, highlight }: {
    label: string
    value: number
    color: string
    highlight?: boolean
}) {
    return (
        <div className={`rounded-lg p-3 border ${highlight ? 'bg-info/5 border-info/25' : 'bg-secondary/50 border-border'}`}>
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className={`text-lg font-bold ${color}`}>
                NT$ {value.toLocaleString()}
            </div>
        </div>
    )
}
