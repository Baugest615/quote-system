'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  BarChart3, 
  Users, 
  Star, 
  FileText, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  FileCheck, 
  Settings,
  LogOut,
  Shield,
  User
} from 'lucide-react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { 
    userRole, 
    loading, 
    getAllowedPages, 
    getRoleDisplayName,
    checkPageAccess 
  } = usePermission()

  // 處理登出
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        toast.error('登出失敗：' + error.message)
        return
      }
      
      toast.success('已成功登出')
      router.push('/auth/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('登出時發生錯誤')
    }
  }

  // 選單項目圖示映射
  const iconMap = {
    BarChart3,
    Users,
    Star,
    FileText,
    TrendingUp,
    Clock,
    CheckCircle,
    FileCheck,
    Settings,
  }

  if (loading) {
    return (
      <div className="w-64 bg-white shadow-sm border-r border-gray-200">
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-6"></div>
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!userRole) {
    return (
      <div className="w-64 bg-white shadow-sm border-r border-gray-200">
        <div className="p-6">
          <div className="text-center text-gray-500">
            <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>請重新登入</p>
          </div>
        </div>
      </div>
    )
  }

  // 取得用戶可存取的頁面
  const allowedPages = getAllowedPages()

  return (
    <div className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col h-full">
      {/* Logo 和用戶資訊 */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">報價系統</h1>
            <p className="text-sm text-gray-500">Quote Management</p>
          </div>
        </div>
        
        {/* 用戶角色標籤 */}
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
          <Shield className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">
            {getRoleDisplayName()}
          </span>
          <div className={`w-2 h-2 rounded-full ${
            userRole === 'Admin' ? 'bg-red-500' :
            userRole === 'Editor' ? 'bg-yellow-500' : 'bg-green-500'
          }`} />
        </div>
      </div>

      {/* 導覽選單 */}
      <nav className="flex-1 p-4 space-y-1">
        {allowedPages.map((page) => {
          const Icon = iconMap[page.icon as keyof typeof iconMap] || FileText
          const isActive = pathname === page.route || pathname.startsWith(page.route + '/')
          
          return (
            <Link
              key={page.key}
              href={page.route}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
              <span>{page.name}</span>
              
              {/* 權限限制標識 */}
              {(page.key === 'payment_requests' || page.key === 'confirmed_payments') && (
                <div className="ml-auto">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full" title="編輯者以上權限" />
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* 底部操作區 */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        {/* 系統設定 */}
        {checkPageAccess('settings') && (
          <Link
            href="/dashboard/settings"
            className={`
              flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${pathname === '/dashboard/settings'
                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }
            `}
          >
            <Settings className={`w-5 h-5 ${
              pathname === '/dashboard/settings' ? 'text-blue-600' : 'text-gray-500'
            }`} />
            <span>系統設定</span>
          </Link>
        )}
        
        {/* 登出按鈕 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors"
        >
          <LogOut className="w-5 h-5 text-gray-500 hover:text-red-500" />
          <span>登出</span>
        </button>
      </div>

      {/* 權限說明 */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>管理員 - 完整權限</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span>編輯者 - 審核權限</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>成員 - 基本操作</span>
          </div>
        </div>
      </div>
    </div>
  )
}