'use client'

import { useState, useEffect } from 'react'
import supabase from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { UserRole } from '@/types/custom.types'  // 🔄 修改：從 custom.types 引入
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { 
  Shield, 
  UserPlus, 
  Edit, 
  Trash2, 
  Search,
  Crown,
  Settings,
  User
} from 'lucide-react'

interface UserProfile {
  id: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

export default function PermissionManagementPage() {
  const { userRole, hasRole } = usePermission()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [selectedRole, setSelectedRole] = useState<UserRole>('Member')

  // 載入用戶列表
  const loadUsers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error loading users:', error)
      toast.error('載入用戶列表失敗')
    } finally {
      setLoading(false)
    }
  }

  // 更新用戶角色
  const updateUserRole = async () => {
    if (!editingUser) return
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          role: selectedRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingUser.id)

      if (error) throw error

      // 更新本地狀態
      setUsers(prev => prev.map(user => 
        user.id === editingUser.id 
          ? { ...user, role: selectedRole }
          : user
      ))

      toast.success('用戶角色更新成功')
      setIsEditModalOpen(false)
      setEditingUser(null)
    } catch (error) {
      console.error('Error updating user role:', error)
      toast.error('更新用戶角色失敗')
    }
  }

  // 刪除用戶
  const deleteUser = async (userId: string) => {
    if (!confirm('確定要刪除這個用戶嗎？')) return
    
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (error) throw error

      setUsers(prev => prev.filter(user => user.id !== userId))
      toast.success('用戶刪除成功')
    } catch (error) {
      console.error('Error deleting user:', error)
      toast.error('刪除用戶失敗')
    }
  }

  // 篩選用戶
  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 權限檢查
  const canManageUsers = hasRole('Admin')
  
  useEffect(() => {
    if (canManageUsers) {
      loadUsers()
    }
  }, [canManageUsers])

  // 角色圖標和顏色
  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'Admin': return <Crown className="h-4 w-4 text-yellow-600" />
      case 'Editor': return <Settings className="h-4 w-4 text-blue-600" />
      case 'Member': return <User className="h-4 w-4 text-muted-foreground" />
      default: return <User className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getRoleDisplayName = (role: UserRole) => {
    switch (role) {
      case 'Admin': return '管理員'
      case 'Editor': return '編輯者'
      case 'Member': return '成員'
      default: return '未知'
    }
  }

  if (!canManageUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">權限不足</h3>
          <p className="text-muted-foreground">您沒有權限管理用戶角色</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">權限管理</h1>
          <p className="text-muted-foreground">管理用戶角色和權限</p>
        </div>
      </div>

      {/* 搜索欄 */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索用戶..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* 用戶列表 */}
      <div className="bg-card shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium">用戶列表</h2>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredUsers.map((user) => (
              <div key={user.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getRoleIcon(user.role)}
                  <div>
                    <p className="text-sm font-medium text-foreground">{user.email}</p>
                    <p className="text-sm text-muted-foreground">{getRoleDisplayName(user.role)}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingUser(user)
                      setSelectedRole(user.role)
                      setIsEditModalOpen(true)
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    編輯
                  </Button>
                  
                  {user.role !== 'Admin' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteUser(user.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      刪除
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 編輯角色模態框 */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">編輯用戶角色</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground/70 mb-2">
                用戶: {editingUser.email}
              </label>
              
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Member">成員</option>
                <option value="Editor">編輯者</option>
                <option value="Admin">管理員</option>
              </select>
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditModalOpen(false)
                  setEditingUser(null)
                }}
              >
                取消
              </Button>
              <Button onClick={updateUserRole}>
                確認
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}