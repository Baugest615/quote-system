'use client'

import { useState, useMemo, useEffect } from 'react'
import { usePermission } from '@/lib/permissions'
import { Landmark, ChevronLeft, Users, Building2, Receipt, CheckCircle2, Circle, ChevronDown, ChevronRight, Save, ShieldCheck } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import { EmptyState } from '@/components/ui/EmptyState'
import { PaymentStatusBadge } from '@/components/accounting/monthly-settlement/PaymentStatusBadge'
import Link from 'next/link'
import { PAYMENT_TARGET_LABELS } from '@/types/custom.types'
import type { PaymentTargetType, AccountingSale } from '@/types/custom.types'
import { useMonthlySettlement } from '@/hooks/useMonthlySettlement'
import type { EmployeeSettlementGroup, SettlementItemType } from '@/hooks/useMonthlySettlement'
import { useReconciliation } from '@/hooks/useReconciliation'
import { CURRENT_YEAR, CURRENT_MONTH, MONTH_OPTIONS } from '@/lib/constants'

const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

/** 從 accounting_expenses.note 提取有意義的內容，過濾系統前綴 */
function extractNote(note: string | null | undefined): string {
  if (!note) return ''
  // 新格式：'個人報帳核准 (使用者備註)' 或 '請款核准 (服務描述)'
  const parenMatch = note.match(/\((.+)\)\s*$/)
  if (parenMatch) return parenMatch[1]
  // 舊格式：'系統自動建立 - xxx' → 過濾掉
  if (note.startsWith('系統自動建立')) return ''
  // 使用者自行輸入的備註 → 原樣返回
  return note
}

export default function MonthlySettlementPage() {
  const { hasRole, loading: permLoading } = usePermission()
  const isAdmin = hasRole('Admin')
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(`${CURRENT_MONTH}月`)
  const [activeTab, setActiveTab] = useState<'employee' | 'external' | 'income'>('employee')
  const [externalFilter, setExternalFilter] = useState<string>('all')
  const [selectedItems, setSelectedItems] = useState<{ type: SettlementItemType; id: string }[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const { data, isLoading, markPaid, markUnpaid, isMarking } = useMonthlySettlement(year, month)

  // 外部付款篩選
  const filteredExternal = useMemo(() => {
    if (!data) return []
    if (externalFilter === 'all') return data.externalExpenses
    return data.externalExpenses.filter(e => e.payment_target_type === externalFilter)
  }, [data, externalFilter])

  // 選取邏輯
  const toggleSelect = (type: SettlementItemType, id: string) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.type === type && i.id === id)
      if (exists) return prev.filter(i => !(i.type === type && i.id === id))
      return [...prev, { type, id }]
    })
  }

  const isSelected = (type: SettlementItemType, id: string) =>
    selectedItems.some(i => i.type === type && i.id === id)

  const selectAllEmployee = () => {
    if (!data) return
    const items: { type: SettlementItemType; id: string }[] = []
    for (const g of data.employeeGroups) {
      if (g.payroll && g.payroll.payment_status !== 'paid') items.push({ type: 'payroll', id: g.payroll.id })
      for (const e of g.expenses) {
        if (e.payment_status !== 'paid') items.push({ type: 'expense', id: e.id })
      }
      for (const c of g.withholdingClaims) {
        if (c.payment_status !== 'paid') items.push({ type: 'claim', id: c.id })
      }
    }
    setSelectedItems(items)
  }

  const selectAllExternal = () => {
    const items = filteredExternal
      .filter(e => e.payment_status !== 'paid')
      .map(e => ({ type: 'expense' as const, id: e.id }))
    setSelectedItems(items)
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleMarkPaid = () => {
    if (selectedItems.length === 0) return
    markPaid(selectedItems, { onSuccess: () => setSelectedItems([]) })
  }

  const handleMarkUnpaid = () => {
    if (selectedItems.length === 0) return
    markUnpaid(selectedItems, { onSuccess: () => setSelectedItems([]) })
  }

  return (
    <AccountingLoadingGuard loading={permLoading} isAdmin={isAdmin}>
      <div className="space-y-6">
        {/* 頁首 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/accounting" className="p-2 hover:bg-accent rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <Landmark className="w-6 h-6 text-orange-400" />
            <h1 className="text-xl font-bold text-foreground">月結總覽</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* KPI 卡片 */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard label="員工薪資總額" value={data.kpiSalaryTotal} color="text-chart-5" />
            <KpiCard label="員工報帳總額" value={data.kpiEmployeeExpenseTotal} color="text-chart-4" />
            <KpiCard label="外部付款總額" value={data.kpiExternalTotal} color="text-chart-3" />
            <KpiCard label="當月付款總計" value={data.kpiGrandTotal} color="text-chart-1" />
            <KpiCard label="當月收入金額" value={data.kpiIncomeTotal} color="text-success" />
          </div>
        )}

        {/* 銀行餘額核對區塊 — 位於 KPI 下方、Tab 上方 */}
        {data && (
          <ReconciliationSection
            year={year}
            month={month}
            incomeTotal={data.kpiIncomeTotal}
            expenseTotal={data.kpiGrandTotal}
          />
        )}

        {/* Tab 切換 */}
        <div className="flex items-center gap-1 border-b border-border">
          <button
            onClick={() => { setActiveTab('employee'); setSelectedItems([]) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'employee'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" />
            員工付款
          </button>
          <button
            onClick={() => { setActiveTab('external'); setSelectedItems([]) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'external'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Building2 className="w-4 h-4" />
            外部付款
          </button>
          <button
            onClick={() => { setActiveTab('income'); setSelectedItems([]) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'income'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt className="w-4 h-4" />
            收入
          </button>
        </div>

        {/* 內容 */}
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground/60">載入中...</div>
        ) : !data ? (
          <EmptyState type="no-data" icon={Landmark} title="無資料" description="選擇年月查詢" />
        ) : activeTab === 'employee' ? (
          <EmployeeTab
            groups={data.employeeGroups}
            selectedItems={selectedItems}
            isSelected={isSelected}
            toggleSelect={toggleSelect}
            selectAll={selectAllEmployee}
            clearSelection={() => setSelectedItems([])}
            onMarkPaid={handleMarkPaid}
            onMarkUnpaid={handleMarkUnpaid}
            isMarking={isMarking}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
          />
        ) : activeTab === 'external' ? (
          <ExternalTab
            expenses={filteredExternal}
            filter={externalFilter}
            onFilterChange={setExternalFilter}
            selectedItems={selectedItems}
            isSelected={isSelected}
            toggleSelect={toggleSelect}
            selectAll={selectAllExternal}
            clearSelection={() => setSelectedItems([])}
            onMarkPaid={handleMarkPaid}
            onMarkUnpaid={handleMarkUnpaid}
            isMarking={isMarking}
          />
        ) : (
          <IncomeTab sales={data.sales} />
        )}

      </div>
    </AccountingLoadingGuard>
  )
}

// ====== KPI Card ======

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>NT$ {fmt(value)}</p>
    </div>
  )
}

// ====== 員工付款 Tab ======

function EmployeeTab({
  groups,
  selectedItems,
  isSelected,
  toggleSelect,
  selectAll,
  clearSelection,
  onMarkPaid,
  onMarkUnpaid,
  isMarking,
  expandedGroups,
  toggleGroup,
}: {
  groups: EmployeeSettlementGroup[]
  selectedItems: { type: SettlementItemType; id: string }[]
  isSelected: (type: SettlementItemType, id: string) => boolean
  toggleSelect: (type: SettlementItemType, id: string) => void
  selectAll: () => void
  clearSelection: () => void
  onMarkPaid: () => void
  onMarkUnpaid: () => void
  isMarking: boolean
  expandedGroups: Set<string>
  toggleGroup: (id: string) => void
}) {
  // 計算合計
  const totals = useMemo(() => {
    let salary = 0, expense = 0, withholding = 0, grand = 0
    for (const g of groups) {
      salary += g.salaryTotal
      expense += g.expenseTotal
      withholding += g.withholdingClaimTotal
      grand += g.grandTotal
    }
    return { salary, expense, withholding, grand }
  }, [groups])

  if (groups.length === 0) {
    return <EmptyState type="no-data" icon={Users} title="本月無員工付款" description="尚無薪資或員工報帳記錄" />
  }

  return (
    <div className="space-y-4">
      {/* 批量操作列 */}
      <BatchActionBar
        count={selectedItems.length}
        onSelectAll={selectAll}
        onClear={clearSelection}
        onMarkPaid={onMarkPaid}
        onMarkUnpaid={onMarkUnpaid}
        isMarking={isMarking}
      />

      {/* 摘要表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-muted-foreground text-xs">
              <th className="w-8 px-3 py-3"></th>
              <th className="text-left px-3 py-3 font-medium">員工</th>
              <th className="text-right px-3 py-3 font-medium">薪資</th>
              <th className="text-right px-3 py-3 font-medium">報帳</th>
              <th className="text-right px-3 py-3 font-medium">代扣代繳</th>
              <th className="text-right px-3 py-3 font-medium">合計</th>
              <th className="text-center px-3 py-3 font-medium">狀態</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const isExpanded = expandedGroups.has(g.employeeId)
              const itemCount = (g.payroll ? 1 : 0) + g.expenses.length + g.withholdingClaims.length
              return (
                <EmployeeGroupRow
                  key={g.employeeId}
                  group={g}
                  itemCount={itemCount}
                  isExpanded={isExpanded}
                  onToggle={() => toggleGroup(g.employeeId)}
                  isSelected={isSelected}
                  toggleSelect={toggleSelect}
                />
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50">
              <td className="px-3 py-3"></td>
              <td className="px-3 py-3 font-bold text-foreground">合計（{groups.length} 人）</td>
              <td className="px-3 py-3 text-right font-bold text-chart-5">{totals.salary > 0 ? `NT$ ${fmt(totals.salary)}` : '-'}</td>
              <td className="px-3 py-3 text-right font-bold text-chart-4">{totals.expense > 0 ? `NT$ ${fmt(totals.expense)}` : '-'}</td>
              <td className="px-3 py-3 text-right font-bold text-orange-400">{totals.withholding > 0 ? `NT$ ${fmt(totals.withholding)}` : '-'}</td>
              <td className="px-3 py-3 text-right font-bold text-foreground">NT$ {fmt(totals.grand)}</td>
              <td className="px-3 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ====== 員工群組行（摘要 + 可展開明細） ======

function EmployeeGroupRow({
  group: g,
  itemCount,
  isExpanded,
  onToggle,
  isSelected,
  toggleSelect,
}: {
  group: EmployeeSettlementGroup
  itemCount: number
  isExpanded: boolean
  onToggle: () => void
  isSelected: (type: SettlementItemType, id: string) => boolean
  toggleSelect: (type: SettlementItemType, id: string) => void
}) {
  return (
    <>
      {/* 摘要行 */}
      <tr
        onClick={onToggle}
        className="border-t border-border/50 hover:bg-accent cursor-pointer transition-colors"
      >
        <td className="px-3 py-3 text-center text-muted-foreground">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{g.employeeName}</span>
            <span className="text-xs text-muted-foreground">{itemCount} 筆</span>
          </div>
        </td>
        <td className="px-3 py-3 text-right text-chart-5">{g.salaryTotal > 0 ? `NT$ ${fmt(g.salaryTotal)}` : '-'}</td>
        <td className="px-3 py-3 text-right text-chart-4">{g.expenseTotal > 0 ? `NT$ ${fmt(g.expenseTotal)}` : '-'}</td>
        <td className="px-3 py-3 text-right text-orange-400">{g.withholdingClaimTotal > 0 ? `NT$ ${fmt(g.withholdingClaimTotal)}` : '-'}</td>
        <td className="px-3 py-3 text-right font-bold text-foreground">NT$ {fmt(g.grandTotal)}</td>
        <td className="px-3 py-3 text-center">
          {g.allPaid ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="w-3.5 h-3.5" /> 已付
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-warning">
              <Circle className="w-3.5 h-3.5" /> 未付
            </span>
          )}
        </td>
      </tr>

      {/* 展開明細行 */}
      {isExpanded && (
        <>
          {g.payroll && (
            <tr className="bg-muted/30 hover:bg-accent/50">
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2" colSpan={2}>
                <div className="pl-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected('payroll', g.payroll.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect('payroll', g.payroll!.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-border"
                    />
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-chart-5/20 text-chart-5">
                      薪資
                    </span>
                    <span className="text-xs text-muted-foreground">
                      實領薪資（底薪 {fmt(g.payroll.base_salary)} + 餐費 {fmt(g.payroll.meal_allowance)}）
                    </span>
                  </div>
                  {(g.payroll.labor_insurance_personal > 0 || g.payroll.health_insurance_personal > 0 || g.payroll.bonus > 0 || g.payroll.deduction > 0) && (
                    <div className="text-xs text-muted-foreground/70 pl-6 mt-0.5">
                      {[
                        g.payroll.labor_insurance_personal > 0 && `勞保 -${fmt(g.payroll.labor_insurance_personal)}`,
                        g.payroll.health_insurance_personal > 0 && `健保 -${fmt(g.payroll.health_insurance_personal)}`,
                        g.payroll.bonus > 0 && `獎金 +${fmt(g.payroll.bonus)}`,
                        g.payroll.deduction > 0 && `扣款 -${fmt(g.payroll.deduction)}`,
                      ].filter(Boolean).join(' | ')}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-3 py-2" colSpan={2}>
                <div className="text-right text-sm font-medium">NT$ {fmt(g.payroll.net_salary || 0)}</div>
              </td>
              <td className="px-3 py-2 text-center">
                <PaymentStatusBadge status={g.payroll.payment_status || 'unpaid'} />
              </td>
            </tr>
          )}
          {g.expenses.map(e => (
            <tr key={e.id} className="bg-muted/30 hover:bg-accent/50">
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2" colSpan={2}>
                <div className="pl-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected('expense', e.id)}
                      onChange={(ev) => { ev.stopPropagation(); toggleSelect('expense', e.id) }}
                      onClick={(ev) => ev.stopPropagation()}
                      className="rounded border-border"
                    />
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-chart-4/20 text-chart-4">
                      報帳
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.expense_type} — {e.accounting_subject || e.project_name || '-'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground/70 pl-6 mt-0.5">
                    {e.payment_request_id ? (
                      <span className="text-blue-400">KOL請款</span>
                    ) : e.expense_claim_id ? (
                      <span className="text-purple-400">個人報帳</span>
                    ) : (
                      <span>手動建立</span>
                    )}
                    {[
                      e.vendor_name && `廠商: ${e.vendor_name}`,
                      e.invoice_number && `發票: ${e.invoice_number}`,
                      extractNote(e.note),
                    ].filter(Boolean).map((s, i) => <span key={i}> | {s}</span>)}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2" colSpan={2}>
                <div className="text-right text-sm font-medium">NT$ {fmt(e.total_amount || 0)}</div>
              </td>
              <td className="px-3 py-2 text-center">
                <PaymentStatusBadge status={e.payment_status || 'unpaid'} />
              </td>
            </tr>
          ))}
          {g.withholdingClaims.map(c => (
            <tr key={c.id} className="bg-muted/30 hover:bg-accent/50">
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2" colSpan={2}>
                <div className="pl-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected('claim', c.id)}
                      onChange={(ev) => { ev.stopPropagation(); toggleSelect('claim', c.id) }}
                      onClick={(ev) => ev.stopPropagation()}
                      className="rounded border-border"
                    />
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/20 text-orange-400">
                      代扣代繳
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.accounting_subject || '所得稅'}{c.withholding_month ? ` (${c.withholding_month})` : ''}
                    </span>
                  </div>
                  {c.note && (
                    <div className="text-xs text-muted-foreground/70 pl-6 mt-0.5">{c.note}</div>
                  )}
                </div>
              </td>
              <td className="px-3 py-2" colSpan={2}>
                <div className="text-right text-sm font-medium">NT$ {fmt(c.total_amount || 0)}</div>
              </td>
              <td className="px-3 py-2 text-center">
                <PaymentStatusBadge status={c.payment_status || 'unpaid'} />
              </td>
            </tr>
          ))}
        </>
      )}
    </>
  )
}

// ====== 外部付款 Tab ======

function ExternalTab({
  expenses,
  filter,
  onFilterChange,
  selectedItems,
  isSelected,
  toggleSelect,
  selectAll,
  clearSelection,
  onMarkPaid,
  onMarkUnpaid,
  isMarking,
}: {
  expenses: import('@/types/custom.types').AccountingExpense[]
  filter: string
  onFilterChange: (v: string) => void
  selectedItems: { type: SettlementItemType; id: string }[]
  isSelected: (type: SettlementItemType, id: string) => boolean
  toggleSelect: (type: SettlementItemType, id: string) => void
  selectAll: () => void
  clearSelection: () => void
  onMarkPaid: () => void
  onMarkUnpaid: () => void
  isMarking: boolean
}) {
  const externalTotal = expenses.reduce((s, e) => s + (e.total_amount || 0), 0)

  return (
    <div className="space-y-4">
      {/* 操作列 */}
      <div className="flex items-center gap-3">
        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">所有對象</option>
          <option value="kol">{PAYMENT_TARGET_LABELS.kol}</option>
          <option value="vendor">{PAYMENT_TARGET_LABELS.vendor}</option>
          <option value="other">{PAYMENT_TARGET_LABELS.other}</option>
        </select>
        <span className="text-sm text-muted-foreground">
          {expenses.length} 筆 / NT$ {fmt(externalTotal)}
        </span>
        <div className="flex-1" />
        <BatchActionBar
          count={selectedItems.length}
          onSelectAll={selectAll}
          onClear={clearSelection}
          onMarkPaid={onMarkPaid}
          onMarkUnpaid={onMarkUnpaid}
          isMarking={isMarking}
          inline
        />
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {expenses.length === 0 ? (
          <EmptyState type="no-data" icon={Building2} title="無外部付款" description="本月尚無 KOL / 廠商 / 其他付款記錄" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="w-10 px-3 py-3"></th>
                  <th className="text-left px-3 py-3">廠商/對象</th>
                  <th className="text-left px-3 py-3">支出種類</th>
                  <th className="text-left px-3 py-3">專案</th>
                  <th className="text-right px-3 py-3">金額</th>
                  <th className="text-center px-3 py-3">對象類型</th>
                  <th className="text-center px-3 py-3">付款狀態</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id} className="border-t border-border/50 hover:bg-accent">
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected('expense', e.id)}
                        onChange={() => toggleSelect('expense', e.id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground">{e.vendor_name || '-'}</div>
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {e.payment_request_id ? (
                          <span className="text-blue-400">KOL請款</span>
                        ) : e.expense_claim_id ? (
                          <span className="text-purple-400">個人報帳</span>
                        ) : (
                          <span>手動建立</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-muted-foreground">{e.expense_type}</div>
                      {e.accounting_subject && (
                        <div className="text-xs text-muted-foreground/70 mt-0.5">{e.accounting_subject}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-40">
                      <div className="text-muted-foreground truncate">{e.project_name || '-'}</div>
                      {(e.invoice_number || extractNote(e.note)) && (
                        <div className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                          {[
                            e.invoice_number && `發票: ${e.invoice_number}`,
                            extractNote(e.note),
                          ].filter(Boolean).join(' | ')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium">NT$ {fmt(e.total_amount || 0)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs text-muted-foreground">
                        {e.payment_target_type ? PAYMENT_TARGET_LABELS[e.payment_target_type as PaymentTargetType] : '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PaymentStatusBadge status={e.payment_status || 'unpaid'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ====== 收入 Tab ======

function IncomeTab({ sales }: { sales: AccountingSale[] }) {
  const totals = useMemo(() => {
    let salesAmount = 0, taxAmount = 0, totalAmount = 0
    for (const s of sales) {
      salesAmount += s.sales_amount || 0
      taxAmount += s.tax_amount || 0
      totalAmount += s.total_amount || 0
    }
    return { salesAmount, taxAmount, totalAmount }
  }, [sales])

  if (sales.length === 0) {
    return <EmptyState type="no-data" icon={Receipt} title="本月無收入記錄" description="尚無銷項發票資料" />
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {sales.length} 筆 / 合計 NT$ {fmt(totals.totalAmount)}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs">
                <th className="text-left px-3 py-3">案件名稱</th>
                <th className="text-left px-3 py-3">開立對象</th>
                <th className="text-right px-3 py-3">銷售額</th>
                <th className="text-right px-3 py-3">稅額</th>
                <th className="text-right px-3 py-3">發票總額</th>
                <th className="text-left px-3 py-3">發票號碼</th>
                <th className="text-left px-3 py-3">實際入帳日</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id} className="border-t border-border/50 hover:bg-accent">
                  <td className="px-3 py-3 font-medium text-foreground">{s.project_name || '-'}</td>
                  <td className="px-3 py-3 text-muted-foreground">{s.client_name || '-'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">NT$ {fmt(s.sales_amount || 0)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">NT$ {fmt(s.tax_amount || 0)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-success">NT$ {fmt(s.total_amount || 0)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{s.invoice_number || '-'}</td>
                  <td className="px-3 py-3 text-muted-foreground">{s.actual_receipt_date || '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50">
                <td className="px-3 py-3 font-bold text-foreground" colSpan={2}>合計（{sales.length} 筆）</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">NT$ {fmt(totals.salesAmount)}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-muted-foreground">NT$ {fmt(totals.taxAmount)}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-success">NT$ {fmt(totals.totalAmount)}</td>
                <td className="px-3 py-3" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ====== 銀行餘額核對區塊 ======

function ReconciliationSection({
  year,
  month,
  incomeTotal,
  expenseTotal,
}: {
  year: number
  month: string
  incomeTotal: number
  expenseTotal: number
}) {
  const { data: reconciliation, isLoading, upsert, isUpserting } = useReconciliation(year, month)
  const [prevBankBalance, setPrevBankBalance] = useState<string>('')
  const [bankBalance, setBankBalance] = useState<string>('')
  const [note, setNote] = useState<string>('')

  // 載入既有資料時同步到表單
  useEffect(() => {
    if (reconciliation) {
      setPrevBankBalance(reconciliation.prev_bank_balance ? String(reconciliation.prev_bank_balance) : '')
      setBankBalance(reconciliation.bank_balance ? String(reconciliation.bank_balance) : '')
      setNote(reconciliation.note ?? '')
    } else {
      setPrevBankBalance('')
      setBankBalance('')
      setNote('')
    }
  }, [reconciliation])

  const prevNum = parseFloat(prevBankBalance) || 0
  const currentNum = parseFloat(bankBalance) || 0
  const expectedBalance = prevNum + incomeTotal - expenseTotal
  const difference = currentNum - expectedBalance
  const hasInput = prevNum !== 0 || currentNum !== 0
  const isReconciled = reconciliation?.status === 'reconciled'

  const handleSave = (markReconciled: boolean) => {
    upsert({
      prevBankBalance: prevNum,
      bankBalance: currentNum,
      incomeTotal,
      expenseTotal,
      note: note || undefined,
      markReconciled,
    })
  }

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="text-center text-muted-foreground/60 text-sm">載入核對資料...</div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Landmark className="w-4 h-4 text-orange-400" />
          銀行餘額核對
        </h3>
        <div className="flex items-center gap-2">
          {isReconciled && (
            <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5" /> 已核對
            </span>
          )}
          {!isReconciled && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={isUpserting || !hasInput}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                儲存草稿
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={isUpserting || !hasInput}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-success hover:bg-success/90 rounded-lg transition-colors disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                標記已核對
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 公式流：上月餘額 + 收入 - 支出 = 預期餘額 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">上月存款餘額</label>
          <input
            type="number"
            value={prevBankBalance}
            onChange={(e) => setPrevBankBalance(e.target.value)}
            disabled={isReconciled}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 tabular-nums"
            placeholder="手動輸入"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <span className="text-success">+</span> 本月收入
          </label>
          <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted/30 text-success tabular-nums">
            NT$ {fmt(incomeTotal)}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <span className="text-destructive">-</span> 本月支出
          </label>
          <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted/30 text-destructive tabular-nums">
            NT$ {fmt(expenseTotal)}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <span className="text-primary">=</span> 預期本月餘額
          </label>
          <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted/30 text-foreground tabular-nums font-medium">
            {hasInput ? `NT$ ${fmt(expectedBalance)}` : '-'}
          </div>
        </div>
      </div>

      {/* 實際餘額 vs 差異 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">本月存款餘額</label>
          <input
            type="number"
            value={bankBalance}
            onChange={(e) => setBankBalance(e.target.value)}
            disabled={isReconciled}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 tabular-nums"
            placeholder="手動輸入"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">差異（實際 - 預期）</label>
          <div className={`w-full border rounded-lg px-3 py-2 text-sm tabular-nums font-bold ${
            !hasInput ? 'bg-muted/30 text-muted-foreground border-border' :
            difference === 0 ? 'bg-success/10 text-success border-success/30' :
            'bg-warning/10 text-warning border-warning/30'
          }`}>
            {!hasInput ? '-' : difference === 0 ? 'NT$ 0 ✓' : `NT$ ${fmt(difference)}`}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">備註</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isReconciled}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            placeholder="核對備註（選填）"
          />
        </div>
      </div>
    </div>
  )
}

// ====== 批量操作列 ======

function BatchActionBar({
  count,
  onSelectAll,
  onClear,
  onMarkPaid,
  onMarkUnpaid,
  isMarking,
  inline = false,
}: {
  count: number
  onSelectAll: () => void
  onClear: () => void
  onMarkPaid: () => void
  onMarkUnpaid: () => void
  isMarking: boolean
  inline?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${inline ? '' : 'mb-2'}`}>
      <button
        onClick={onSelectAll}
        className="text-xs text-primary hover:underline"
      >
        全選未付
      </button>
      {count > 0 && (
        <>
          <span className="text-xs text-muted-foreground">已選 {count} 筆</span>
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={onMarkPaid}
            disabled={isMarking}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-50"
          >
            標記已付
          </button>
          <button
            onClick={onMarkUnpaid}
            disabled={isMarking}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-warning/20 text-warning hover:bg-warning/30 transition-colors disabled:opacity-50"
          >
            標記未付
          </button>
        </>
      )}
    </div>
  )
}
