'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'
import { UserRole, PAGE_KEYS } from '@/types/custom.types'
import { Lock, Info } from 'lucide-react'

// Admin 對這些頁面的存取權不可移除（防止自鎖）
const LOCKED_ADMIN_PAGES: Set<string> = new Set([
  PAGE_KEYS.DASHBOARD,
  PAGE_KEYS.SETTINGS,
])

// 顯示順序（與 sidebar 一致）
const PAGE_ORDER = [
  PAGE_KEYS.DASHBOARD,
  PAGE_KEYS.CLIENTS,
  PAGE_KEYS.KOLS,
  PAGE_KEYS.QUOTES,
  PAGE_KEYS.PROJECTS,
  PAGE_KEYS.PENDING_PAYMENTS,
  PAGE_KEYS.PAYMENT_REQUESTS,
  PAGE_KEYS.CONFIRMED_PAYMENTS,
  PAGE_KEYS.ACCOUNTING,
  PAGE_KEYS.EXPENSE_CLAIMS,
  PAGE_KEYS.MY_SALARY,
  PAGE_KEYS.REPORTS,
  PAGE_KEYS.SETTINGS,
]

const DISPLAY_ROLES: { value: UserRole; label: string }[] = [
  { value: 'Admin', label: '管理員' },
  { value: 'Editor', label: '編輯者' },
  { value: 'Member', label: '成員' },
]

export default function PagePermissionGrid() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { pagePermissions } = usePermission()

  const updateMutation = useMutation({
    mutationFn: async ({ pageKey, newRoles }: { pageKey: string; newRoles: UserRole[] }) => {
      const config = pagePermissions[pageKey]

      // 先嘗試 UPDATE 既有列
      const { data: updated, error: updateError } = await supabase
        .from('page_permissions')
        .update({
          allowed_roles: newRoles,
          updated_at: new Date().toISOString(),
        })
        .eq('page_key', pageKey)
        .select('id')
      if (updateError) throw updateError

      // 如果 UPDATE 匹配 0 筆（DB 中不存在此頁面），則 INSERT
      if (!updated || updated.length === 0) {
        const { error: insertError } = await supabase
          .from('page_permissions')
          .insert({
            page_key: pageKey,
            page_name: config?.name || pageKey,
            allowed_roles: newRoles,
            allowed_functions: config?.allowedFunctions || [],
          })
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pagePermissions })
      toast.success('頁面權限已更新')
    },
    onError: () => toast.error('更新頁面權限失敗'),
  })

  const handleToggle = async (pageKey: string, role: UserRole, currentlyAllowed: boolean) => {
    const config = pagePermissions[pageKey]
    if (!config) return

    if (role === 'Admin' && LOCKED_ADMIN_PAGES.has(pageKey)) return

    let newRoles: UserRole[]

    if (currentlyAllowed) {
      const roleLabel = DISPLAY_ROLES.find(r => r.value === role)?.label
      const ok = await confirm({
        title: '移除頁面存取權',
        description: `確定要移除「${roleLabel}」對「${config.name}」的存取權限嗎？該角色的使用者將無法再看到此頁面。`,
        confirmLabel: '確認移除',
        variant: 'destructive',
      })
      if (!ok) return
      newRoles = config.allowedRoles.filter(r => r !== role)
    } else {
      newRoles = [...config.allowedRoles, role]
    }

    updateMutation.mutate({ pageKey, newRoles })
  }

  const orderedPages = PAGE_ORDER
    .filter(key => pagePermissions[key])
    .map(key => pagePermissions[key])

  return (
    <div className="space-y-4">
      {/* 說明 */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          調整各角色對系統頁面的存取權限。帶有 <Lock className="w-3.5 h-3.5 inline" /> 圖示的項目為必要權限，無法關閉。
          變更將即時生效，影響所有該角色的使用者。
        </p>
      </div>

      {/* Toggle Grid */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs">
                <th className="text-left px-4 py-3 min-w-[200px]">頁面</th>
                {DISPLAY_ROLES.map(role => (
                  <th key={role.value} className="text-center px-4 py-3 w-[100px]">
                    {role.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedPages.map(page => (
                <tr key={page.key} className="border-t border-border/50 hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <span className="text-foreground font-medium">{page.name}</span>
                  </td>
                  {DISPLAY_ROLES.map(role => {
                    const isAllowed = page.allowedRoles.includes(role.value)
                    const isLocked = role.value === 'Admin' && LOCKED_ADMIN_PAGES.has(page.key)
                    return (
                      <td key={role.value} className="text-center px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <Switch
                            checked={isAllowed}
                            onCheckedChange={() => handleToggle(page.key, role.value, isAllowed)}
                            disabled={isLocked || updateMutation.isPending}
                          />
                          {isLocked && (
                            <Lock className="w-3.5 h-3.5 text-muted-foreground/50" />
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
