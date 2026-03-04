/**
 * 營業稅計算工具
 * - 公司行號（bankType === 'company'）需加 5% 營業稅
 * - 個人（bankType === 'individual' 或其他）不加稅
 */

export const TAX_RATE = 0.05

/**
 * 計算請款金額（含稅）
 * @param cost 未稅成本
 * @param bankType KOL 的銀行帳戶類型
 * @returns 實際請款金額（公司行號含稅，個人不變）
 */
export function calculatePaymentAmount(cost: number, bankType: string | undefined | null): number {
  if (bankType === 'company') {
    return Math.round(cost * (1 + TAX_RATE))
  }
  return cost
}

/**
 * 反算未稅成本（從含稅金額）
 * @param amount 含稅金額
 * @returns 未稅成本（四捨五入到整數）
 */
export function removeBusinessTax(amount: number): number {
  return Math.round(amount / (1 + TAX_RATE))
}
