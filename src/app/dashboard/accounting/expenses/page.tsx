'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Search, TrendingDown, Pencil, Trash2, ChevronLeft, Table2 } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import SpreadsheetEditor from '@/components/accounting/SpreadsheetEditor'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'
import type { AccountingExpense } from '@/types/custom.types'
import { EXPENSE_TYPES, ACCOUNTING_SUBJECTS } from '@/types/custom.types'
import type { SpreadsheetColumn, BatchSaveResult, RowError } from '@/lib/spreadsheet-utils'

const PAGE_SIZE = 20
const CURRENT_YEAR = new Date().getFullYear()
const MONTH_OPTIONS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

const EXPENSE_TYPE_COLORS: Record<string, string> = {
  '專案支出': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  '勞務報酬': 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  '其他支出': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
  '公司相關': 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  '沖帳免付': 'bg-muted text-muted-foreground',
}

const emptyForm = (): Partial<AccountingExpense> => ({
  year: CURRENT_YEAR,
  expense_month: '',
  expense_type: '專案支出',
  accounting_subject: '',
  amount: 0,
  tax_amount: 0,
  total_amount: 0,
  vendor_name: '',
  payment_date: null,
  invoice_date: null,
  invoice_number: '',
  project_name: '',
  note: '',
})

export default function AccountingExpensesPage() {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const [year, setYear] = useState(CURRENT_YEAR)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [records, setRecords] = useState<AccountingExpense[]>([])
  const [filtered, setFiltered] = useState<AccountingExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccountingExpense | null>(null)
  const [form, setForm] = useState<Partial<AccountingExpense>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isSpreadsheetMode, setIsSpreadsheetMode] = useState(false)

  const spreadsheetColumns = useMemo<SpreadsheetColumn<AccountingExpense>[]>(() => [
    { key: 'expense_month', label: '支出月份', type: 'select',
      options: MONTH_OPTIONS.map(m => `${year}年${m}`), width: 'w-28' },
    { key: 'expense_type', label: '支出種類', type: 'select',
      options: [...EXPENSE_TYPES], required: true, width: 'w-28' },
    { key: 'accounting_subject', label: '會計科目', type: 'select',
      options: ['', ...ACCOUNTING_SUBJECTS], width: 'w-28' },
    { key: 'vendor_name', label: '廠商/對象', type: 'text', width: 'w-32' },
    { key: 'amount', label: '金額（未稅）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'tax_amount', label: '稅額', type: 'number', readOnly: true, width: 'w-24' },
    { key: 'total_amount', label: '總額（含稅）', type: 'number', readOnly: true, width: 'w-28' },
    { key: 'project_name', label: '專案名稱', type: 'text', width: 'w-36' },
    { key: 'payment_date', label: '匯款日', type: 'date', width: 'w-28' },
    { key: 'invoice_number', label: '發票號碼', type: 'text', width: 'w-28' },
    { key: 'invoice_date', label: '發票日期', type: 'date', width: 'w-28' },
    { key: 'note', label: '備註', type: 'text', width: 'w-40' },
  ], [year])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('accounting_expenses')
        .select('*')
        .eq('year', year)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRecords(data || [])
    } catch (err) {
      console.error('載入進項資料失敗:', err)
      toast.error('載入進項資料失敗')
    } finally {
      setLoading(false)
    }
  }, [year])

  const handleAutoCalcExpenses = useCallback((row: Partial<AccountingExpense>) => {
    const tax = Math.round((row.amount || 0) * 0.05 * 100) / 100
    const total = Math.round(((row.amount || 0) + tax) * 100) / 100
    return { tax_amount: tax, total_amount: total } as Partial<AccountingExpense>
  }, [])

  const handleBatchSave = useCallback(async (
    toInsert: Partial<AccountingExpense>[],
    toUpdate: { id: string; data: Partial<AccountingExpense> }[],
    toDelete: string[]
  ): Promise<BatchSaveResult> => {
    const { data: { user } } = await supabase.auth.getUser()
    const errors: RowError[] = []
    let successCount = 0

    if (toInsert.length > 0) {
      const payload = toInsert.map(r => ({ ...r, year, created_by: user?.id }))
      const { error } = await supabase.from('accounting_expenses').insert(payload)
      if (error) toInsert.forEach((_, i) => errors.push({ tempId: `insert-${i}`, message: error.message }))
      else successCount += toInsert.length
    }

    for (const { id, data } of toUpdate) {
      const { error } = await supabase.from('accounting_expenses').update({ ...data, created_by: user?.id }).eq('id', id)
      if (error) errors.push({ tempId: id, message: error.message })
      else successCount++
    }

    if (toDelete.length > 0) {
      const { error } = await supabase.from('accounting_expenses').delete().in('id', toDelete)
      if (error) errors.push({ tempId: 'batch-delete', message: error.message })
      else successCount += toDelete.length
    }

    await fetchRecords()
    return { successCount, errors }
  }, [year, fetchRecords])

  useEffect(() => {
    if (!permLoading && isAdmin) fetchRecords()
  }, [permLoading, isAdmin, fetchRecords])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(records.filter(r => {
      const matchesType = typeFilter === 'all' || r.expense_type === typeFilter
      const matchesSearch = !q ||
        (r.project_name || '').toLowerCase().includes(q) ||
        (r.vendor_name || '').toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.accounting_subject || '').toLowerCase().includes(q)
      return matchesType && matchesSearch
    }))
    setCurrentPage(1)
  }, [search, typeFilter, records])

  const handleAmountChange = (value: number) => {
    const tax = Math.round(value * 0.05 * 100) / 100
    const total = Math.round((value + tax) * 100) / 100
    setForm(f => ({ ...f, amount: value, tax_amount: tax, total_amount: total }))
  }

  const handleSave = async () => {
    if (!form.expense_type?.trim()) return toast.error('請選擇支出種類')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, created_by: user?.id }
      if (editing) {
        const { error } = await supabase.from('accounting_expenses').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('已更新進項記錄')
      } else {
        const { error } = await supabase.from('accounting_expenses').insert(payload)
        if (error) throw error
        toast.success('已新增進項記錄')
      }
      setIsModalOpen(false)
      fetchRecords()
    } catch (err) {
      console.error('進項儲存失敗:', err)
      toast.error('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆記錄嗎？')) return
    const { error } = await supabase.from('accounting_expenses').delete().eq('id', id)
    if (error) { toast.error('刪除失敗'); return }
    toast.success('已刪除')
    fetchRecords()
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)
  const totalWithTax = filtered.reduce((s, r) => s + (r.total_amount || 0), 0)

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-muted-foreground/60 hover:text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <TrendingDown className="w-7 h-7 text-destructive" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">進項管理</h1>
          <p className="text-sm text-muted-foreground">各類支出記錄</p>
        </div>
      </div>

      {/* 操作列 */}
      <div className="flex flex-wrap items-center gap-3">
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">所有類型</option>
          {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="搜尋專案、廠商、發票號碼..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {!isSpreadsheetMode && (
          <button
            onClick={() => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true) }}
            className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增進項
          </button>
        )}
        <button
          onClick={() => setIsSpreadsheetMode(!isSpreadsheetMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSpreadsheetMode
              ? 'bg-destructive/10 text-destructive border border-destructive/30'
              : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          <Table2 className="w-4 h-4" />
          {isSpreadsheetMode ? '表格模式' : '試算表模式'}
        </button>
      </div>

      {isSpreadsheetMode ? (
        <SpreadsheetEditor<AccountingExpense>
          columns={spreadsheetColumns}
          initialRows={records}
          year={year}
          emptyRow={emptyForm}
          onAutoCalc={handleAutoCalcExpenses}
          onBatchSave={handleBatchSave}
          accentColor="red"
          onClose={() => setIsSpreadsheetMode(false)}
        />
      ) : (
      <>
      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {EXPENSE_TYPES.map(t => {
          const sub = records.filter(r => r.expense_type === t)
          const total = sub.reduce((s, r) => s + (r.amount || 0), 0)
          return (
            <div
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              className={`rounded-xl p-3 text-center cursor-pointer transition-all border-2 ${
                typeFilter === t ? 'border-destructive/40' : 'border-transparent'
              } ${EXPENSE_TYPE_COLORS[t] || 'bg-muted text-muted-foreground'}`}
            >
              <p className="text-xs font-medium mb-1">{t}</p>
              <p className="text-sm font-bold">{fmt(total)}</p>
            </div>
          )
        })}
        <div className="rounded-xl p-3 text-center bg-chart-3/10">
          <p className="text-xs font-medium text-chart-3 mb-1">顯示筆數</p>
          <p className="text-sm font-bold text-chart-3">{filtered.length} 筆 / NT$ {fmt(totalAmount)}</p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground/60">載入中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3">支出月份</th>
                  <th className="text-left px-4 py-3">支出種類</th>
                  <th className="text-left px-4 py-3">會計科目</th>
                  <th className="text-left px-4 py-3">廠商/對象</th>
                  <th className="text-right px-4 py-3">金額（未稅）</th>
                  <th className="text-right px-4 py-3">總額（含稅）</th>
                  <th className="text-left px-4 py-3">專案名稱</th>
                  <th className="text-left px-4 py-3">匯款日</th>
                  <th className="text-center px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState type="no-data" icon={TrendingDown} title="尚無支出記錄" description="新增第一筆支出記錄開始追蹤" /></td></tr>
                ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => (
                  <tr key={r.id} className="border-t border-border/50 hover:bg-accent">
                    <td className="px-4 py-3 text-muted-foreground">{r.expense_month || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${EXPENSE_TYPE_COLORS[r.expense_type] || 'bg-muted text-muted-foreground'}`}>
                        {r.expense_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.accounting_subject || '-'}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {r.vendor_name || '-'}
                      {r.payment_request_id && <span className="ml-1.5 text-[10px] text-destructive bg-destructive/10 px-1 py-0.5 rounded" title="由請款核准自動建立">自動</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-destructive">NT$ {fmt(r.amount || 0)}</td>
                    <td className="px-4 py-3 text-right text-foreground">NT$ {fmt(r.total_amount || 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-32 truncate">{r.project_name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.payment_date || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setEditing(r); setForm({ ...r }); setIsModalOpen(true) }} className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filtered.length / PAGE_SIZE)}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modal */}
      <AccountingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? '編輯進項記錄' : '新增進項記錄'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">年度</label>
                  <select value={form.year} onChange={(e) => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">支出月份</label>
                  <select value={form.expense_month || ''} onChange={(e) => setForm(f => ({ ...f, expense_month: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">-- 選擇月份 --</option>
                    {MONTH_OPTIONS.map(m => <option key={m} value={`${form.year}年${m}`}>{form.year}年{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">支出種類 *</label>
                  <select value={form.expense_type || ''} onChange={(e) => setForm(f => ({ ...f, expense_type: e.target.value as any }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">會計科目</label>
                  <select value={form.accounting_subject || ''} onChange={(e) => setForm(f => ({ ...f, accounting_subject: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">-- 選擇科目 --</option>
                    {ACCOUNTING_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">廠商/付款對象</label>
                <input type="text" value={form.vendor_name || ''} onChange={(e) => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="廠商或個人姓名" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">金額（未稅）</label>
                  <input type="number" value={form.amount || ''} onChange={(e) => handleAmountChange(Number(e.target.value))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">稅額</label>
                  <input type="number" value={form.tax_amount || ''} onChange={(e) => setForm(f => ({ ...f, tax_amount: Number(e.target.value), total_amount: (f.amount || 0) + Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">總額（含稅）</label>
                  <input type="number" value={form.total_amount || ''} onChange={(e) => setForm(f => ({ ...f, total_amount: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">專案名稱</label>
                <input type="text" value={form.project_name || ''} onChange={(e) => setForm(f => ({ ...f, project_name: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="對應的專案名稱" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">匯款日</label>
                  <input type="date" value={form.payment_date || ''} onChange={(e) => setForm(f => ({ ...f, payment_date: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">發票號碼</label>
                  <input type="text" value={form.invoice_number || ''} onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如 AB-12345678" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">發票日期</label>
                <input type="date" value={form.invoice_date || ''} onChange={(e) => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">備註</label>
                <textarea value={form.note || ''} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="選填備註" />
              </div>
        </div>
      </AccountingModal>
      </>
      )}
    </div>
  )
}
