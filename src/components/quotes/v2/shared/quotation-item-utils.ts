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

