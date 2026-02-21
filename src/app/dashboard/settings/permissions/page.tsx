'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { UserRole } from '@/types/custom.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'
import UserEditModal from '@/components/settings/UserEditModal'
import InviteMemberModal from '@/components/settings/InviteMemberModal'
import {
  Shield,
  Pencil,
  Trash2,
  Search,
  Crown,
  Settings,
  User,
  Users,
  UserPlus,
  Link2,
  Unlink,
} from 'lucide-react'

interface UserProfile {
  id: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

interface EmployeeLink {
  id: string
  name: string
  employee_number: string | null
  position: string | null
  department: string | null
  status: string
  user_id: string | null
}

interface UserWithEmployee extends UserProfile {
  employee: EmployeeLink | null
}

type RoleFilter = 'all' | UserRole
type LinkFilter = 'all' | 'linked' | 'unlinked'

export default function UserManagementPage() {
  const { hasRole, userId: currentUserId, loading: permLoading } = usePermission()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [editingUser, setEditingUser] = useState<UserWithEmployee | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const canManageUsers = hasRole('Admin')

  // 載入使用者 + 員工綁定資訊
  const { data: usersWithEmployees = [], isLoading } = useQuery({
    queryKey: queryKeys.userManagement,
    queryFn: async () => {
      const [profilesRes, employeesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('employees')
          .select('id, name, employee_number, position, department, status, user_id'),
      ])

      if (profilesRes.error) throw profilesRes.error

      const profiles = profilesRes.data as UserProfile[]
      const employees = (employeesRes.data || []) as EmployeeLink[]

      return profiles.map(p => ({
        ...p,
        employee: employees.find(e => e.user_id === p.id) || null,
      }))
    },
    enabled: canManageUsers,
  })

  // 未綁定的在職員工（用於 UserEditModal 的下拉選單）
  const { data: unlinkedEmployees = [] } = useQuery({
    queryKey: queryKeys.unlinkedEmployees,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_number, position, department')
        .is('user_id', null)
        .eq('status', '在職')
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: canManageUsers,
  })

  // 刪除帳號
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userManagement })
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedEmployees })
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles })
      toast.success('帳號已刪除')
    },
    onError: () => toast.error('刪除帳號失敗'),
  })

  // 篩選
  const filteredUsers = useMemo(() => {
    let result = usersWithEmployees

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.employee?.name.toLowerCase().includes(q)
      )
    }

    if (roleFilter !== 'all') {
      result = result.filter(u => u.role === roleFilter)
    }

    if (linkFilter === 'linked') {
      result = result.filter(u => u.employee !== null)
    } else if (linkFilter === 'unlinked') {
      result = result.filter(u => u.employee === null)
    }

    return result
  }, [usersWithEmployees, searchTerm, roleFilter, linkFilter])

  // 統計
  const stats = useMemo(() => {
    const total = usersWithEmployees.length
    const adminCount = usersWithEmployees.filter(u => u.role === 'Admin').length
    const editorCount = usersWithEmployees.filter(u => u.role === 'Editor').length
    const linkedCount = usersWithEmployees.filter(u => u.employee !== null).length
    return { total, adminCount, editorCount, linkedCount }
  }, [usersWithEmployees])

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'Admin': return <Crown className="h-4 w-4 text-yellow-500" />
      case 'Editor': return <Settings className="h-4 w-4 text-info" />
      default: return <User className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'Admin': return '管理員'
      case 'Editor': return '編輯者'
      default: return '成員'
    }
  }

  const getRoleBadgeClass = (role: UserRole) => {
    switch (role) {
      case 'Admin': return 'bg-yellow-500/10 text-yellow-500'
      case 'Editor': return 'bg-info/10 text-info'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const handleDelete = (user: UserWithEmployee) => {
    if (user.id === currentUserId) {
      toast.error('無法刪除自己的帳號')
      return
    }
    if (user.role === 'Admin') {
      toast.error('無法刪除管理員帳號')
      return
    }
    if (!confirm(`確定要刪除帳號 ${user.email} 嗎？此操作無法復原。`)) return
    deleteMutation.mutate(user.id)
  }

  if (permLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!canManageUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">權限不足</h3>
          <p className="text-muted-foreground">僅管理員可管理使用者</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" />
            使用者管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理系統帳號、角色權限與員工綁定
          </p>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          邀請新成員
        </Button>
      </div>

      {/* KPI 統計卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-chart-4/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-4 mb-1">總帳號數</p>
          <p className="text-2xl font-bold text-chart-4">{stats.total}</p>
        </div>
        <div className="bg-yellow-500/10 rounded-xl p-4 text-center">
          <p className="text-xs text-yellow-500 mb-1">管理員</p>
          <p className="text-2xl font-bold text-yellow-500">{stats.adminCount}</p>
        </div>
        <div className="bg-info/10 rounded-xl p-4 text-center">
          <p className="text-xs text-info mb-1">編輯者</p>
          <p className="text-2xl font-bold text-info">{stats.editorCount}</p>
        </div>
        <div className="bg-success/10 rounded-xl p-4 text-center">
          <p className="text-xs text-success mb-1">已綁定員工</p>
          <p className="text-2xl font-bold text-success">{stats.linkedCount}/{stats.total}</p>
        </div>
      </div>

      {/* 搜尋 + 篩選 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            placeholder="搜尋帳號或員工姓名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">全部角色</option>
          <option value="Admin">管理員</option>
          <option value="Editor">編輯者</option>
          <option value="Member">成員</option>
        </select>
        <select
          value={linkFilter}
          onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">全部綁定</option>
          <option value="linked">已綁定</option>
          <option value="unlinked">未綁定</option>
        </select>
      </div>

      {/* 使用者列表 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3">帳號</th>
                  <th className="text-left px-4 py-3">角色</th>
                  <th className="text-left px-4 py-3">綁定員工</th>
                  <th className="text-left px-4 py-3">建立時間</th>
                  <th className="text-center px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground/60">
                      無符合條件的使用者
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => (
                    <tr key={user.id} className="border-t border-border/50 hover:bg-accent">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(user.role)}
                          <span className="text-foreground">{user.email}</span>
                          {user.id === currentUserId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                              本人
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(user.role)}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.employee ? (
                          <div className="flex items-center gap-1.5">
                            <Link2 className="w-3.5 h-3.5 text-success shrink-0" />
                            <span className="text-foreground">{user.employee.name}</span>
                            {user.employee.position && (
                              <span className="text-xs text-muted-foreground">· {user.employee.position}</span>
                            )}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1.5 text-muted-foreground/50">
                            <Unlink className="w-3.5 h-3.5" />
                            未綁定
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('zh-TW')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10"
                            title="編輯"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {user.role !== 'Admin' && user.id !== currentUserId && (
                            <button
                              onClick={() => handleDelete(user)}
                              className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded hover:bg-destructive/10"
                              title="刪除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 編輯 Modal */}
      {editingUser && (
        <UserEditModal
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          user={editingUser}
          linkedEmployee={editingUser.employee}
          unlinkedEmployees={unlinkedEmployees}
        />
      )}

      {/* 邀請新成員 Modal */}
      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </div>
  )
}
