// ─── 欄位鎖定判斷 ─────────────────────────────────────────────

interface DataLockFields {
  approved_at: string | null
  quotations?: { status: string | null } | null
  is_supplement?: boolean | null
}

/** 資料欄位鎖定（類別、KOL、執行內容、數量、單價） */
export function isDataLocked(item: DataLockFields): boolean {
  return !!item.approved_at || (item.quotations?.status === '已簽約' && !item.is_supplement)
}

interface PaymentLockFields {
  approved_at: string | null
}

/** 流程欄位鎖定（成本、檢核、發票、附件、請款、審核）— 僅已核准才鎖 */
export function isPaymentLocked(item: PaymentLockFields): boolean {
  return !!item.approved_at
}
