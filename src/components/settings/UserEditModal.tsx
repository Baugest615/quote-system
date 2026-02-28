'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { FormModal } from '@/components/ui/FormModal'
import { SearchableSelect, type SelectOption } from '@/components/ui/SearchableSelect'
import { UserRole } from '@/types/custom.types'
import { Link2, Unlink, Crown, Settings, User } from 'lucide-react'

interface UserProfile {
  id: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

interface LinkedEmployee {
  id: string
  name: string
  employee_number: string | null
  position: string | null
  department: string | null
  status: string
}

interface UnlinkedEmployee {
  id: string
  name: string
  employee_number: string | null
  position: string | null
  department: string | null
}

interface UserEditModalProps {
  isOpen: boolean
  onClose: () => void
  user: UserProfile
  linkedEmployee: LinkedEmployee | null
  unlinkedEmployees: UnlinkedEmployee[]
}

const ROLE_OPTIONS: { value: UserRole; label: string; icon: typeof Crown }[] = [
  { value: 'Admin', label: '管理員', icon: Crown },
  { value: 'Editor', label: '編輯者', icon: Settings },
  { value: 'Member', label: '成員', icon: User },
]

export default function UserEditModal({
  isOpen,
  onClose,
  user,
  linkedEmployee,
  unlinkedEmployees,
}: UserEditModalProps) {
  const queryClient = useQueryClient()
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedRole(user.role)
    setSelectedEmployeeId(null)
  }, [user])

  // 修改角色
  const updateRoleMutation = useMutation({
    mutationFn: async (role: UserRole) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userManagement })
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles })
      toast.success('角色已更新')
    },
    onError: () => toast.error('角色更新失敗'),
  })

  // 綁定員工
  const linkMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from('employees')
        .update({ user_id: user.id })
        .eq('id', employeeId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userManagement })
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedEmployees })
      queryClient.invalidateQueries({ queryKey: queryKeys.employees })
      toast.success('員工綁定成功')
      setSelectedEmployeeId(null)
    },
    onError: (err: Error) => {
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        toast.error('該員工已綁定其他帳號')
      } else {
        toast.error('綁定失敗')
      }
    },
  })

  // 解除綁定
  const unlinkMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from('employees')
        .update({ user_id: null })
        .eq('id', employeeId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userManagement })
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedEmployees })
      queryClient.invalidateQueries({ queryKey: queryKeys.employees })
      toast.success('已解除綁定')
    },
    onError: () => toast.error('解除綁定失敗'),
  })

  const isSubmitting = updateRoleMutation.isPending || linkMutation.isPending || unlinkMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedRole !== user.role) {
      updateRoleMutation.mutate(selectedRole)
    }
    onClose()
  }

  const employeeOptions: SelectOption[] = unlinkedEmployees.map(emp => ({
    value: emp.id,
    label: emp.name,
    description: [emp.employee_number, emp.position, emp.department].filter(Boolean).join(' · '),
  }))

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title="編輯使用者"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="儲存"
      maxWidth="max-w-lg"
    >
      {/* 帳號資訊 */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">帳號</label>
        <p className="text-sm text-foreground bg-muted rounded-md px-3 py-2">{user.email}</p>
      </div>

      {/* 角色選擇 */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">角色</label>
        <div className="grid grid-cols-3 gap-2">
          {ROLE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSelectedRole(value)}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                selectedRole === value
                  ? value === 'Admin'
                    ? 'border-yellow-500 bg-yellow-500/10 text-yellow-500'
                    : value === 'Editor'
                    ? 'border-info bg-info/10 text-info'
                    : 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 員工綁定 */}
      <div className="border-t border-border pt-4">
        <label className="block text-xs font-medium text-muted-foreground mb-2">員工綁定</label>

        {linkedEmployee ? (
          <div className="flex items-center justify-between p-3 bg-success/5 border border-success/20 rounded-lg">
            <div>
              <p className="text-sm font-medium text-foreground">
                {linkedEmployee.name}
                {linkedEmployee.employee_number && (
                  <span className="text-muted-foreground ml-2">({linkedEmployee.employee_number})</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[linkedEmployee.position, linkedEmployee.department].filter(Boolean).join(' · ') || '未設定職位'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => unlinkMutation.mutate(linkedEmployee.id)}
              disabled={unlinkMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Unlink className="w-3 h-3" />
              解除綁定
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <SearchableSelect
              value={selectedEmployeeId}
              onChange={(value) => setSelectedEmployeeId(value || null)}
              options={employeeOptions}
              placeholder="搜尋員工姓名或編號..."
              clearable
            />
            {selectedEmployeeId && (
              <button
                type="button"
                onClick={() => linkMutation.mutate(selectedEmployeeId)}
                disabled={linkMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-success border border-success/30 rounded-md hover:bg-success/10 transition-colors disabled:opacity-50"
              >
                <Link2 className="w-3 h-3" />
                確認綁定
              </button>
            )}
          </div>
        )}
      </div>
    </FormModal>
  )
}
