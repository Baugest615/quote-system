'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { Plus, Search, TrendingUp, Pencil, Trash2, ChevronLeft, Info } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { InsuranceRateTable } from '@/types/custom.types'

const PAGE_SIZE = 20

const emptyForm = (): Partial<InsuranceRateTable> => ({
  grade: 1,
  monthly_salary: 27470,
  labor_rate_total: 0.12,
  labor_rate_employee: 0.024,
  labor_rate_company: 0.084,
  labor_rate_government: 0.012,
  health_rate_total: 0.0517,
  health_rate_employee: 0.0155,
  health_rate_company: 0.031,
  health_rate_government: 0.0052,
  supplementary_rate: 0.0217,
  pension_rate_company: 0.06,
  pension_rate_employee: 0,
  occupational_injury_rate: 0.0021,
  employment_stabilization_rate: 0.001,
  effective_date: new Date().toISOString().split('T')[0],
  expiry_date: null,
  note: '',
})

export default function InsuranceRatesPage() {
  const confirm = useConfirm()
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<InsuranceRateTable | null>(null)
  const [form, setForm] = useState<Partial<InsuranceRateTable>>(emptyForm())
  const [currentPage, setCurrentPage] = useState(1)

  const { data: rates = [], isLoading: loading } = useQuery({
    queryKey: [...queryKeys.insuranceRates],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insurance_rate_tables')
        .select('*')
        .order('grade', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !permLoading && isAdmin,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rates.filter(r =>
      r.grade.toString().includes(q) ||
      r.monthly_salary.toString().includes(q) ||
      (r.note || '').toLowerCase().includes(q)
    )
  }, [search, rates])

  const updateForm = (updates: Partial<InsuranceRateTable>) => {
    setForm(f => ({ ...f, ...updates }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from('insurance_rate_tables').update(form).eq('id', editing.id)
        if (error) throw error
        return 'update'
      } else {
        const { error } = await supabase.from('insurance_rate_tables').insert(form)
        if (error) throw error
        return 'insert'
      }
    },
    onSuccess: (action) => {
      toast.success(action === 'update' ? '已更新費率' : '已新增費率')
      setIsModalOpen(false)
      queryClient.invalidateQueries({ queryKey: [...queryKeys.insuranceRates] })
    },
    onError: (err: any) => {
      console.error('費率儲存失敗:', err)
      toast.error(err.message || '儲存失敗，請重試')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insurance_rate_tables').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('已刪除')
      queryClient.invalidateQueries({ queryKey: [...queryKeys.insuranceRates] })
    },
    onError: () => toast.error('刪除失敗'),
  })

  const saving = saveMutation.isPending

  const handleSave = () => {
    if (!form.grade || !form.monthly_salary) return toast.error('請填寫級距與投保薪資')
    saveMutation.mutate()
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除這個費率嗎？此操作無法復原。',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)
  const fmtRate = (n: number) => `${(n * 100).toFixed(2)}%`

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const activeRates = filtered.filter(r => !r.expiry_date || new Date(r.expiry_date) >= new Date())

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-muted-foreground/60 hover:text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <TrendingUp className="w-7 h-7 text-success" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">勞健保費率管理</h1>
          <p className="text-sm text-muted-foreground">管理投保級距與費率（支援歷史費率查詢）</p>
        </div>
      </div>

      {/* 說明卡片 */}
      <div className="bg-info/10 rounded-xl p-4 border border-info/20">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
          <div className="text-sm text-info">
            <p className="font-medium mb-1">關於費率表</p>
            <ul className="text-xs space-y-1 text-info/80">
              <li>此表管理台灣勞保、健保、勞退的投保級距與費率</li>
              <li>系統會根據「生效日期」與「失效日期」自動選擇正確的費率</li>
              <li>2026 年台灣費率：勞保 12%（個人 20%、公司 70%）、健保 5.17%（個人 30%、公司 60%）、勞退 6%</li>
              <li>若費率變動，請新增新的費率記錄並設定生效日期，舊費率會自動保留為歷史記錄</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 操作列 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input type="text" placeholder="搜尋級距、投保薪資..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true) }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          新增費率
        </button>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-chart-1/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-1 mb-1">有效費率級距</p>
          <p className="text-lg font-bold text-chart-1">{activeRates.length} 級</p>
        </div>
        <div className="bg-chart-4/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-4 mb-1">費率總數（含歷史）</p>
          <p className="text-lg font-bold text-chart-4">{filtered.length} 筆</p>
        </div>
        <div className="bg-muted rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">最高投保級距</p>
          <p className="text-lg font-bold text-foreground">
            {activeRates.length > 0 ? `第 ${Math.max(...activeRates.map(r => r.grade))} 級` : '-'}
          </p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs">
                <th className="text-center px-4 py-3">級距</th>
                <th className="text-right px-4 py-3">投保薪資</th>
                <th className="text-right px-4 py-3">勞保（個人）</th>
                <th className="text-right px-4 py-3">健保（個人）</th>
                <th className="text-right px-4 py-3">勞退（公司）</th>
                <th className="text-left px-4 py-3">生效日期</th>
                <th className="text-left px-4 py-3">失效日期</th>
                <th className="text-left px-4 py-3">備註</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground/60">尚無費率資料</td></tr>
              ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => {
                const isActive = !r.expiry_date || new Date(r.expiry_date) >= new Date()
                return (
                  <tr key={r.id} className={`border-t border-border/50 hover:bg-accent ${!isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-center font-semibold text-foreground">第 {r.grade} 級</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">NT$ {fmt(r.monthly_salary)}</td>
                    <td className="px-4 py-3 text-right text-destructive">{fmtRate(r.labor_rate_employee)}</td>
                    <td className="px-4 py-3 text-right text-destructive">{fmtRate(r.health_rate_employee)}</td>
                    <td className="px-4 py-3 text-right text-primary">{fmtRate(r.pension_rate_company)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.effective_date || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {r.expiry_date ? (
                        <span className="text-destructive">{r.expiry_date}</span>
                      ) : (
                        <span className="text-success">目前有效</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-32 truncate">{r.note || '-'}</td>
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
                )
              })}
            </tbody>
          </table>
        </div>
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
        title={editing ? '編輯費率' : '新增費率'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* 基本資訊 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">基本資訊</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">級距 *</label>
              <input type="number" value={form.grade || ''} onChange={(e) => updateForm({ grade: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">月投保薪資 *</label>
              <input type="number" value={form.monthly_salary || ''} onChange={(e) => updateForm({ monthly_salary: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="27470" />
            </div>
          </div>

          {/* 勞保費率 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">勞保費率（總費率 12%）</p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">總費率</label>
              <input type="number" step="0.0001" value={form.labor_rate_total || ''} onChange={(e) => updateForm({ labor_rate_total: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.12" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">個人（20%）</label>
              <input type="number" step="0.0001" value={form.labor_rate_employee || ''} onChange={(e) => updateForm({ labor_rate_employee: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.024" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">公司（70%）</label>
              <input type="number" step="0.0001" value={form.labor_rate_company || ''} onChange={(e) => updateForm({ labor_rate_company: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.084" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">政府（10%）</label>
              <input type="number" step="0.0001" value={form.labor_rate_government || ''} onChange={(e) => updateForm({ labor_rate_government: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.012" />
            </div>
          </div>

          {/* 健保費率 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">健保費率（總費率 5.17%）</p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">總費率</label>
              <input type="number" step="0.0001" value={form.health_rate_total || ''} onChange={(e) => updateForm({ health_rate_total: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.0517" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">個人（30%）</label>
              <input type="number" step="0.0001" value={form.health_rate_employee || ''} onChange={(e) => updateForm({ health_rate_employee: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.0155" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">公司（60%）</label>
              <input type="number" step="0.0001" value={form.health_rate_company || ''} onChange={(e) => updateForm({ health_rate_company: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.031" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">政府（10%）</label>
              <input type="number" step="0.0001" value={form.health_rate_government || ''} onChange={(e) => updateForm({ health_rate_government: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.0052" />
            </div>
          </div>

          {/* 其他費率 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">其他費率</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">補充保費</label>
              <input type="number" step="0.0001" value={form.supplementary_rate || ''} onChange={(e) => updateForm({ supplementary_rate: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.0217" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">勞退（公司）</label>
              <input type="number" step="0.0001" value={form.pension_rate_company || ''} onChange={(e) => updateForm({ pension_rate_company: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.06" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">勞退（員工自提）</label>
              <input type="number" step="0.0001" value={form.pension_rate_employee || ''} onChange={(e) => updateForm({ pension_rate_employee: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">職災保險費率</label>
              <input type="number" step="0.0001" value={form.occupational_injury_rate || ''} onChange={(e) => updateForm({ occupational_injury_rate: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.0021" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">就業安定費</label>
              <input type="number" step="0.0001" value={form.employment_stabilization_rate || ''} onChange={(e) => updateForm({ employment_stabilization_rate: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.001" />
            </div>
          </div>

          {/* 生效期間 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">生效期間</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">生效日期 *</label>
              <input type="date" value={form.effective_date || ''} onChange={(e) => updateForm({ effective_date: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">失效日期</label>
              <input type="date" value={form.expiry_date || ''} onChange={(e) => updateForm({ expiry_date: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-xs text-muted-foreground mt-1">留空表示目前有效</p>
            </div>
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">備註</label>
            <textarea value={form.note || ''} onChange={(e) => updateForm({ note: e.target.value })}
              rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如：基本工資級距" />
          </div>
        </div>
      </AccountingModal>
    </div>
  )
}
