'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Users,
  Star,
  FileText,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  FileCheck,
  Settings,
  LogOut,
  Shield,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Receipt,
  Calculator,
} from 'lucide-react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

// 帳務管理子選單定義
const ACCOUNTING_SUB_MENU = [
  { href: '/dashboard/accounting', label: '總覽', icon: BookOpen },
  { href: '/dashboard/accounting/sales', label: '銷項管理', icon: Receipt },
  { href: '/dashboard/accounting/expenses', label: '進項管理', icon: TrendingDown },
  { href: '/dashboard/accounting/payroll', label: '人事薪資', icon: Users },
  { href: '/dashboard/accounting/projects', label: '專案損益', icon: BarChart3 },
  { href: '/dashboard/accounting/calculator', label: '利潤試算', icon: Calculator },
  { href: '/dashboard/accounting/reports', label: '歷年報表', icon: FileText },
]

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

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [accountingOpen, setAccountingOpen] = useState(false)

  // 如果目前在帳務頁面，自動展開子選單
  useEffect(() => {
    if (pathname.startsWith('/dashboard/accounting')) {
      setAccountingOpen(true)
    }
  }, [pathname])

  // 響應式處理：小螢幕預設收合
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsCollapsed(true)
      } else {
        setIsCollapsed(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
    BookOpen,
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

  const allowedPages = getAllowedPages()
  const isAccountingActive = pathname.startsWith('/dashboard/accounting')

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
            isCollapsed && "absolute top-4 right-4 border border-white"
          )} />
        </div>
      </div>

      {/* 導覽選單 */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {allowedPages.map((page) => {
          const Icon = iconMap[page.icon as keyof typeof iconMap] || FileText
          const isActive = pathname === page.route || pathname.startsWith(page.route + '/')
          const isAccounting = page.key === 'accounting'

          // 帳務管理：可展開子選單
          if (isAccounting) {
            return (
              <div key={page.key}>
                <button
                  onClick={() => {
                    if (isCollapsed) {
                      router.push('/dashboard/accounting')
                    } else {
                      setAccountingOpen(!accountingOpen)
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group relative",
                    isAccountingActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                    isCollapsed && "justify-center px-2"
                  )}
                  title={isCollapsed ? page.name : undefined}
                >
                  <Icon className={cn("w-5 h-5 flex-shrink-0", isAccountingActive ? 'text-blue-600' : 'text-gray-500')} />
                  <span className={cn(
                    "whitespace-nowrap transition-all duration-300 flex-1 text-left",
                    isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100"
                  )}>
                    {page.name}
                  </span>
                  {!isCollapsed && (
                    <ChevronDown className={cn(
                      "w-4 h-4 text-gray-400 transition-transform duration-200",
                      accountingOpen && "rotate-180"
                    )} />
                  )}

                  {/* 收合 tooltip */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                      {page.name}
                    </div>
                  )}
                </button>

                {/* 子選單 */}
                {!isCollapsed && (
                  <div className={cn(
                    "overflow-hidden transition-all duration-200",
                    accountingOpen ? "max-h-96 mt-1" : "max-h-0"
                  )}>
                    <div className="ml-4 pl-4 border-l-2 border-gray-200 space-y-0.5">
                      {ACCOUNTING_SUB_MENU.map((sub) => {
                        const SubIcon = sub.icon
                        const isSubActive = pathname === sub.href
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={cn(
                              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                              isSubActive
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                            )}
                          >
                            <SubIcon className={cn("w-3.5 h-3.5 flex-shrink-0", isSubActive ? 'text-blue-600' : 'text-gray-400')} />
                            {sub.label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          }

          // 一般選單項目
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

              {/* 收合時的懸浮提示 */}
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
