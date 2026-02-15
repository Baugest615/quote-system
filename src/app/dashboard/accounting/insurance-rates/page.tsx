'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Search, TrendingUp, Pencil, Trash2, ChevronLeft, Info } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import Link from 'next/link'
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
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const [rates, setRates] = useState<InsuranceRateTable[]>([])
  const [filtered, setFiltered] = useState<InsuranceRateTable[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<InsuranceRateTable | null>(null)
  const [form, setForm] = useState<Partial<InsuranceRateTable>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const fetchRates = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('insurance_rate_tables')
        .select('*')
        .order('grade', { ascending: true })
      if (error) throw error
      setRates(data || [])
      setFiltered(data || [])
    } catch (err) {
      console.error('載入費率資料失敗:', err)
      toast.error('載入費率資料失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!permLoading && isAdmin) fetchRates()
  }, [permLoading, isAdmin, fetchRates])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(rates.filter(r =>
      r.grade.toString().includes(q) ||
      r.monthly_salary.toString().includes(q) ||
      (r.note || '').toLowerCase().includes(q)
    ))
    setCurrentPage(1)
  }, [search, rates])

  const updateForm = (updates: Partial<InsuranceRateTable>) => {
    setForm(f => ({ ...f, ...updates }))
  }

  const handleSave = async () => {
    if (!form.grade || !form.monthly_salary) return toast.error('請填寫級距與投保薪資')
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('insurance_rate_tables').update(form).eq('id', editing.id)
        if (error) throw error
        toast.success('已更新費率')
      } else {
        const { error } = await supabase.from('insurance_rate_tables').insert(form)
        if (error) throw error
        toast.success('已新增費率')
      }
      setIsModalOpen(false)
      fetchRates()
    } catch (err: any) {
      console.error('費率儲存失敗:', err)
      toast.error(err.message || '儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個費率嗎？此操作無法復原。')) return
    const { error } = await supabase.from('insurance_rate_tables').delete().eq('id', id)
    if (error) { toast.error('刪除失敗'); return }
    toast.success('已刪除')
    fetchRates()
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
        <Link href="/dashboard/accounting" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <TrendingUp className="w-7 h-7 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">勞健保費率管理</h1>
          <p className="text-sm text-gray-500">管理投保級距與費率（支援歷史費率查詢）</p>
        </div>
      </div>

      {/* 說明卡片 */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">關於費率表</p>
            <ul className="text-xs space-y-1 text-blue-700">
              <li>• 此表管理台灣勞保、健保、勞退的投保級距與費率</li>
              <li>• 系統會根據「生效日期」與「失效日期」自動選擇正確的費率</li>
              <li>• 2026 年台灣費率：勞保 12%（個人 20%、公司 70%）、健保 5.17%（個人 30%、公司 60%）、勞退 6%</li>
              <li>• 若費率變動，請新增新的費率記錄並設定生效日期，舊費率會自動保留為歷史記錄</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 操作列 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋級距、投保薪資..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true) }}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
          <Plus className="w-4 h-4" />
          新增費率
        </button>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <p className="text-xs text-green-500 mb-1">有效費率級距</p>
          <p className="text-lg font-bold text-green-700">{activeRates.length} 級</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-xs text-blue-500 mb-1">費率總數（含歷史）</p>
          <p className="text-lg font-bold text-blue-700">{filtered.length} 筆</p>
        </div>
        <div className="bg-gray-100 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">最高投保級距</p>
          <p className="text-lg font-bold text-gray-700">
            {activeRates.length > 0 ? `第 ${Math.max(...activeRates.map(r => r.grade))} 級` : '-'}
          </p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
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
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">尚無費率資料</td></tr>
              ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => {
                const isActive = !r.expiry_date || new Date(r.expiry_date) >= new Date()
                return (
                  <tr key={r.id} className={`border-t border-gray-100 hover:bg-gray-50 ${!isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-center font-semibold text-gray-800">第 {r.grade} 級</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">NT$ {fmt(r.monthly_salary)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{fmtRate(r.labor_rate_employee)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{fmtRate(r.health_rate_employee)}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{fmtRate(r.pension_rate_company)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.effective_date || '-'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {r.expiry_date ? (
                        <span className="text-red-500">{r.expiry_date}</span>
                      ) : (
                        <span className="text-green-600">目前有效</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{r.note || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setEditing(r); setForm({ ...r }); setIsModalOpen(true) }} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
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
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* 基本資訊 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">基本資訊</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">級距 *</label>
              <input type="number" value={form.grade || ''} onChange={(e) => updateForm({ grade: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">月投保薪資 *</label>
              <input type="number" value={form.monthly_salary || ''} onChange={(e) => updateForm({ monthly_salary: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="27470" />
            </div>
          </div>

          {/* 勞保費率 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">勞保費率（總費率 12%）</p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">總費率</label>
              <input type="number" step="0.0001" value={form.labor_rate_total || ''} onChange={(e) => updateForm({ labor_rate_total: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.12" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">個人（20%）</label>
              <input type="number" step="0.0001" value={form.labor_rate_employee || ''} onChange={(e) => updateForm({ labor_rate_employee: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.024" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">公司（70%）</label>
              <input type="number" step="0.0001" value={form.labor_rate_company || ''} onChange={(e) => updateForm({ labor_rate_company: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.084" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">政府（10%）</label>
              <input type="number" step="0.0001" value={form.labor_rate_government || ''} onChange={(e) => updateForm({ labor_rate_government: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.012" />
            </div>
          </div>

          {/* 健保費率 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">健保費率（總費率 5.17%）</p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">總費率</label>
              <input type="number" step="0.0001" value={form.health_rate_total || ''} onChange={(e) => updateForm({ health_rate_total: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.0517" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">個人（30%）</label>
              <input type="number" step="0.0001" value={form.health_rate_employee || ''} onChange={(e) => updateForm({ health_rate_employee: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.0155" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">公司（60%）</label>
              <input type="number" step="0.0001" value={form.health_rate_company || ''} onChange={(e) => updateForm({ health_rate_company: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.031" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">政府（10%）</label>
              <input type="number" step="0.0001" value={form.health_rate_government || ''} onChange={(e) => updateForm({ health_rate_government: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.0052" />
            </div>
          </div>

          {/* 其他費率 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">其他費率</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">補充保費</label>
              <input type="number" step="0.0001" value={form.supplementary_rate || ''} onChange={(e) => updateForm({ supplementary_rate: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.0217" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">勞退（公司）</label>
              <input type="number" step="0.0001" value={form.pension_rate_company || ''} onChange={(e) => updateForm({ pension_rate_company: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.06" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">勞退（員工自提）</label>
              <input type="number" step="0.0001" value={form.pension_rate_employee || ''} onChange={(e) => updateForm({ pension_rate_employee: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">職災保險費率</label>
              <input type="number" step="0.0001" value={form.occupational_injury_rate || ''} onChange={(e) => updateForm({ occupational_injury_rate: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.0021" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">就業安定費</label>
              <input type="number" step="0.0001" value={form.employment_stabilization_rate || ''} onChange={(e) => updateForm({ employment_stabilization_rate: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.001" />
            </div>
          </div>

          {/* 生效期間 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">生效期間</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">生效日期 *</label>
              <input type="date" value={form.effective_date || ''} onChange={(e) => updateForm({ effective_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">失效日期</label>
              <input type="date" value={form.expiry_date || ''} onChange={(e) => updateForm({ expiry_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">留空表示目前有效</p>
            </div>
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
            <textarea value={form.note || ''} onChange={(e) => updateForm({ note: e.target.value })}
              rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如：基本工資級距" />
          </div>
        </div>
      </AccountingModal>
    </div>
  )
}
