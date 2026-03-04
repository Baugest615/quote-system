'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet, DollarSign, ShieldCheck, Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { PaymentConfirmation } from '@/lib/payments/types'
import type { WithholdingSettings } from '@/types/custom.types'
import { useWithholdingSettlements, useCreateSettlement } from '@/hooks/useWithholdingSettlements'
import {
    computeMonthlyWithholding,
    generateNhiDetailCsv,
    generateTaxWithholdingCsv,
    generateFullWithholdingCsv,
    downloadCsv,
} from '@/lib/payments/withholding-export'
import { getBillingMonthKey } from '@/lib/payments/billingPeriod'
import { SettlementCard } from './withholding/SettlementCard'
import { SummaryCard } from './withholding/SummaryCard'
import { PersonRow } from './withholding/PersonRow'
import { ReconciliationTable } from './withholding/ReconciliationTable'
import { SettlementHistoryList } from './withholding/SettlementHistoryList'

interface WithholdingReportProps {
    confirmations: PaymentConfirmation[]
    withholdingRates?: WithholdingSettings | null
    alwaysExpanded?: boolean
}

export function WithholdingReport({ confirmations, withholdingRates, alwaysExpanded = false }: WithholdingReportProps) {
    const [isExpanded, setIsExpanded] = useState(alwaysExpanded)
    const [showSettleForm, setShowSettleForm] = useState<'income_tax' | 'nhi_supplement' | null>(null)
    const [settleAmount, setSettleAmount] = useState('')
    const [settleNote, setSettleNote] = useState('')

    // 取得所有可用帳務月份（使用 10 日切點規則）
    const availableMonths = useMemo(() => {
        const months = new Set<string>()
        confirmations.forEach(c => months.add(getBillingMonthKey(c.confirmation_date)))
        return Array.from(months).sort().reverse()
    }, [confirmations])

    // 預設選擇當前帳務月份（若有資料），否則選最近有資料的月份
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const currentMonth = getBillingMonthKey(new Date())
        const months = new Set<string>()
        confirmations.forEach(c => months.add(getBillingMonthKey(c.confirmation_date)))
        return months.has(currentMonth) ? currentMonth : (Array.from(months).sort().reverse()[0] || currentMonth)
    })

    // 繳納記錄
    const { data: settlements = [] } = useWithholdingSettlements(selectedMonth)
    const createSettlement = useCreateSettlement()

    // 計算月彙總
    const summaries = useMemo(() =>
        computeMonthlyWithholding(confirmations, selectedMonth, withholdingRates),
        [confirmations, selectedMonth, withholdingRates]
    )

    // 彙總數字（含繳納狀態）
    const totals = useMemo(() => {
        let totalPayment = 0, totalTax = 0, totalNhi = 0, withheldCount = 0, exemptCount = 0
        summaries.forEach(s => {
            totalPayment += s.totalPayment
            totalTax += s.incomeTaxWithheld
            totalNhi += s.nhiSupplement
            if (s.incomeTaxWithheld > 0 || s.nhiSupplement > 0) withheldCount++
            if (s.isExempt) exemptCount++
        })
        const taxSettled = settlements.filter(s => s.type === 'income_tax').reduce((sum, s) => sum + s.amount, 0)
        const nhiSettled = settlements.filter(s => s.type === 'nhi_supplement').reduce((sum, s) => sum + s.amount, 0)
        return {
            totalPayment, totalTax, totalNhi, withheldCount, exemptCount,
            taxSettled, nhiSettled,
            taxOutstanding: totalTax - taxSettled,
            nhiOutstanding: totalNhi - nhiSettled,
        }
    }, [summaries, settlements])

    // 匯出處理
    const handleExportNhi = () => {
        downloadCsv(generateNhiDetailCsv(summaries, selectedMonth), `二代健保補充保費明細_${selectedMonth}.csv`)
        toast.success('二代健保申報明細已下載')
    }
    const handleExportTax = () => {
        downloadCsv(generateTaxWithholdingCsv(summaries, selectedMonth), `所得稅扣繳明細_${selectedMonth}.csv`)
        toast.success('所得稅扣繳明細已下載')
    }
    const handleExportFull = () => {
        downloadCsv(generateFullWithholdingCsv(summaries, selectedMonth), `代扣代繳彙總_${selectedMonth}.csv`)
        toast.success('代扣代繳彙總已下載')
    }

    // 標記已繳
    const handleSettle = async () => {
        if (!showSettleForm || !settleAmount) return
        const amount = parseInt(settleAmount)
        if (isNaN(amount) || amount <= 0) { toast.error('請輸入有效金額'); return }
        try {
            await createSettlement.mutateAsync({ month: selectedMonth, type: showSettleForm, amount, note: settleNote || undefined })
            toast.success(`已記錄 ${selectedMonth} ${showSettleForm === 'income_tax' ? '所得稅' : '二代健保'} 繳納 NT$ ${amount.toLocaleString()}`)
            setShowSettleForm(null); setSettleAmount(''); setSettleNote('')
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error)
            console.error('Settlement creation failed:', error)
            toast.error(`記錄繳納失敗：${msg}`)
        }
    }

    if (confirmations.length === 0) return null

    // 月份選擇 + 摘要資訊
    const monthSummaryInfo = (
        <div className="text-sm text-muted-foreground flex items-center gap-3">
            <span className="font-medium text-foreground">{selectedMonth}</span>
            <span>所得稅: NT$ {totals.totalTax.toLocaleString()}</span>
            <span>健保: NT$ {totals.totalNhi.toLocaleString()}</span>
            {(totals.taxOutstanding > 0 || totals.nhiOutstanding > 0) && (
                <span className="text-warning font-medium">待繳 NT$ {(totals.taxOutstanding + totals.nhiOutstanding).toLocaleString()}</span>
            )}
            {totals.taxOutstanding <= 0 && totals.nhiOutstanding <= 0 && (totals.totalTax > 0 || totals.totalNhi > 0) && (
                <span className="text-success font-medium">已全數繳納</span>
            )}
        </div>
    )

    const monthSelector = (
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="h-8 text-sm bg-secondary border border-border rounded px-2 text-foreground"
            >
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={handleExportFull} className="text-warning hover:text-warning/80">
                <Download className="h-4 w-4 mr-1" />彙總
            </Button>
        </div>
    )

    // 共用的展開內容
    const renderContent = () => (
        <>
            {/* 繳納狀態卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SettlementCard label="所得稅" total={totals.totalTax} settled={totals.taxSettled} outstanding={totals.taxOutstanding}
                    onSettle={() => { setShowSettleForm('income_tax'); setSettleAmount(String(totals.taxOutstanding > 0 ? totals.taxOutstanding : '')) }} />
                <SettlementCard label="二代健保" total={totals.totalNhi} settled={totals.nhiSettled} outstanding={totals.nhiOutstanding}
                    onSettle={() => { setShowSettleForm('nhi_supplement'); setSettleAmount(String(totals.nhiOutstanding > 0 ? totals.nhiOutstanding : '')) }} />
            </div>

            {/* 標記已繳表單 */}
            {showSettleForm && (
                <div className="bg-info/5 border border-info/25 rounded-lg p-4 space-y-3">
                    <div className="text-sm font-medium text-info">
                        記錄繳納 — {showSettleForm === 'income_tax' ? '所得稅' : '二代健保'}（公司直接繳）
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground">繳納金額</label>
                            <Input type="number" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} className="w-40 h-8" placeholder="金額" />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs text-muted-foreground">備註</label>
                            <Input value={settleNote} onChange={e => setSettleNote(e.target.value)} className="h-8" placeholder="例：轉帳繳納、支票等" />
                        </div>
                        <Button size="sm" onClick={handleSettle} disabled={createSettlement.isPending}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />確認繳納
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowSettleForm(null)}>取消</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">* 員工代墊請使用「個人報帳」功能，選擇支出種類「代扣代繳」，核准後自動記錄</p>
                </div>
            )}

            {/* 對帳明細 */}
            <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">對帳明細 — {selectedMonth}</div>
                <ReconciliationTable totals={totals} />
                <SettlementHistoryList settlements={settlements} selectedMonth={selectedMonth} hasOutstanding={totals.totalTax > 0 || totals.totalNhi > 0} />
            </div>

            {/* 彙總卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard label="給付總額" value={totals.totalPayment} icon={<DollarSign className="h-4 w-4" />} color="text-foreground" />
                <SummaryCard label="代扣所得稅" value={totals.totalTax} icon={<DollarSign className="h-4 w-4" />} color="text-destructive" />
                <SummaryCard label="代扣二代健保" value={totals.totalNhi} icon={<DollarSign className="h-4 w-4" />} color="text-destructive" />
                <SummaryCard label="已扣人數" value={totals.withheldCount} icon={<AlertCircle className="h-4 w-4" />} color="text-warning" isCount />
                <SummaryCard label="免扣人數" value={totals.exemptCount} icon={<ShieldCheck className="h-4 w-4" />} color="text-success" isCount />
            </div>

            {/* 匯出按鈕列 */}
            <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                <span className="text-sm text-muted-foreground self-center mr-2">匯出申報用：</span>
                <Button variant="outline" size="sm" onClick={handleExportTax} disabled={totals.totalTax === 0}>
                    <Download className="h-4 w-4 mr-1" />所得稅扣繳明細 CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportNhi} disabled={totals.totalNhi === 0}>
                    <Download className="h-4 w-4 mr-1" />二代健保申報明細 CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportFull}>
                    <Download className="h-4 w-4 mr-1" />完整代扣彙總 CSV
                </Button>
            </div>

            {/* 明細表 */}
            {summaries.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-secondary">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">匯款戶名</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">本名</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">狀態</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">給付總額</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">所得稅</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">二代健保</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">確認日期</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {summaries.map((person, i) => <PersonRow key={i} person={person} />)}
                        </tbody>
                        <tfoot className="bg-muted/30 font-medium">
                            <tr>
                                <td colSpan={3} className="px-3 py-2 text-right">合計</td>
                                <td className="px-3 py-2 text-right">NT$ {totals.totalPayment.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-destructive">NT$ {totals.totalTax.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-destructive">NT$ {totals.totalNhi.toLocaleString()}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="text-center py-6 text-muted-foreground">{selectedMonth} 沒有已確認的請款記錄</div>
            )}

            {/* 注意事項 */}
            <div className="text-xs text-muted-foreground bg-muted/20 rounded p-3 space-y-1">
                <p>* 匯出的 CSV 中「身分證字號/統一編號」欄位需由財會手動填入</p>
                <p>* 所得格式代號預設為 9A（執行業務報酬），二代健保所得類別預設為 50</p>
                <p>* 員工代墊繳納請使用「個人報帳 → 代扣代繳」，核准後自動記錄且不會重複建立進項</p>
            </div>
        </>
    )

    // alwaysExpanded 模式
    if (alwaysExpanded) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between bg-card p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-5 w-5 text-warning" />
                        {monthSummaryInfo}
                    </div>
                    {monthSelector}
                </div>
                {renderContent()}
            </div>
        )
    }

    return (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between cursor-pointer hover:bg-secondary/50 p-4 border-b bg-secondary/30"
                onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    <FileSpreadsheet className="h-5 w-5 text-warning" />
                    <div>
                        <div className="font-medium text-foreground">代扣代繳月報表</div>
                        {monthSummaryInfo}
                    </div>
                </div>
                {monthSelector}
            </div>
            {isExpanded && (
                <div className="p-4 space-y-4">{renderContent()}</div>
            )}
        </div>
    )
}
