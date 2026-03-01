'use client'

import { useState, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, Receipt,
  CheckCircle2, Loader2, Pencil, Trash2,
} from 'lucide-react'
import type { ExpenseClaim } from '@/types/custom.types'

type ExpenseClaimWithQuotation = ExpenseClaim & { quotations?: { quote_number: string | null } | null }
import {
  CLAIM_STATUS_LABELS, CLAIM_STATUS_COLORS,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
} from '@/types/custom.types'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/EmptyState'

// ==================== Types ====================

interface ClaimGroup {
  key: string
  date: string           // YYYY-MM-DD
  displayDate: string    // "2月28日"
  submitterName?: string
  claims: ExpenseClaimWithQuotation[]
  totalAmount: number
  draftCount: number
  submittedCount: number
  approvedCount: number
}

interface ExpenseClaimGroupsProps {
  claims: ExpenseClaimWithQuotation[]
  isEditor: boolean
  nameMap: Map<string, string>
  onEdit: (claim: ExpenseClaimWithQuotation) => void
  onDelete: (id: string) => void
  onSubmit: (ids: string[]) => void
  onApprove: (claimId: string) => void
  onReject: (claimId: string, reason: string) => void
  actionLoading?: Set<string>
}

// ==================== Helpers ====================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function groupClaims(
  claims: ExpenseClaimWithQuotation[],
  isEditor: boolean,
  nameMap: Map<string, string>
): ClaimGroup[] {
  const groups = new Map<string, ClaimGroup>()

  for (const claim of claims) {
    const dateStr = (claim.created_at || '').split('T')[0]
    const key = isEditor
      ? `${dateStr}_${claim.created_by || 'unknown'}`
      : dateStr

    if (!groups.has(key)) {
      const submitterName = isEditor
        ? (nameMap.get(claim.created_by || '') || '未知')
        : undefined

      groups.set(key, {
        key,
        date: dateStr,
        displayDate: formatDate(dateStr),
        submitterName,
        claims: [],
        totalAmount: 0,
        draftCount: 0,
        submittedCount: 0,
        approvedCount: 0,
      })
    }

    const group = groups.get(key)!
    group.claims.push(claim)
    group.totalAmount += claim.total_amount || 0
    if (claim.status === 'draft' || claim.status === 'rejected') group.draftCount++
    if (claim.status === 'submitted') group.submittedCount++
    if (claim.status === 'approved') group.approvedCount++
  }

  return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date))
}

const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

// ==================== Component ====================

export function ExpenseClaimGroups({
  claims,
  isEditor,
  nameMap,
  onEdit,
  onDelete,
  onSubmit,
  onApprove,
  onReject,
  actionLoading = new Set(),
}: ExpenseClaimGroupsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // 預設展開第一個群組
    const groups = groupClaims(claims, isEditor, nameMap)
    return new Set(groups.length > 0 ? [groups[0].key] : [])
  })

  // 駁回 dialog 狀態
  const [rejectingClaimId, setRejectingClaimId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const groups = useMemo(
    () => groupClaims(claims, isEditor, nameMap),
    [claims, isEditor, nameMap]
  )

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleRejectSubmit = () => {
    if (!rejectingClaimId) return
    onReject(rejectingClaimId, rejectionReason.trim() || '未提供原因')
    setRejectingClaimId(null)
    setRejectionReason('')
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        type="no-data"
        icon={Receipt}
        title="尚無報帳記錄"
        description="點擊「新增報帳」開始新增報帳項目"
      />
    )
  }

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const isExpanded = expandedGroups.has(group.key)

        return (
          <div key={group.key} className="bg-card border border-border rounded-lg overflow-hidden">
            {/* 群組標題 */}
            <div
              className="flex items-center justify-between cursor-pointer hover:bg-secondary/50 px-4 py-3"
              onClick={() => toggleGroup(group.key)}
            >
              <div className="flex items-center gap-3">
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                }
                <Receipt className="h-5 w-5 text-info" />
                <div>
                  <div className="font-medium text-foreground flex items-center gap-2">
                    {group.displayDate}
                    {group.submitterName && (
                      <span className="text-muted-foreground font-normal">— {group.submitterName}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                    <span>{group.claims.length} 筆</span>
                    {group.draftCount > 0 && (
                      <span className="text-muted-foreground">草稿 {group.draftCount}</span>
                    )}
                    {group.submittedCount > 0 && (
                      <span className="text-warning">待審核 {group.submittedCount}</span>
                    )}
                    {group.approvedCount > 0 && (
                      <span className="text-success">已核准 {group.approvedCount}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 群組金額 */}
              <div className="text-right">
                <div className="font-bold text-info">
                  NT$ {fmt(group.totalAmount)}
                </div>
              </div>
            </div>

            {/* 展開：項目表格 */}
            {isExpanded && (
              <div className="border-t border-border">
                {/* 群組操作列 */}
                {group.draftCount > 0 && (
                  <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {group.draftCount} 筆可送出
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        const draftIds = group.claims
                          .filter(c => c.status === 'draft' || c.status === 'rejected')
                          .map(c => c.id)
                        onSubmit(draftIds)
                      }}
                    >
                      全部送出
                    </Button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-secondary">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">報帳月份</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">支出種類</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">廠商/對象</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">金額</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">稅額</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">總額</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">專案名稱</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">發票號碼</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">備註</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground border-l-2 border-border">狀態</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">請款</th>
                        {isEditor && (
                          <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">審核</th>
                        )}
                        <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">操作</th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {group.claims.map(claim => (
                        <ClaimRow
                          key={claim.id}
                          claim={claim}
                          isEditor={isEditor}
                          isLoading={actionLoading.has(claim.id)}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onSubmit={onSubmit}
                          onApprove={onApprove}
                          onRejectOpen={(id) => {
                            setRejectingClaimId(id)
                            setRejectionReason('')
                          }}
                        />
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/20 font-medium text-sm">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-muted-foreground">小計</td>
                        <td className="px-3 py-2 text-right font-bold">
                          NT$ {fmt(group.totalAmount)}
                        </td>
                        <td colSpan={isEditor ? 7 : 6} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* 駁回原因 Modal */}
      <Modal
        isOpen={!!rejectingClaimId}
        onClose={() => { setRejectingClaimId(null); setRejectionReason('') }}
        title="駁回報帳"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            請輸入駁回原因，申請人可依據原因修改後重新送出。
          </p>
          <Textarea
            placeholder="駁回原因..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setRejectingClaimId(null); setRejectionReason('') }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
            >
              確認駁回
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ==================== Claim Row ====================

function ClaimRow({
  claim,
  isEditor,
  isLoading,
  onEdit,
  onDelete,
  onSubmit,
  onApprove,
  onRejectOpen,
}: {
  claim: ExpenseClaimWithQuotation
  isEditor: boolean
  isLoading: boolean
  onEdit: (claim: ExpenseClaimWithQuotation) => void
  onDelete: (id: string) => void
  onSubmit: (ids: string[]) => void
  onApprove: (claimId: string) => void
  onRejectOpen: (claimId: string) => void
}) {
  const canEdit = claim.status === 'draft' || claim.status === 'rejected'
  const canSubmit = claim.status === 'draft' || claim.status === 'rejected'
  const canApprove = claim.status === 'submitted'

  return (
    <tr className="text-sm hover:bg-secondary group">
      {/* 報帳月份 */}
      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
        {claim.claim_month || '—'}
      </td>

      {/* 支出種類 */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-foreground">
          {claim.expense_type}
        </span>
      </td>

      {/* 廠商/對象 */}
      <td className="px-3 py-2.5 text-foreground font-medium whitespace-nowrap">
        {claim.vendor_name || '—'}
      </td>

      {/* 金額 */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {fmt(claim.amount || 0)}
      </td>

      {/* 稅額 */}
      <td className="px-3 py-2.5 text-right text-muted-foreground whitespace-nowrap">
        {fmt(claim.tax_amount || 0)}
      </td>

      {/* 總額 */}
      <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
        NT$ {fmt(claim.total_amount || 0)}
      </td>

      {/* 專案名稱 */}
      <td className="px-3 py-2.5 text-muted-foreground max-w-32">
        <div className="truncate" title={claim.project_name || ''}>
          {claim.quotations?.quote_number && <span className="text-xs font-mono text-muted-foreground mr-1.5">{claim.quotations.quote_number}</span>}
          {claim.project_name || '—'}
        </div>
      </td>

      {/* 發票號碼 */}
      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs whitespace-nowrap">
        {claim.invoice_number || '—'}
      </td>

      {/* 備註 */}
      <td className="px-3 py-2.5 text-muted-foreground max-w-28">
        <div className="truncate" title={claim.note || ''}>
          {claim.note || '—'}
        </div>
      </td>

      {/* ===== 請款管理欄位 ===== */}

      {/* 狀態 */}
      <td className="px-2 py-2.5 text-center border-l-2 border-border">
        <div>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${CLAIM_STATUS_COLORS[claim.status]}`}>
            {CLAIM_STATUS_LABELS[claim.status]}
          </span>
          {claim.status === 'approved' && claim.payment_status && (
            <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${PAYMENT_STATUS_COLORS[claim.payment_status]}`}>
              {PAYMENT_STATUS_LABELS[claim.payment_status]}
            </span>
          )}
        </div>
        {claim.rejection_reason && (
          <p className="text-[10px] text-destructive mt-0.5 max-w-20 truncate" title={claim.rejection_reason}>
            {claim.rejection_reason}
          </p>
        )}
      </td>

      {/* 請款 */}
      <td className="px-2 py-2.5 text-center">
        {claim.status === 'approved' ? (
          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
        ) : claim.status === 'submitted' ? (
          <CheckCircle2 className="h-4 w-4 text-warning mx-auto" />
        ) : canSubmit ? (
          <button
            onClick={() => onSubmit([claim.id])}
            disabled={isLoading}
            className="p-1 rounded hover:bg-accent transition-colors mx-auto flex items-center justify-center disabled:opacity-50"
            title="點擊送出審核"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="h-4 w-4 border-2 border-muted-foreground/40 rounded" />
            )}
          </button>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </td>

      {/* 審核（Editor+ only） */}
      {isEditor && (
        <td className="px-2 py-2.5 text-center">
          {claim.status === 'approved' ? (
            <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
          ) : canApprove ? (
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={() => onApprove(claim.id)}
                disabled={isLoading}
                className="p-1 rounded hover:bg-success/10 transition-colors disabled:opacity-50"
                title="核准"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <div className="h-4 w-4 border-2 border-muted-foreground/40 rounded" />
                )}
              </button>
              <button
                onClick={() => onRejectOpen(claim.id)}
                disabled={isLoading}
                className="p-0.5 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
                title="駁回"
              >
                <span className="text-[10px] text-destructive font-medium">✗</span>
              </button>
            </div>
          ) : claim.status === 'rejected' ? (
            <span className="text-destructive text-xs" title={claim.rejection_reason || ''}>✗</span>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </td>
      )}

      {/* 操作 */}
      <td className="px-2 py-2.5 text-center">
        {canEdit && (
          <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(claim)}
              className="p-1 text-muted-foreground hover:text-info hover:bg-info/10 rounded transition-colors"
              title="編輯"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(claim.id)}
              className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
              title="刪除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}
