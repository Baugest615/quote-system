'use client'

import { useState, useEffect } from 'react'
import supabase from '@/lib/supabase/client'  // 修正導入
import { usePermission } from '@/lib/permissions'
import { UserRole } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'  // 使用現有的 Modal
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

      toast.success('用戶角色更新成功')
      setIsEditModalOpen(false)
      setEditingUser(null)
      loadUsers()
    } catch (error) {
      console.error('Error updating user role:', error)
      toast.error('更新用戶角色失敗')
    }
  }

  // 刪除用戶
  const deleteUser = async (userId: string) => {
    if (!confirm('確定要刪除這個用戶嗎？此操作無法撤銷。')) {
      return
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (error) throw error

      toast.success('用戶刪除成功')
      loadUsers()
    } catch (error) {
      console.error('Error deleting user:', error)
      toast.error('刪除用戶失敗')
    }
  }

  // 取得角色顯示名稱
  const getRoleDisplayName = (role: UserRole) => {
    const roleNames = {
      'Admin': '管理員',
      'Editor': '編輯者',
      'Member': '成員',
    }
    return roleNames[role] || role
  }

  // 取得角色圖示
  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'Admin':
        return <Crown className="w-4 h-4 text-red-500" />
      case 'Editor':
        return <Settings className="w-4 h-4 text-yellow-500" />
      case 'Member':
        return <User className="w-4 h-4 text-green-500" />
      default:
        return <User className="w-4 h-4 text-gray-500" />
    }
  }

  // 過濾用戶
  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 開始編輯用戶
  const startEdit = (user: UserProfile) => {
    setEditingUser(user)
    setSelectedRole(user.role)
    setIsEditModalOpen(true)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // 只有管理員才能存取此頁面
  if (!hasRole('Admin' as UserRole)) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">存取被拒絕</h2>
        <p className="text-gray-600">您沒有權限存取權限管理頁面</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">權限管理</h1>
        <p className="text-gray-600">管理用戶角色和權限設定</p>
      </div>

      {/* 搜尋列 */}
      <div className="flex justify-between items-center mb-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="搜尋用戶郵箱..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-64"
          />
        </div>
      </div>

      {/* 用戶列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用戶
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  角色
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  建立時間
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="animate-pulse">載入中...</div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    沒有找到用戶
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-500" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.email}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {user.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(user.role)}
                        <span className="text-sm font-medium">
                          {getRoleDisplayName(user.role)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteUser(user.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 編輯用戶角色 Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="編輯用戶角色"
      >
        {editingUser && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">用戶郵箱</label>
              <div className="px-3 py-2 bg-gray-100 rounded border text-sm text-gray-700">
                {editingUser.email}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">角色</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="選擇用戶角色"
                aria-label="選擇用戶角色"
              >
                <option value="Member">成員</option>
                <option value="Editor">編輯者</option>
                <option value="Admin">管理員</option>
              </select>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setIsEditModalOpen(false)}
              >
                取消
              </Button>
              <Button onClick={updateUserRole}>
                更新角色
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 權限說明 */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">權限說明</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <Crown className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900">管理員 (Admin)</h4>
              <p className="text-sm text-gray-600">完整系統權限，包含用戶管理和所有功能</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900">編輯者 (Editor)</h4>
              <p className="text-sm text-gray-600">可執行請款審核，但無用戶管理權限</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900">成員 (Member)</h4>
              <p className="text-sm text-gray-600">基本報價單和客戶管理功能</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}