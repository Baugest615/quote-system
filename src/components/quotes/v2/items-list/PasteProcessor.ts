import { Database } from '@/types/database.types'

type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type Kol = Database['public']['Tables']['kols']['Row']

interface KolMatch {
  id: string
  name: string
  real_name: string | null
}

/**
 * 解析 Excel 貼上的文字，轉換為 QuotationItem 陣列。
 * 格式：類別 | KOL/服務 | 執行內容 | 數量 | 單價 | 成本（Tab 分隔）
 */
export function parsePasteData(
  text: string,
  quotationId: string,
  kols: KolMatch[],
  isSupplementMode: boolean
): QuotationItem[] {
  const rows = text.split(/\r?\n/).filter(row => row.trim() !== '')
  if (rows.length === 0) return []

  return rows.map(row => {
    const cols = row.split('\t')

    const category = cols[0]?.trim() || null
    const kolName = cols[1]?.trim() || null
    const service = cols[2]?.trim() || ''
    const quantity = Number(cols[3]?.trim()) || 1
    const price = Number(cols[4]?.replace(/,/g, '').trim()) || 0
    const cost = Number(cols[5]?.replace(/,/g, '').trim()) || 0

    let kolId = null
    if (kolName) {
      const foundKol = kols.find((k: KolMatch) => k.name === kolName || k.real_name === kolName)
      if (foundKol) kolId = foundKol.id
    }

    return {
      id: crypto.randomUUID(),
      quotation_id: quotationId,
      category,
      kol_id: kolId,
      service,
      quantity,
      price,
      cost,
      created_at: new Date().toISOString(),
      created_by: null,
      remark: null,
      remittance_name: null,
      is_supplement: isSupplementMode,
      accounting_subject: null,
      approved_at: null,
      approved_by: null,
      attachments: '[]',
      cost_amount: null,
      expected_payment_month: null,
      expense_type: null,
      invoice_number: null,
      is_merge_leader: null,
      merge_color: null,
      merge_group_id: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      requested_at: null,
      requested_by: null,
    }
  })
}

/**
 * 判斷剪貼簿內容是否為結構化資料（多行或 Tab 分隔）
 */
export function isStructuredPaste(text: string): boolean {
  return text.includes('\n') || text.includes('\r') || text.includes('\t')
}
