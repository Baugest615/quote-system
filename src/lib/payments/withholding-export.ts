// 代扣代繳匯出工具函數
// 產生所得稅扣繳明細 + 二代健保補充保費申報 CSV

import type { PaymentConfirmation, RemittanceSettings } from './types'
import { groupItemsByRemittance } from './grouping'
import type { WithholdingSettings } from '@/types/custom.types'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'
import { getBillingMonthKey } from './billingPeriod'

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

    // 篩選指定帳務月份的確認清單（使用 10 日切點規則）
    const monthConfirmations = confirmations.filter(c =>
        getBillingMonthKey(c.confirmation_date) === month
    )

    monthConfirmations.forEach(confirmation => {
        const groups = groupItemsByRemittance(confirmation.payment_confirmation_items)
        const savedSettings: RemittanceSettings = confirmation.remittance_settings || {}

        groups.forEach(group => {
            // 跳過個人報帳群組（非勞務報酬，不適用代扣代繳）
            const isPersonalClaim = group.items.every(
                item => item.source_type === 'personal' || item.expense_claim_id
            )
            if (isPersonalClaim) return

            const isExempt = group.isCompanyAccount || group.isWithholdingExempt
            const subtotal = group.totalAmount

            // 從 DB 讀取已儲存的設定；若無則根據門檻自動判斷
            const settings = savedSettings[group.remittanceName] || {
                hasRemittanceFee: false,
                remittanceFeeAmount: 30,
                hasTax: !isExempt && subtotal >= taxThreshold,
                hasInsurance: !isExempt && subtotal >= nhiThreshold,
            }

            const tax = settings.hasTax ? Math.floor(subtotal * taxRate) : 0
            const nhi = settings.hasInsurance ? Math.floor(subtotal * nhiRate) : 0

            const key = group.remittanceName
            if (!personMap.has(key)) {
                // 從第一筆項目取得 KOL 資訊
                const firstItem = group.items[0]
                const kol = firstItem?.payment_requests?.quotation_items?.kols

                personMap.set(key, {
                    remittanceName: group.remittanceName,
                    kolName: kol?.name || group.remittanceName,
                    realName: kol?.real_name || '',
                    isCompanyAccount: group.isCompanyAccount,
                    isExempt: group.isCompanyAccount || group.isWithholdingExempt,
                    totalPayment: 0,
                    incomeTaxWithheld: 0,
                    nhiSupplement: 0,
                    confirmationDates: []
                })
            }

            const person = personMap.get(key)!
            person.totalPayment += subtotal
            person.incomeTaxWithheld += tax
            person.nhiSupplement += nhi
            if (!person.confirmationDates.includes(confirmation.confirmation_date)) {
                person.confirmationDates.push(confirmation.confirmation_date)
            }
        })
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
