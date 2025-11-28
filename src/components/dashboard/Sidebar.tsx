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
  User,
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

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

  // 側邊欄收合狀態
  const [isCollapsed, setIsCollapsed] = useState(false)

  // 響應式處理：小螢幕預設收合
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) { // lg breakpoint
        setIsCollapsed(true)
      } else {
        setIsCollapsed(false)
      }
    }

    // 初始檢查
    handleResize()

    // 監聽視窗大小變化
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
      <div className={cn("bg-white shadow-sm border-r border-gray-200 transition-all duration-300", isCollapsed ? "w-20" : "w-64")}>
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
      <div className={cn("bg-white shadow-sm border-r border-gray-200 transition-all duration-300", isCollapsed ? "w-20" : "w-64")}>
        <div className="p-6">
          <div className="text-center text-gray-500">
            <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className={cn("transition-opacity duration-200", isCollapsed ? "opacity-0 hidden" : "opacity-100")}>請重新登入</p>
          </div>
        </div>
      </div>
    )
  }

  // 取得用戶可存取的頁面
  const allowedPages = getAllowedPages()

  return (
    <div className={cn(
      "bg-white shadow-sm border-r border-gray-200 flex flex-col h-full transition-all duration-300 relative",
      isCollapsed ? "w-20" : "w-64"
    )}>

      {/* 收合切換按鈕 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-8 bg-white border border-gray-200 rounded-full p-1 shadow-sm hover:bg-gray-50 z-10"
        title={isCollapsed ? "展開選單" : "收起選單"}
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-600" /> : <ChevronLeft className="w-4 h-4 text-gray-600" />}
      </button>

      {/* Logo 和用戶資訊 */}
      <div className={cn("border-b border-gray-200 transition-all duration-300", isCollapsed ? "p-4" : "p-6")}>
        <div className={cn("flex items-center gap-3 mb-4", isCollapsed && "justify-center mb-2")}>
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div className={cn("overflow-hidden transition-all duration-300", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
            <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">後台管理</h1>
            <p className="text-sm text-gray-500 whitespace-nowrap">Quote System</p>
          </div>
        </div>

        {/* 用戶角色標籤 */}
        <div className={cn(
          "flex items-center gap-2 bg-gray-50 rounded-lg transition-all duration-300",
          isCollapsed ? "justify-center p-2 bg-transparent" : "p-2"
        )}>
          <Shield className={cn("w-4 h-4 text-blue-600 flex-shrink-0", isCollapsed && "w-5 h-5")} />
          <span className={cn(
            "text-sm font-medium text-gray-700 whitespace-nowrap transition-all duration-300",
            isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100"
          )}>
            {getRoleDisplayName()}
          </span>
          <div className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            userRole === 'Admin' ? 'bg-red-500' :
              userRole === 'Editor' ? 'bg-yellow-500' : 'bg-green-500',
            isCollapsed && "absolute top-4 right-4 border border-white" // 收合時顯示為狀態點
          )} />
        </div>
      </div>

      {/* 導覽選單 */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {allowedPages.map((page) => {
          const Icon = iconMap[page.icon as keyof typeof iconMap] || FileText
          const isActive = pathname === page.route || pathname.startsWith(page.route + '/')

          return (
            <Link
              key={page.key}
              href={page.route}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group relative",
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                isCollapsed && "justify-center px-2"
              )}
              title={isCollapsed ? page.name : undefined}
            >
              <Icon className={cn("w-5 h-5 flex-shrink-0", isActive ? 'text-blue-600' : 'text-gray-500')} />
              <span className={cn(
                "whitespace-nowrap transition-all duration-300",
                isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100"
              )}>
                {page.name}
              </span>

              {/* 權限限制標識 */}
              {(page.key === 'payment_requests' || page.key === 'confirmed_payments') && !isCollapsed && (
                <div className="ml-auto">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full" title="編輯者以上權限" />
                </div>
              )}

              {/* 收合時的懸浮提示 (Tooltip) */}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                  {page.name}
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* 底部操作區 */}
      <div className="p-4 border-t border-gray-200 space-y-2">

        {/* 登出按鈕 */}
        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors",
            isCollapsed && "justify-center px-2"
          )}
          title={isCollapsed ? "登出" : undefined}
        >
          <LogOut className="w-5 h-5 text-gray-500 hover:text-red-500 flex-shrink-0" />
          <span className={cn(
            "whitespace-nowrap transition-all duration-300",
            isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100"
          )}>
            登出
          </span>
        </button>
      </div>
    </div>
  )
}