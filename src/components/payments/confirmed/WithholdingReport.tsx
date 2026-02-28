'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet, DollarSign, ShieldCheck, Download, AlertCircle, CheckCircle2, Clock, Plus } from 'lucide-react'
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
    type WithholdingPersonSummary
} from '@/lib/payments/withholding-export'

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

    // 取得所有可用月份（優先算出，用於決定 selectedMonth）
    const availableMonths = useMemo(() => {
        const months = new Set<string>()
        confirmations.forEach(c => {
            const m = c.confirmation_date.slice(0, 7)
            months.add(m)
        })
        return Array.from(months).sort().reverse()
    }, [confirmations])

    // 預設選擇最近有確認記錄的月份（而非當前月份，避免月份不匹配）
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const currentMonth = new Date().toISOString().slice(0, 7)
        const months = new Set<string>()
        confirmations.forEach(c => months.add(c.confirmation_date.slice(0, 7)))
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
        let totalPayment = 0
        let totalTax = 0
        let totalNhi = 0
        let withheldCount = 0
        let exemptCount = 0

        summaries.forEach(s => {
            totalPayment += s.totalPayment
            totalTax += s.incomeTaxWithheld
            totalNhi += s.nhiSupplement
            if (s.incomeTaxWithheld > 0 || s.nhiSupplement > 0) withheldCount++
            if (s.isExempt) exemptCount++
        })

        const taxSettled = settlements
            .filter(s => s.type === 'income_tax')
            .reduce((sum, s) => sum + s.amount, 0)
        const nhiSettled = settlements
            .filter(s => s.type === 'nhi_supplement')
            .reduce((sum, s) => sum + s.amount, 0)

        return {
            totalPayment, totalTax, totalNhi, withheldCount, exemptCount,
            taxSettled, nhiSettled,
            taxOutstanding: totalTax - taxSettled,
            nhiOutstanding: totalNhi - nhiSettled,
        }
    }, [summaries, settlements])

    // 匯出處理
    const handleExportNhi = () => {
        const csv = generateNhiDetailCsv(summaries, selectedMonth)
        downloadCsv(csv, `二代健保補充保費明細_${selectedMonth}.csv`)
        toast.success('二代健保申報明細已下載')
    }

    const handleExportTax = () => {
        const csv = generateTaxWithholdingCsv(summaries, selectedMonth)
        downloadCsv(csv, `所得稅扣繳明細_${selectedMonth}.csv`)
        toast.success('所得稅扣繳明細已下載')
    }

    const handleExportFull = () => {
        const csv = generateFullWithholdingCsv(summaries, selectedMonth)
        downloadCsv(csv, `代扣代繳彙總_${selectedMonth}.csv`)
        toast.success('代扣代繳彙總已下載')
    }

    // 標記已繳
    const handleSettle = async () => {
        if (!showSettleForm || !settleAmount) return
        const amount = parseInt(settleAmount)
        if (isNaN(amount) || amount <= 0) {
            toast.error('請輸入有效金額')
            return
        }

        try {
            await createSettlement.mutateAsync({
                month: selectedMonth,
                type: showSettleForm,
                amount,
                note: settleNote || undefined,
            })
            toast.success(`已記錄 ${selectedMonth} ${showSettleForm === 'income_tax' ? '所得稅' : '二代健保'} 繳納 NT$ ${amount.toLocaleString()}`)
            setShowSettleForm(null)
            setSettleAmount('')
            setSettleNote('')
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error)
            console.error('Settlement creation failed:', error)
            toast.error(`記錄繳納失敗：${msg}`)
        }
    }

    if (confirmations.length === 0) return null

    // 共用的展開內容渲染
    const renderContent = () => (
        <>
            {/* 繳納狀態卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SettlementCard
                    label="所得稅"
                    total={totals.totalTax}
                    settled={totals.taxSettled}
                    outstanding={totals.taxOutstanding}
                    onSettle={() => {
                        setShowSettleForm('income_tax')
                        setSettleAmount(String(totals.taxOutstanding > 0 ? totals.taxOutstanding : ''))
                    }}
                />
                <SettlementCard
                    label="二代健保"
                    total={totals.totalNhi}
                    settled={totals.nhiSettled}
                    outstanding={totals.nhiOutstanding}
                    onSettle={() => {
                        setShowSettleForm('nhi_supplement')
                        setSettleAmount(String(totals.nhiOutstanding > 0 ? totals.nhiOutstanding : ''))
                    }}
                />
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
                            <Input
                                type="number"
                                value={settleAmount}
                                onChange={e => setSettleAmount(e.target.value)}
                                className="w-40 h-8"
                                placeholder="金額"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs text-muted-foreground">備註</label>
                            <Input
                                value={settleNote}
                                onChange={e => setSettleNote(e.target.value)}
                                className="h-8"
                                placeholder="例：轉帳繳納、支票等"
                            />
                        </div>
                        <Button size="sm" onClick={handleSettle} disabled={createSettlement.isPending}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            確認繳納
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowSettleForm(null)}>
                            取消
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        * 員工代墊請使用「個人報帳」功能，選擇支出種類「代扣代繳」，核准後自動記錄
                    </p>
                </div>
            )}

            {/* 對帳明細 */}
            <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">對帳明細 — {selectedMonth}</div>

                {/* 對帳摘要表 */}
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border border-border rounded-lg overflow-hidden">
                        <thead className="bg-secondary">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">稅別</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">應繳金額</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">已繳金額</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">差額</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">狀態</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr className="hover:bg-muted/30">
                                <td className="px-3 py-2 font-medium">所得稅</td>
                                <td className="px-3 py-2 text-right">NT$ {totals.totalTax.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-success">NT$ {totals.taxSettled.toLocaleString()}</td>
                                <td className={`px-3 py-2 text-right font-medium ${totals.taxOutstanding > 0 ? 'text-warning' : totals.taxOutstanding < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    NT$ {totals.taxOutstanding.toLocaleString()}
                                    {totals.taxOutstanding < 0 && ' (溢繳)'}
                                </td>
                                <td className="px-3 py-2 text-center">
                                    {totals.totalTax === 0 ? (
                                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">無需繳納</span>
                                    ) : totals.taxOutstanding <= 0 ? (
                                        <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded">已結清</span>
                                    ) : (
                                        <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">待繳</span>
                                    )}
                                </td>
                            </tr>
                            <tr className="hover:bg-muted/30">
                                <td className="px-3 py-2 font-medium">二代健保</td>
                                <td className="px-3 py-2 text-right">NT$ {totals.totalNhi.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-success">NT$ {totals.nhiSettled.toLocaleString()}</td>
                                <td className={`px-3 py-2 text-right font-medium ${totals.nhiOutstanding > 0 ? 'text-warning' : totals.nhiOutstanding < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    NT$ {totals.nhiOutstanding.toLocaleString()}
                                    {totals.nhiOutstanding < 0 && ' (溢繳)'}
                                </td>
                                <td className="px-3 py-2 text-center">
                                    {totals.totalNhi === 0 ? (
                                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">無需繳納</span>
                                    ) : totals.nhiOutstanding <= 0 ? (
                                        <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded">已結清</span>
                                    ) : (
                                        <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">待繳</span>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                        <tfoot className="bg-muted/30 font-medium">
                            <tr>
                                <td className="px-3 py-2">合計</td>
                                <td className="px-3 py-2 text-right">NT$ {(totals.totalTax + totals.totalNhi).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-success">NT$ {(totals.taxSettled + totals.nhiSettled).toLocaleString()}</td>
                                <td className={`px-3 py-2 text-right ${(totals.taxOutstanding + totals.nhiOutstanding) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                                    NT$ {(totals.taxOutstanding + totals.nhiOutstanding).toLocaleString()}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* 繳納記錄明細 */}
                {settlements.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">繳納記錄（{settlements.length} 筆）</div>
                        <div className="space-y-1.5">
                            {settlements.map(s => (
                                <div key={s.id} className="flex items-center justify-between text-sm bg-muted/20 rounded-lg px-4 py-2.5 border border-border/50">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">
                                                    {s.type === 'income_tax' ? '所得稅' : '二代健保'}
                                                </span>
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                    s.settlement_method === 'company_direct'
                                                        ? 'bg-info/15 text-info'
                                                        : 'bg-warning/15 text-warning'
                                                }`}>
                                                    {s.settlement_method === 'company_direct' ? '公司直接繳' : '員工代墊'}
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                所屬月份：{s.month}
                                                {s.note && ` · ${s.note}`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-medium">NT$ {s.amount.toLocaleString()}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {s.settled_at ? new Date(s.settled_at).toLocaleDateString('zh-TW') : ''}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {settlements.length === 0 && (totals.totalTax > 0 || totals.totalNhi > 0) && (
                    <div className="text-center py-4 text-sm text-muted-foreground bg-muted/10 rounded-lg border border-dashed border-border">
                        {selectedMonth} 尚無繳納記錄。請使用上方「標記已繳」或透過「個人報帳 → 代扣代繳」提交。
                    </div>
                )}
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
                    <Download className="h-4 w-4 mr-1" />
                    所得稅扣繳明細 CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportNhi} disabled={totals.totalNhi === 0}>
                    <Download className="h-4 w-4 mr-1" />
                    二代健保申報明細 CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportFull}>
                    <Download className="h-4 w-4 mr-1" />
                    完整代扣彙總 CSV
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
                            {summaries.map((person, i) => (
                                <PersonRow key={i} person={person} />
                            ))}
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
                <div className="text-center py-6 text-muted-foreground">
                    {selectedMonth} 沒有已確認的請款記錄
                </div>
            )}

            {/* 注意事項 */}
            <div className="text-xs text-muted-foreground bg-muted/20 rounded p-3 space-y-1">
                <p>* 匯出的 CSV 中「身分證字號/統一編號」欄位需由財會手動填入</p>
                <p>* 所得格式代號預設為 9A（執行業務報酬），二代健保所得類別預設為 50</p>
                <p>* 員工代墊繳納請使用「個人報帳 → 代扣代繳」，核准後自動記錄且不會重複建立進項</p>
            </div>
        </>
    )

    // alwaysExpanded 模式：不渲染折疊外框，直接顯示內容
    if (alwaysExpanded) {
        return (
            <div className="space-y-4">
                {/* 月份選擇列 */}
                <div className="flex items-center justify-between bg-card p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-5 w-5 text-warning" />
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                            <span className="font-medium text-foreground">{selectedMonth}</span>
                            <span>所得稅: NT$ {totals.totalTax.toLocaleString()}</span>
                            <span>健保: NT$ {totals.totalNhi.toLocaleString()}</span>
                            {(totals.taxOutstanding > 0 || totals.nhiOutstanding > 0) && (
                                <span className="text-warning font-medium">
                                    待繳 NT$ {(totals.taxOutstanding + totals.nhiOutstanding).toLocaleString()}
                                </span>
                            )}
                            {totals.taxOutstanding <= 0 && totals.nhiOutstanding <= 0 && (totals.totalTax > 0 || totals.totalNhi > 0) && (
                                <span className="text-success font-medium">已全數繳納</span>
                            )}
                        </div>
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
                        <Button variant="outline" size="sm" onClick={handleExportFull} className="text-warning hover:text-warning/80">
                            <Download className="h-4 w-4 mr-1" />
                            彙總
                        </Button>
                    </div>
                </div>
                {renderContent()}
            </div>
        )
    }

    return (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
            {/* 標題列 */}
            <div
                className="flex items-center justify-between cursor-pointer hover:bg-secondary/50 p-4 border-b bg-secondary/30"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    {isExpanded ?
                        <ChevronDown className="h-5 w-5 text-muted-foreground" /> :
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    }
                    <FileSpreadsheet className="h-5 w-5 text-warning" />
                    <div>
                        <div className="font-medium text-foreground">代扣代繳月報表</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                            <span>{selectedMonth}</span>
                            <span>所得稅: NT$ {totals.totalTax.toLocaleString()}</span>
                            <span>健保: NT$ {totals.totalNhi.toLocaleString()}</span>
                            {(totals.taxOutstanding > 0 || totals.nhiOutstanding > 0) && (
                                <span className="text-warning font-medium">
                                    待繳 NT$ {(totals.taxOutstanding + totals.nhiOutstanding).toLocaleString()}
                                </span>
                            )}
                            {totals.taxOutstanding <= 0 && totals.nhiOutstanding <= 0 && (totals.totalTax > 0 || totals.totalNhi > 0) && (
                                <span className="text-success font-medium">已全數繳納</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* 月份選擇 + 快速匯出 */}
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="h-8 text-sm bg-secondary border border-border rounded px-2 text-foreground"
                    >
                        {availableMonths.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    <Button variant="outline" size="sm" onClick={handleExportFull} className="text-warning hover:text-warning/80">
                        <Download className="h-4 w-4 mr-1" />
                        彙總
                    </Button>
                </div>
            </div>

            {/* 展開內容 */}
            {isExpanded && (
                <div className="p-4 space-y-4">
                    {renderContent()}
                </div>
            )}
        </div>
    )
}

// ==================== 子元件 ====================

function SettlementCard({ label, total, settled, outstanding, onSettle }: {
    label: string
    total: number
    settled: number
    outstanding: number
    onSettle: () => void
}) {
    const isFullySettled = total > 0 && outstanding <= 0
    const hasOutstanding = outstanding > 0

    return (
        <div className={`rounded-lg p-4 border ${isFullySettled ? 'bg-success/5 border-success/25' : hasOutstanding ? 'bg-warning/5 border-warning/25' : 'bg-secondary/50 border-border'}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-medium text-sm">
                    {isFullySettled ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : hasOutstanding ? (
                        <Clock className="h-4 w-4 text-warning" />
                    ) : (
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    )}
                    {label}
                </div>
                {hasOutstanding && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSettle}>
                        <Plus className="h-3 w-3 mr-1" />
                        標記已繳
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                    <div className="text-xs text-muted-foreground">應繳</div>
                    <div className="font-bold">NT$ {total.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground">已繳</div>
                    <div className="font-bold text-success">NT$ {settled.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground">待繳</div>
                    <div className={`font-bold ${hasOutstanding ? 'text-warning' : 'text-muted-foreground'}`}>
                        NT$ {Math.max(0, outstanding).toLocaleString()}
                    </div>
                </div>
            </div>
        </div>
    )
}

function SummaryCard({ label, value, icon, color, isCount }: {
    label: string
    value: number
    icon: React.ReactNode
    color: string
    isCount?: boolean
}) {
    return (
        <div className="bg-secondary/50 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                {icon}
                {label}
            </div>
            <div className={`text-lg font-bold ${color}`}>
                {isCount ? value : `NT$ ${value.toLocaleString()}`}
            </div>
        </div>
    )
}

function PersonRow({ person }: { person: WithholdingPersonSummary }) {
    const statusBadge = () => {
        if (person.isCompanyAccount) {
            return <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded">公司戶免扣</span>
        }
        if (person.isExempt) {
            return <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">免扣（公會）</span>
        }
        if (person.incomeTaxWithheld > 0 || person.nhiSupplement > 0) {
            return <span className="text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded">已扣</span>
        }
        return <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">未達門檻</span>
    }

    return (
        <tr className="hover:bg-muted/30">
            <td className="px-3 py-2 font-medium">{person.remittanceName}</td>
            <td className="px-3 py-2 text-muted-foreground">{person.realName || '-'}</td>
            <td className="px-3 py-2 text-center">{statusBadge()}</td>
            <td className="px-3 py-2 text-right">NT$ {person.totalPayment.toLocaleString()}</td>
            <td className="px-3 py-2 text-right text-destructive">
                {person.incomeTaxWithheld > 0 ? `NT$ ${person.incomeTaxWithheld.toLocaleString()}` : '-'}
            </td>
            <td className="px-3 py-2 text-right text-destructive">
                {person.nhiSupplement > 0 ? `NT$ ${person.nhiSupplement.toLocaleString()}` : '-'}
            </td>
            <td className="px-3 py-2 text-muted-foreground text-xs">{person.confirmationDates.join(', ')}</td>
        </tr>
    )
}
