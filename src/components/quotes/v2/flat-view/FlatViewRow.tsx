'use client'

import { memo } from 'react'
import type { FlatQuotationItem } from '@/hooks/useQuotationItemsFlat'
import type { PaymentAttachment } from '@/lib/payments/types'
import { EditableCell } from '../EditableCell'
import { SearchableSelectCell } from '../SearchableSelectCell'
import { cn } from '@/lib/utils'
import { Paperclip, Lock } from 'lucide-react'
import { INVOICE_REGEX } from '../shared/payment-status'
import { isDataLocked } from '../shared/quotation-item-utils'
import {
  type ColumnKey, STICKY_LEFT, STICKY_COLS,
} from './flat-view-constants'

// ─── Sticky cell helpers ──────────────────────────────────
const stickyTdClass = (col: ColumnKey, selected: boolean) => {
  if (!STICKY_COLS.has(col)) return ''
  return cn('sticky z-20', selected ? 'bg-primary/5' : 'bg-card', 'group-hover:!bg-accent/30')
}
const stickyTdStyle = (col: ColumnKey): React.CSSProperties | undefined => {
  if (!STICKY_COLS.has(col)) return undefined
  return { left: STICKY_LEFT[col as keyof typeof STICKY_LEFT] }
}

// ─── Props ────────────────────────────────────────────────

interface FlatViewRowProps {
  item: FlatQuotationItem
  selected: boolean
  isColVisible: (key: ColumnKey) => boolean
  onToggleSelect: (id: string) => void
  onUpdateField: (id: string, field: string, value: unknown) => void
  onKolChange: (item: FlatQuotationItem, value: string) => void
  onServiceChange: (item: FlatQuotationItem, value: string) => void
  onOpenAttachment: (item: FlatQuotationItem) => void
  categoryOptions: { label: string; value: string }[]
  kolOptions: { label: string; value: string; subLabel?: string }[]
  getServiceOptionsForKol: (kolId: string | null) => { label: string; value: string }[]
}

export const FlatViewRow = memo(function FlatViewRow({
  item, selected, isColVisible,
  onToggleSelect, onUpdateField, onKolChange, onServiceChange,
  onOpenAttachment,
  categoryOptions, kolOptions, getServiceOptionsForKol,
}: FlatViewRowProps) {
  const locked = isDataLocked(item)
  const attachments = (item.attachments || []) as unknown as PaymentAttachment[]
  const subtotal = (item.quantity || 0) * (Number(item.price) || 0)

  return (
    <tr
      className={cn(
        'group border-b hover:bg-accent/30 transition-colors text-sm',
        selected && 'bg-primary/5',
        locked && 'opacity-70'
      )}
    >
      {/* ── Checkbox ── */}
      {isColVisible('checkbox') && (
        <td className={cn('w-10 p-2 text-center', stickyTdClass('checkbox', selected))} style={stickyTdStyle('checkbox')}>
          {locked ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
          ) : (
            <input type="checkbox" checked={selected} onChange={() => onToggleSelect(item.id)} className="rounded" />
          )}
        </td>
      )}

      {/* ── 報價編號 ── */}
      {isColVisible('quote_number') && (
        <td className={cn('w-24 p-2 font-mono text-xs text-muted-foreground', stickyTdClass('quote_number', selected))} style={stickyTdStyle('quote_number')}>
          {item.quotations?.quote_number || '—'}
        </td>
      )}

      {/* ── 專案名稱 ── */}
      {isColVisible('project_name') && (
        <td className={cn('w-44 p-2 text-xs truncate', stickyTdClass('project_name', selected))} style={stickyTdStyle('project_name')} title={item.quotations?.project_name || ''}>
          {item.quotations?.project_name || '—'}
        </td>
      )}

      {/* ── 客戶 ── */}
      {isColVisible('client_name') && (
        <td className="w-32 p-2 text-xs truncate">{item.quotations?.clients?.name || '—'}</td>
      )}

      {/* ── 報價狀態 ── */}
      {isColVisible('quotation_status') && (
        <td className="w-20 p-2">
          <span className={cn('text-xs px-1.5 py-0.5 rounded-full', {
            'bg-secondary/50 text-foreground': item.quotations?.status === '草稿',
            'bg-warning/15 text-warning': item.quotations?.status === '待簽約',
            'bg-success/15 text-success': item.quotations?.status === '已簽約',
            'bg-info/15 text-info': item.quotations?.status === '已歸檔',
          })}>
            {item.quotations?.status || '—'}
          </span>
        </td>
      )}

      {/* ── 類別 ── */}
      {isColVisible('category') && (
        <td className="w-24 p-1">
          {locked ? (
            <span className="text-xs px-2">{item.category || '—'}</span>
          ) : (
            <SearchableSelectCell
              value={item.category}
              options={categoryOptions}
              onChange={(val) => onUpdateField(item.id, 'category', val)}
              placeholder="類別"
              allowCustomValue
            />
          )}
        </td>
      )}

      {/* ── KOL/服務 ── */}
      {isColVisible('kol_name') && (
        <td className="w-32 p-1">
          {locked ? (
            <span className="text-xs px-2">{item.kols?.name || '—'}</span>
          ) : (
            <SearchableSelectCell
              value={item.kol_id}
              displayValue={item.kols?.name || undefined}
              options={kolOptions}
              onChange={(val) => onKolChange(item, val)}
              placeholder="KOL"
              allowCustomValue
            />
          )}
        </td>
      )}

      {/* ── 執行內容 ── */}
      {isColVisible('service') && (
        <td className="w-36 p-1">
          {locked ? (
            <span className="text-xs px-2">{item.service || '—'}</span>
          ) : (
            <SearchableSelectCell
              value={item.service}
              options={getServiceOptionsForKol(item.kol_id)}
              onChange={(val) => onServiceChange(item, val)}
              placeholder="服務"
              allowCustomValue
            />
          )}
        </td>
      )}

      {/* ── 數量 ── */}
      {isColVisible('quantity') && (
        <td className="w-16 p-1 text-right">
          {locked ? (
            <span className="text-xs font-mono px-2">{item.quantity}</span>
          ) : (
            <EditableCell value={item.quantity} type="number" onChange={(val) => onUpdateField(item.id, 'quantity', Number(val))} className="text-right text-xs" />
          )}
        </td>
      )}

      {/* ── 單價 ── */}
      {isColVisible('price') && (
        <td className="w-24 p-1 text-right">
          {locked ? (
            <span className="text-xs font-mono px-2">{Number(item.price).toLocaleString()}</span>
          ) : (
            <EditableCell value={item.price} type="number" onChange={(val) => onUpdateField(item.id, 'price', Number(val))} className="text-right text-xs" />
          )}
        </td>
      )}

      {/* ── 成本 ── */}
      {isColVisible('cost') && (
        <td className="w-24 p-1 text-right">
          {locked ? (
            <span className="text-xs font-mono px-2">{Number(item.cost).toLocaleString()}</span>
          ) : (
            <EditableCell value={item.cost} type="number" onChange={(val) => onUpdateField(item.id, 'cost', Number(val))} className="text-right text-xs" />
          )}
        </td>
      )}

      {/* ── 小計 ── */}
      {isColVisible('subtotal') && (
        <td className="w-24 p-2 text-right font-mono text-xs text-foreground/70">{subtotal.toLocaleString()}</td>
      )}

      {/* ── 發票號碼 ── */}
      {isColVisible('invoice_number') && (
        <td className="w-28 p-1">
          <EditableCell
            value={item.invoice_number || ''}
            onChange={(val) => {
              const v = String(val).trim()
              if (v && !INVOICE_REGEX.test(v)) {
                return
              }
              onUpdateField(item.id, 'invoice_number', v || null)
            }}
            className="text-xs font-mono"
            placeholder="XX-12345678"
          />
        </td>
      )}

      {/* ── 附件 ── */}
      {isColVisible('attachments') && (
        <td className="w-16 p-2 text-center">
          <button
            onClick={() => onOpenAttachment(item)}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors',
              attachments.length > 0
                ? 'text-success hover:bg-success/10'
                : 'text-muted-foreground hover:bg-muted'
            )}
            title={attachments.length > 0 ? `${attachments.length} 個附件` : '上傳附件'}
            aria-label={attachments.length > 0 ? `${attachments.length} 個附件` : '上傳附件'}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {attachments.length > 0 && <span>{attachments.length}</span>}
          </button>
        </td>
      )}
    </tr>
  )
})
