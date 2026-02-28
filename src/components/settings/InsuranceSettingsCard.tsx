'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, ExternalLink, Save, Plus, History, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { useInsuranceSettings, DEFAULT_INSURANCE_SETTINGS } from '@/hooks/useInsuranceSettings'
import type { InsuranceSettings } from '@/types/custom.types'
import { useQuery } from '@tanstack/react-query'

export default function InsuranceSettingsCard() {
  const queryClient = useQueryClient()
  const { data: currentSettings, isLoading } = useInsuranceSettings()
  const [isEditing, setIsEditing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [form, setForm] = useState<{ default_dependents: number; effective_date: string; note: string }>({
    default_dependents: DEFAULT_INSURANCE_SETTINGS.default_dependents,
    effective_date: new Date().toISOString().split('T')[0],
    note: '',
  })

  // 歷史紀錄
  const { data: history = [] } = useQuery({
    queryKey: [...queryKeys.insuranceSettings, 'history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insurance_settings')
        .select('*')
        .order('effective_date', { ascending: false })
      if (error) throw error
      return (data || []) as InsuranceSettings[]
    },
    enabled: showHistory,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()

      // 將現有設定設為失效
      if (currentSettings) {
        await supabase
          .from('insurance_settings')
          .update({
            expiry_date: form.effective_date,
            updated_by: user?.id,
          })
          .eq('id', currentSettings.id)
      }

      // 新增新設定
      const { error } = await supabase
        .from('insurance_settings')
        .insert({
          default_dependents: form.default_dependents,
          effective_date: form.effective_date,
          note: form.note || null,
          updated_by: user?.id,
        })

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('保險設定已更新')
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: [...queryKeys.insuranceSettings] })
    },
    onError: (err: Error) => {
      toast.error(`儲存失敗：${err.message}`)
    },
  })

  const displayDependents = currentSettings?.default_dependents ?? DEFAULT_INSURANCE_SETTINGS.default_dependents

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold">保險設定</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            管理雇主保險參數與預設眷屬口數。
          </p>
        </div>
        <span className="text-[10px] font-medium text-rose-400 bg-rose-400/15 px-1.5 py-0.5 rounded">
          A
        </span>
      </div>

      {isLoading ? (
        <div className="mt-4 h-20 bg-muted rounded-lg animate-pulse" />
      ) : isEditing ? (
        /* 編輯模式 */
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                預設平均眷屬口數
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.default_dependents}
                onChange={(e) => setForm(f => ({ ...f, default_dependents: Number(e.target.value) }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                雇主未個別設定眷屬口數時使用此值
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                生效日期
              </label>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm(f => ({ ...f, effective_date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              備註
            </label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="例：依衛福部 2026 年度公告調整"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saveMutation.isPending ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      ) : (
        /* 檢視模式 */
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-500/5 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">預設平均眷屬口數</p>
              <p className="text-lg font-bold text-amber-400">{displayDependents}</p>
              {currentSettings?.effective_date && (
                <p className="text-xs text-muted-foreground mt-1">
                  生效日：{currentSettings.effective_date}
                </p>
              )}
            </div>
            <div className="bg-muted/50 rounded-lg p-3 flex flex-col justify-between">
              <p className="text-xs text-muted-foreground">費率表管理</p>
              <Link
                href="/dashboard/accounting/insurance-rates"
                className="flex items-center gap-1 text-sm text-primary hover:underline mt-1"
              >
                前往管理
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setForm({
                  default_dependents: displayDependents,
                  effective_date: new Date().toISOString().split('T')[0],
                  note: '',
                })
                setIsEditing(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent"
            >
              <Plus className="w-3.5 h-3.5" />
              新增設定
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent"
            >
              <History className="w-3.5 h-3.5" />
              歷史紀錄
              {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>

          {/* 歷史紀錄 */}
          {showHistory && history.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted text-muted-foreground">
                    <th className="text-left px-3 py-2">生效日期</th>
                    <th className="text-left px-3 py-2">失效日期</th>
                    <th className="text-right px-3 py-2">眷屬口數</th>
                    <th className="text-left px-3 py-2">備註</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} className="border-t border-border/50 hover:bg-accent">
                      <td className="px-3 py-2">{s.effective_date}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.expiry_date || '目前有效'}</td>
                      <td className="px-3 py-2 text-right font-medium">{s.default_dependents}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{s.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
