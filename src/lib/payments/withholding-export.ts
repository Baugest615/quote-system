// 代扣代繳匯出工具函數
// 產生所得稅扣繳明細 + 二代健保補充保費申報 CSV

import type { PaymentConfirmation, RemittanceSettings } from './types'
import { groupItemsByRemittance } from './grouping'
import { getItemBillingMonth } from './aggregation'
import type { WithholdingSettings } from '@/types/custom.types'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'

// ==================== 型別定義 ====================

export interface WithholdingPersonSummary {
    remittanceName: string
    kolName: string
    realName: string
    isCompanyAccount: boolean
    isExempt: boolean
    totalPayment: number
    incomeTaxWithheld: number
    nhiSupplement: number
    confirmationDates: string[]
}

// ==================== 月彙總計算 ====================

/**
 * 計算指定月份的代扣代繳彙總（按匯款戶名歸戶）
 */
export function computeMonthlyWithholding(
    confirmations: PaymentConfirmation[],
    month: string, // YYYY-MM
    rates: WithholdingSettings | null | undefined
): WithholdingPersonSummary[] {
    const taxRate = rates?.income_tax_rate ?? DEFAULT_WITHHOLDING.income_tax_rate
    const nhiRate = rates?.nhi_supplement_rate ?? DEFAULT_WITHHOLDING.nhi_supplement_rate
    const taxThreshold = rates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold
    const nhiThreshold = rates?.nhi_threshold ?? DEFAULT_WITHHOLDING.nhi_threshold

    const personMap = new Map<string, WithholdingPersonSummary>()

    // 混合模式：遍歷所有 confirmation，只取帳務月份 === month 的 items
    const monthConfirmations = confirmations

    // 第一階段：收集所有群組資料，按匯款戶名歸戶，記錄每筆的 paymentDate + subtotal
    type GroupEntry = {
        subtotal: number
        paymentDate: string  // 實際匯款日期，或 fallback 到確認日期
        confirmationDate: string
        isExempt: boolean
        isCompanyAccount: boolean
        isWithholdingExempt: boolean
        isPersonalClaim: boolean
        hasSavedSettings: boolean
        savedHasTax: boolean
        savedHasInsurance: boolean
        kolName: string
        realName: string
    }
    const groupEntries = new Map<string, GroupEntry[]>()

    monthConfirmations.forEach(confirmation => {
        // 只取該月份的 items
        const monthItems = (confirmation.payment_confirmation_items || []).filter(
            item => getItemBillingMonth(item, confirmation.confirmation_date) === month
        )
        if (monthItems.length === 0) return

        const groups = groupItemsByRemittance(monthItems)
        const savedSettings: RemittanceSettings = confirmation.remittance_settings || {}

        groups.forEach(group => {
            // 跳過個人報帳群組（非勞務報酬，不適用代扣代繳）
            const isPersonalClaim = group.items.every(
                item => item.source_type === 'personal' || item.expense_claim_id
            )
            if (isPersonalClaim) return

            const settings = savedSettings[group.remittanceName]
            const firstItem = group.items[0]
            const kol = firstItem?.payment_requests?.quotation_items?.kols
                || firstItem?.quotation_items?.kols

            const key = group.remittanceName
            if (!groupEntries.has(key)) groupEntries.set(key, [])
            groupEntries.get(key)!.push({
                subtotal: group.totalAmount,
                paymentDate: settings?.paymentDate || confirmation.confirmation_date,
                confirmationDate: confirmation.confirmation_date,
                isExempt: group.isCompanyAccount || group.isWithholdingExempt,
                isCompanyAccount: group.isCompanyAccount,
                isWithholdingExempt: group.isWithholdingExempt,
                isPersonalClaim: false,
                hasSavedSettings: !!settings,
                savedHasTax: settings?.hasTax ?? false,
                savedHasInsurance: settings?.hasInsurance ?? false,
                kolName: kol?.name || group.remittanceName,
                realName: kol?.real_name || '',
            })
        })
    })

    // 第二階段：按匯款戶名計算代扣，分日判斷門檻
    Array.from(groupEntries.entries()).forEach(([key, entries]: [string, GroupEntry[]]) => {
        const first = entries[0]!
        if (!personMap.has(key)) {
            personMap.set(key, {
                remittanceName: key,
                kolName: first.kolName,
                realName: first.realName,
                isCompanyAccount: first.isCompanyAccount,
                isExempt: first.isExempt,
                totalPayment: 0,
                incomeTaxWithheld: 0,
                nhiSupplement: 0,
                confirmationDates: []
            })
        }

        const person = personMap.get(key)!
        const totalPayment = entries.reduce((sum: number, e: GroupEntry) => sum + e.subtotal, 0)
        person.totalPayment += totalPayment

        // 收集確認日期
        entries.forEach((e: GroupEntry) => {
            if (!person.confirmationDates.includes(e.confirmationDate)) {
                person.confirmationDates.push(e.confirmationDate)
            }
        })

        // 若有手動設定，以手動設定為準
        const hasManualSettings = entries.some((e: GroupEntry) => e.hasSavedSettings)
        if (hasManualSettings) {
            const hasTax = entries.some((e: GroupEntry) => e.savedHasTax)
            const hasInsurance = entries.some((e: GroupEntry) => e.savedHasInsurance)
            person.incomeTaxWithheld += hasTax ? Math.floor(totalPayment * taxRate) : 0
            person.nhiSupplement += hasInsurance ? Math.floor(totalPayment * nhiRate) : 0
        } else if (first.isExempt) {
            // 免扣：不計算
        } else {
            // 自動判斷：按 paymentDate 分組，各自獨立判斷門檻
            const byDate = new Map<string, number>()
            entries.forEach((e: GroupEntry) => {
                byDate.set(e.paymentDate, (byDate.get(e.paymentDate) || 0) + e.subtotal)
            })
            Array.from(byDate.values()).forEach(dateTotal => {
                if (dateTotal >= taxThreshold) person.incomeTaxWithheld += Math.floor(dateTotal * taxRate)
                if (dateTotal >= nhiThreshold) person.nhiSupplement += Math.floor(dateTotal * nhiRate)
            })
        }
    })

    return Array.from(personMap.values()).sort((a, b) => b.totalPayment - a.totalPayment)
}

// ==================== 西元轉民國 ====================

/**
 * 將 YYYY-MM 轉為民國年月 YYYMM（如 2026-01 → 11501）
 */
function toRocYearMonth(month: string): string {
    const [year, mm] = month.split('-')
    const rocYear = parseInt(year) - 1911
    return `${rocYear}${mm}`
}

// ==================== 二代健保補充保費明細 CSV ====================

/**
 * 產生二代健保補充保費申報明細 CSV
 * 格式：投保單位代號(待填), 給付年月(民國YYYMM), 所得類別, 保險對象姓名, 身分證字號(待填), 給付金額, 扣費金額
 */
export function generateNhiDetailCsv(
    summaries: WithholdingPersonSummary[],
    month: string
): string {
    const rocMonth = toRocYearMonth(month)
    const rows: string[][] = [
        ['投保單位代號(待填)', '給付年月', '所得類別', '保險對象姓名', '身分證字號(待填)', '給付金額', '扣費金額']
    ]

    summaries.forEach(person => {
        if (person.nhiSupplement > 0) {
            rows.push([
                '',                    // 投保單位代號 — 待財會填入
                rocMonth,              // 民國年月
                '50',                  // 所得類別：50=薪資所得（執行業務另議）
                person.realName || person.remittanceName,
                '',                    // 身分證字號 — 待財會填入
                person.totalPayment.toString(),
                person.nhiSupplement.toString()
            ])
        }
    })

    return rows.map(r => r.join(',')).join('\n')
}

// ==================== 所得稅扣繳明細 CSV ====================

/**
 * 產生各類所得扣繳稅額明細 CSV
 * 格式：所得格式代號, 給付年月, 受款人姓名, 統一編號(待填), 給付總額, 扣繳稅額
 */
export function generateTaxWithholdingCsv(
    summaries: WithholdingPersonSummary[],
    month: string
): string {
    const rocMonth = toRocYearMonth(month)
    const rows: string[][] = [
        ['所得格式代號', '給付年月', '匯款戶名', '本名', '統一編號(待填)', '給付總額', '扣繳稅額']
    ]

    summaries.forEach(person => {
        if (person.incomeTaxWithheld > 0) {
            rows.push([
                '9A',                  // 執行業務報酬
                rocMonth,
                person.remittanceName,
                person.realName || '',
                '',                    // 統一編號 — 待財會填入
                person.totalPayment.toString(),
                person.incomeTaxWithheld.toString()
            ])
        }
    })

    return rows.map(r => r.join(',')).join('\n')
}

// ==================== 綜合代扣明細 CSV ====================

/**
 * 產生完整代扣明細 CSV（含所有匯款戶名、已扣/未扣/免扣狀態）
 */
export function generateFullWithholdingCsv(
    summaries: WithholdingPersonSummary[],
    month: string
): string {
    const rows: string[][] = [
        ['月份', '匯款戶名', '本名', '帳戶類型', '免扣狀態', '給付總額', '所得稅扣繳', '二代健保扣繳', '確認日期']
    ]

    summaries.forEach(person => {
        rows.push([
            month,
            person.remittanceName,
            person.realName || '',
            person.isCompanyAccount ? '公司戶' : '個人戶',
            person.isExempt ? '免扣' : (person.incomeTaxWithheld > 0 || person.nhiSupplement > 0 ? '已扣' : '未達門檻'),
            person.totalPayment.toString(),
            person.incomeTaxWithheld.toString(),
            person.nhiSupplement.toString(),
            person.confirmationDates.join('; ')
        ])
    })

    return rows.map(r => r.join(',')).join('\n')
}

// ==================== 下載 CSV 工具 ====================

export function downloadCsv(csvContent: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}
