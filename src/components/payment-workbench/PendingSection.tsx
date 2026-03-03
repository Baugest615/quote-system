'use client'

import { useState, useMemo } from 'react'
import { Link2, Send, AlertTriangle, Inbox, User, Building2, AlertCircle, ChevronRight, ChevronLeft, Calendar, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useWorkbenchMerge, useWorkbenchSubmission } from '@/hooks/payment-workbench'
import type { WorkbenchItem, AccountCategory } from '@/hooks/payment-workbench/types'
import { itemsToCategorySections } from '@/hooks/payment-workbench/grouping'
import { MergeGroupCard } from './MergeGroupCard'
import { InlineItemEditor } from './InlineItemEditor'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<AccountCategory, React.ReactNode> = {
  individual: <User className="w-4 h-4" />,
  company: <Building2 className="w-4 h-4" />,
  unknown: <AlertCircle className="w-4 h-4 text-warning" />,
}

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
  const [mergeStep, setMergeStep] = useState<'leader' | 'month'>('leader')
  const [pendingPaymentMonth, setPendingPaymentMonth] = useState('')
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  // v1.1: 按帳戶類型 + 戶名分組
  const categorySections = useMemo(() => itemsToCategorySections(items), [items])

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  )

  // 推算自動月份：所有選取項目月份一致則帶入
  const autoMonth = useMemo(() => {
    const months = new Set(
      selectedItems.map((i) => i.expected_payment_month).filter(Boolean)
    )
    return months.size === 1 ? Array.from(months)[0]! : ''
  }, [selectedItems])

  // 重置 dialog 狀態
  const resetMergeDialog = () => {
    setShowMergeDialog(false)
    setMergeStep('leader')
    setPendingMergeLeaderId(null)
    setPendingPaymentMonth('')
  }

  // 處理合併按鈕點擊
  const handleMergeClick = () => {
    const result = canMerge(items)
    if (!result.valid) return

    if (result.hasCrossMonth) {
      setShowCrossMonthWarning(true)
    } else {
      setMergeStep('leader')
      setPendingMergeLeaderId(null)
      setPendingPaymentMonth('')
      setShowMergeDialog(true)
    }
  }

  // 確認跨月合併後打開主項選擇
  const handleCrossMonthConfirm = () => {
    setShowCrossMonthWarning(false)
    setMergeStep('leader')
    setPendingMergeLeaderId(null)
    setPendingPaymentMonth('')
    setShowMergeDialog(true)
  }

  // 選完主項 → 進入月份步驟
  const handleLeaderNext = () => {
    if (!pendingMergeLeaderId) return
    setPendingPaymentMonth(autoMonth)
    setMergeStep('month')
  }

  // 確認合併（含月份）
  const handleConfirmMerge = async () => {
    if (!pendingMergeLeaderId) return
    await createMergeGroup(pendingMergeLeaderId, pendingPaymentMonth || undefined)
    resetMergeDialog()
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

      {/* v1.1: 按帳戶類型分區顯示 */}
      {categorySections.map((section) => (
        <div key={section.category} className="space-y-3">
          {/* 區塊標題 */}
          <div className="flex items-center gap-2 px-1 pt-2">
            {CATEGORY_ICONS[section.category]}
            <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
            <span className="text-xs text-muted-foreground">
              {section.item_count} 筆 · ${section.total_amount.toLocaleString()}
            </span>
          </div>
          {section.category === 'unknown' && (
            <div className="flex items-start gap-2 px-3 py-2 bg-warning/5 border border-warning/20 rounded-md text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              請先至 KOL 管理填寫銀行資訊，才能正確匯款
            </div>
          )}

          {/* 該區塊下的每個戶名群組 */}
          {section.groups.map((group) => (
            <div key={group.remittance_name} className="space-y-2 ml-1">
              <h3 className="text-sm font-medium text-foreground px-1">{group.remittance_name}</h3>

              {/* 已合併的組 */}
              {group.merge_groups.map((mg) => (
                <MergeGroupCard
                  key={mg.group_id}
                  group={mg}
                  showSubmitAction
                  showDissolveAction
                  editable
                  onSubmit={submitMergeGroup}
                  onDissolve={dissolveMergeGroup}
                  isLoading={isSubmitting || isMerging}
                />
              ))}

              {/* 未合併的單筆項目（可展開編輯） */}
              {group.items.filter((i) => !i.merge_group_id).map((item) => {
                const isOpen = expandedItemId === item.id
                return (
                  <div key={item.id} className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        className="h-4 w-4 rounded border-border text-info focus:ring-info"
                      />
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => setExpandedItemId(isOpen ? null : item.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground truncate">
                            {item.project_name || '未命名'}
                          </span>
                          {item.kol_name && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-sm text-info truncate">{item.kol_name}</span>
                            </>
                          )}
                          <span className="text-xs text-muted-foreground">—</span>
                          <span className="text-sm text-muted-foreground truncate">
                            {item.service}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{item.expected_payment_month || '未指定月份'}</span>
                          {item.invoice_number && <span>發票: {item.invoice_number}</span>}
                          {(item.attachments?.length || 0) > 0 && (
                            <span>附件: {item.attachments.length}</span>
                          )}
                        </div>
                      </button>
                      <span className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
                        ${(item.cost_amount || 0).toLocaleString()}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSubmitting || item.cost_amount === null || item.cost_amount === undefined}
                        onClick={() => submitSingleItem(item.id)}
                      >
                        <Send className="w-3.5 h-3.5 mr-1" />
                        送出
                      </Button>
                      <ChevronDown className={cn(
                        'w-4 h-4 text-muted-foreground transition-transform duration-200 cursor-pointer',
                        isOpen && 'rotate-180'
                      )} onClick={() => setExpandedItemId(isOpen ? null : item.id)} />
                    </div>
                    {/* 展開的行內編輯區 */}
                    <div className={cn(
                      'overflow-hidden transition-all duration-200',
                      isOpen ? 'max-h-[600px]' : 'max-h-0'
                    )}>
                      {isOpen && <InlineItemEditor item={item} />}
                    </div>
                  </div>
                )
              })}
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

      {/* 合併確認 Modal（步驟 1: 選主項 → 步驟 2: 選月份） */}
      <Modal
        isOpen={showMergeDialog}
        onClose={resetMergeDialog}
        title={mergeStep === 'leader' ? '步驟 1：選擇合併主項' : '步驟 2：指定請款月份'}
      >
        {mergeStep === 'leader' ? (
          <>
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
              <Button variant="outline" onClick={resetMergeDialog}>取消</Button>
              <Button
                onClick={handleLeaderNext}
                disabled={!pendingMergeLeaderId}
              >
                下一步
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              合併後的請款月份。所有項目將統一使用此月份。
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <input
                  type="month"
                  value={pendingPaymentMonth}
                  onChange={(e) => setPendingPaymentMonth(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="YYYY-MM"
                />
              </div>
              {autoMonth && pendingPaymentMonth === autoMonth && (
                <p className="text-xs text-muted-foreground">
                  已自動帶入所有項目的共同月份
                </p>
              )}
              {!pendingPaymentMonth && (
                <p className="text-xs text-warning">
                  未指定月份時，各項目將保留原本的請款月份
                </p>
              )}
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={() => setMergeStep('leader')}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                上一步
              </Button>
              <Button
                onClick={handleConfirmMerge}
                disabled={isMerging}
              >
                <Link2 className="w-4 h-4 mr-1" />
                確認合併
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
