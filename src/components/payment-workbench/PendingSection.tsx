'use client'

import { useState, useMemo } from 'react'
import { Link2, Send, AlertTriangle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useWorkbenchMerge, useWorkbenchSubmission } from '@/hooks/payment-workbench'
import type { WorkbenchItem, MergeGroupInfo } from '@/hooks/payment-workbench/types'
import { MergeGroupCard } from './MergeGroupCard'

interface PendingSectionProps {
  items: WorkbenchItem[]
  isReviewer: boolean
}

export function PendingSection({ items }: PendingSectionProps) {
  const {
    selectedIds,
    toggleSelection,
    clearSelection,
    canMerge,
    createMergeGroup,
    dissolveMergeGroup,
    isMerging,
  } = useWorkbenchMerge()

  const { submitMergeGroup, submitSingleItem, isSubmitting } = useWorkbenchSubmission()

  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showCrossMonthWarning, setShowCrossMonthWarning] = useState(false)
  const [pendingMergeLeaderId, setPendingMergeLeaderId] = useState<string | null>(null)

  // 將項目按匯款對象分組
  const groupedByRemittee = useMemo(() => {
    const groups = new Map<string, { items: WorkbenchItem[]; mergeGroups: MergeGroupInfo[] }>()

    for (const item of items) {
      const key = item.remittance_name || item.kol_name || '未指定匯款對象'
      if (!groups.has(key)) groups.set(key, { items: [], mergeGroups: [] })
      groups.get(key)!.items.push(item)
    }

    // 從每組中提取合併組
    for (const [, group] of Array.from(groups.entries())) {
      const mergeMap = new Map<string, WorkbenchItem[]>()
      for (const item of group.items) {
        if (item.merge_group_id) {
          if (!mergeMap.has(item.merge_group_id)) mergeMap.set(item.merge_group_id, [])
          mergeMap.get(item.merge_group_id)!.push(item)
        }
      }
      group.mergeGroups = Array.from(mergeMap.entries()).map(([groupId, mgItems]) => {
        const leader = mgItems.find((i) => i.is_merge_leader) || mgItems[0]
        return {
          group_id: groupId,
          leader_item: leader,
          member_items: mgItems.filter((i) => !i.is_merge_leader),
          merge_color: leader.merge_color,
          total_amount: mgItems.reduce((s, i) => s + (i.cost_amount || 0), 0),
          item_count: mgItems.length,
          status: leader.status as 'pending',
        }
      })
    }

    return Array.from(groups.entries()).map(([name, data]) => ({
      name,
      ungroupedItems: data.items.filter((i) => !i.merge_group_id),
      mergeGroups: data.mergeGroups,
    }))
  }, [items])

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  )

  // 處理合併按鈕點擊
  const handleMergeClick = () => {
    const result = canMerge(items)
    if (!result.valid) return

    if (result.hasCrossMonth) {
      setShowCrossMonthWarning(true)
    } else {
      setShowMergeDialog(true)
    }
  }

  // 確認跨月合併後打開主項選擇
  const handleCrossMonthConfirm = () => {
    setShowCrossMonthWarning(false)
    setShowMergeDialog(true)
  }

  // 選擇主項並建立合併
  const handleConfirmMerge = async () => {
    if (!pendingMergeLeaderId) return
    await createMergeGroup(pendingMergeLeaderId)
    setShowMergeDialog(false)
    setPendingMergeLeaderId(null)
  }

  const mergeValidation = canMerge(items)

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="w-12 h-12 mb-3 text-muted-foreground/50" />
        <p className="text-sm">沒有待處理的請款項目</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 操作列 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
          <span className="text-sm text-muted-foreground">
            已選 {selectedIds.size} 筆
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleMergeClick}
            disabled={!mergeValidation.valid || isMerging}
          >
            <Link2 className="w-3.5 h-3.5 mr-1" />
            合併請款
          </Button>
          {!mergeValidation.valid && mergeValidation.error && (
            <span className="text-xs text-destructive">{mergeValidation.error}</span>
          )}
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            取消選取
          </Button>
        </div>
      )}

      {/* 按匯款對象分組顯示 */}
      {groupedByRemittee.map(({ name, ungroupedItems, mergeGroups }) => (
        <div key={name} className="space-y-2">
          <h3 className="text-sm font-medium text-foreground px-1">{name}</h3>

          {/* 已合併的組 */}
          {mergeGroups.map((mg) => (
            <MergeGroupCard
              key={mg.group_id}
              group={mg}
              showSubmitAction
              showDissolveAction
              onSubmit={submitMergeGroup}
              onDissolve={dissolveMergeGroup}
              isLoading={isSubmitting || isMerging}
            />
          ))}

          {/* 未合併的單筆項目 */}
          {ungroupedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-2.5 border border-border rounded-lg hover:bg-muted/30 transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelection(item.id)}
                className="h-4 w-4 rounded border-border text-info focus:ring-info"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground truncate">
                    {item.project_name || '未命名'}
                  </span>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-sm text-muted-foreground truncate">
                    {item.service}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{item.expected_payment_month || '未指定月份'}</span>
                  {item.invoice_number && <span>發票: {item.invoice_number}</span>}
                </div>
              </div>
              <span className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
                ${(item.cost_amount || 0).toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isSubmitting || !item.cost_amount || item.cost_amount <= 0}
                onClick={() => submitSingleItem(item.id)}
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                送出
              </Button>
            </div>
          ))}
        </div>
      ))}

      {/* 跨月份警告 Modal */}
      <Modal
        isOpen={showCrossMonthWarning}
        onClose={() => setShowCrossMonthWarning(false)}
        title="跨月份合併提醒"
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            您選取的項目跨越不同的預計請款月份。合併後將以同一組進行請款，可能影響帳務月份歸屬。確定要繼續嗎？
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowCrossMonthWarning(false)}>取消</Button>
          <Button onClick={handleCrossMonthConfirm}>確定合併</Button>
        </div>
      </Modal>

      {/* 合併確認 Modal（選擇主項） */}
      <Modal
        isOpen={showMergeDialog}
        onClose={() => setShowMergeDialog(false)}
        title="選擇合併主項"
      >
        <p className="text-sm text-muted-foreground mb-4">
          主項將負責提供發票號碼和附件，其他項目會繼承主項的發票資訊。
        </p>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {selectedItems.map((item) => (
            <label
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                pendingMergeLeaderId === item.id
                  ? 'border-info bg-info/10'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <input
                type="radio"
                name="merge-leader"
                checked={pendingMergeLeaderId === item.id}
                onChange={() => setPendingMergeLeaderId(item.id)}
                className="text-info"
              />
              <div className="flex-1">
                <span className="text-sm text-foreground">{item.project_name} — {item.service}</span>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ${(item.cost_amount || 0).toLocaleString()} · {item.expected_payment_month || '未指定'}
                </div>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setShowMergeDialog(false)}>取消</Button>
          <Button
            onClick={handleConfirmMerge}
            disabled={!pendingMergeLeaderId || isMerging}
          >
            <Link2 className="w-4 h-4 mr-1" />
            確認合併
          </Button>
        </div>
      </Modal>
    </div>
  )
}
