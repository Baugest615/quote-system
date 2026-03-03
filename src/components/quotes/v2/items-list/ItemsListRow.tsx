'use client'

import { memo } from 'react'
import { Database } from '@/types/database.types'
import { QuotationItemWithPayments } from '@/types/custom.types'
import { Button } from '@/components/ui/button'
import { EditableCell } from '../EditableCell'
import { SearchableSelectCell } from '../SearchableSelectCell'
import { Trash2, Lock, CheckCircle2, AlertTriangle, Link2 } from 'lucide-react'
import { PAYMENT_STATUS_CONFIG, getPaymentStatus, isVerificationPassed } from '../shared/payment-status'

type QuotationItem = Database['public']['Tables']['quotation_items']['Row']

interface ItemsListRowProps {
  item: QuotationItemWithPayments
  isLocked: boolean
  isApproved: boolean
  canDelete: boolean
  isOriginalInSupplement: boolean
  isItemLoading: boolean
  readOnly: boolean
  onUpdateItem: (id: string, updates: Partial<QuotationItem>) => void
  onKolChange: (id: string, value: string) => void
  onServiceChange: (id: string, value: string, data?: { price: number; cost: number }) => void
  onDeleteItem: (id: string) => void
  onOpenVerification: (item: QuotationItemWithPayments) => void
  categoryOptions: { label: string; value: string }[]
  kolOptions: { label: string; value: string; subLabel?: string }[]
  serviceOptions: { label: string; value: string; data?: { price: number; cost: number } }[]
  selectedKolName: string | undefined
}

export const ItemsListRow = memo(function ItemsListRow({
  item, isLocked, isApproved, canDelete, isOriginalInSupplement, isItemLoading, readOnly,
  onUpdateItem, onKolChange, onServiceChange, onDeleteItem, onOpenVerification,
  categoryOptions, kolOptions, serviceOptions, selectedKolName,
}: ItemsListRowProps) {
  const status = getPaymentStatus(item)
  const statusConfig = PAYMENT_STATUS_CONFIG[status]
  const verified = isVerificationPassed(item)

  return (
    <tr className={`hover:bg-accent/30 group ${
      isOriginalInSupplement ? 'bg-muted/30 opacity-70' :
      item.is_supplement ? 'border-l-4 border-l-success' :
      isLocked ? 'opacity-80' : ''
    }`}>
      {/* 類別 */}
      <td className="border-r border-border/50 p-0">
        {isLocked ? (
          <div className="px-3 py-2 text-muted-foreground flex items-center gap-1.5">
            {isOriginalInSupplement && <Lock className="h-3 w-3 text-muted-foreground/50" />}
            {item.category || '—'}
            {item.is_supplement && (
              <span className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded">追加</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <SearchableSelectCell
              value={item.category}
              onChange={(val) => onUpdateItem(item.id, { category: val })}
              options={categoryOptions}
              placeholder="選擇類別"
              className="px-3 py-2 flex-1"
              allowCustomValue={true}
            />
            {item.is_supplement && (
              <span className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded mr-1 shrink-0">追加</span>
            )}
          </div>
        )}
      </td>

      {/* KOL/服務 */}
      <td className="border-r border-border/50 p-0">
        {isLocked ? (
          <div className="px-3 py-2 font-medium text-primary">{selectedKolName || '—'}</div>
        ) : (
          <SearchableSelectCell
            value={item.kol_id}
            displayValue={selectedKolName || item.kol_id || undefined}
            onChange={(val) => onKolChange(item.id, val)}
            options={kolOptions}
            placeholder="搜尋 KOL/服務"
            className="px-3 py-2 font-medium text-primary"
            allowCustomValue={true}
          />
        )}
      </td>

      {/* 執行內容 */}
      <td className="border-r border-border/50 p-0">
        {isLocked ? (
          <div className="px-3 py-2">{item.service || '—'}</div>
        ) : (
          <SearchableSelectCell
            value={item.service}
            onChange={(val, data) => onServiceChange(item.id, val, data as { price: number; cost: number } | undefined)}
            options={serviceOptions}
            placeholder={item.kol_id ? "選擇執行內容" : "請先選 KOL/服務"}
            className="px-3 py-2"
            allowCustomValue={true}
          />
        )}
      </td>

      {/* 數量 */}
      <td className="border-r border-border/50 p-0">
        {isLocked ? (
          <div className="px-3 py-2 text-right">{item.quantity}</div>
        ) : (
          <EditableCell value={item.quantity} type="number" onChange={(val) => onUpdateItem(item.id, { quantity: Number(val) })} className="px-3 py-2 text-right" />
        )}
      </td>

      {/* 單價 */}
      <td className="border-r border-border/50 p-0">
        {isLocked ? (
          <div className="px-3 py-2 text-right">{item.price.toLocaleString()}</div>
        ) : (
          <EditableCell value={item.price} type="number" onChange={(val) => onUpdateItem(item.id, { price: Number(val) })} className="px-3 py-2 text-right" />
        )}
      </td>

      {/* 成本 */}
      <td className="border-r border-border/50 p-0">
        {isApproved ? (
          <div className="px-3 py-2 text-right text-muted-foreground">{(item.cost ?? 0).toLocaleString()}</div>
        ) : (
          <EditableCell value={item.cost} type="number" onChange={(val) => onUpdateItem(item.id, { cost: Number(val) })} className="px-3 py-2 text-right text-muted-foreground" />
        )}
      </td>

      {/* 小計 */}
      <td className="px-3 py-2 text-right font-medium text-foreground/70">
        {((item.quantity ?? 0) * item.price).toLocaleString()}
      </td>

      {/* 狀態 + 合併標記 */}
      <td className="px-2 py-2 text-center border-l-2 border-border">
        <div className="flex items-center justify-center gap-1">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusConfig.className}`}>
            {statusConfig.label}
          </span>
          {item.merge_group_id && (
            <a
              href="/dashboard/payment-workbench"
              className="inline-flex items-center gap-0.5 text-[10px] text-info hover:text-info/80 transition-colors"
              title="已加入合併組 — 點擊前往請款工作台"
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.merge_color || 'var(--info)' }} />
              <Link2 className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>

      {/* 檢核 */}
      <td className="px-2 py-2 text-center">
        {isApproved ? (
          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
        ) : (
          <button
            onClick={() => onOpenVerification(item)}
            className="p-1 rounded hover:bg-accent transition-colors mx-auto flex items-center justify-center"
            title={verified ? `發票: ${item.invoice_number || '附件已上傳'}` : '點擊檢核文件'}
          >
            {verified ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
          </button>
        )}
      </td>

      {/* 刪除 */}
      {!readOnly && (
        <td className="px-1 py-1 text-center">
          {isOriginalInSupplement ? (
            <span className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground/30" title="原始項目已鎖定">
              <Lock className="h-3 w-3" />
            </span>
          ) : (
            <Button
              variant="ghost" size="sm"
              className={`h-6 w-6 p-0 ${!canDelete ? 'text-muted-foreground cursor-not-allowed' : 'opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive'}`}
              onClick={() => onDeleteItem(item.id)}
              disabled={!canDelete}
              title={!canDelete ? '此項目已進入請款流程，無法刪除' : '刪除項目'}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </td>
      )}
    </tr>
  )
})
