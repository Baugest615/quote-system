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
  ChevronDown,
  BookOpen,
  Receipt,
  Calculator,
  X,
  Menu
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

  // 行動裝置 overlay 狀態
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // 帳務管理子選單展開狀態
  const [accountingOpen, setAccountingOpen] = useState(false)

  // 如果目前在帳務頁面，自動展開子選單
  useEffect(() => {
    if (pathname.startsWith('/dashboard/accounting')) {
      setAccountingOpen(true)
    }
  }, [pathname])

  // 響應式偵測
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth >= 1024) {
        setIsMobileOpen(false)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 路由變更時關閉行動選單
  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

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

  // 漢堡選單按鈕（行動裝置用）
  const MobileMenuButton = () => (
    <button
      onClick={() => setIsMobileOpen(true)}
      className="lg:hidden fixed top-4 left-4 z-50 bg-secondary/80 backdrop-blur-sm border border-border rounded-lg p-2.5 shadow-lg"
      aria-label="開啟選單"
    >
      <Menu className="w-5 h-5 text-foreground" />
    </button>
  )

  if (loading) {
    return (
      <>
        <MobileMenuButton />
        <div className="hidden lg:block w-64 bg-card border-r border-border">
          <div className="p-6">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded mb-6"></div>
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (!userRole) {
    return (
      <>
        <MobileMenuButton />
        <div className="hidden lg:block w-64 bg-card border-r border-border">
          <div className="p-6">
            <div className="text-center text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-4 text-muted" />
              <p>請重新登入</p>
            </div>
          </div>
        </div>
      </>
    )
  }

  const allowedPages = getAllowedPages()
  const isAccountingActive = pathname.startsWith('/dashboard/accounting')

  const sidebarContent = (
    <div className={cn(
      "bg-card border-r border-border flex flex-col h-full",
      isMobile ? "w-72" : "w-64"
    )}>

      {/* 關閉按鈕（行動裝置） */}
      {isMobile && (
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          aria-label="關閉選單"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Logo 和用戶資訊 */}
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">報價管理</h1>
            <p className="text-xs text-muted-foreground">Quote System</p>
          </div>
        </div>

        {/* 用戶角色標籤 */}
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
          <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-medium text-foreground/80">
            {getRoleDisplayName()}
          </span>
          <div className={cn(
            "w-2 h-2 rounded-full flex-shrink-0 ml-auto",
            userRole === 'Admin' ? 'bg-rose-400' :
              userRole === 'Editor' ? 'bg-amber-400' : 'bg-emerald-400'
          )} />
        </div>
      </div>

      {/* 導覽選單 */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {allowedPages.map((page) => {
          const Icon = iconMap[page.icon as keyof typeof iconMap] || FileText
          const isActive = pathname === page.route || pathname.startsWith(page.route + '/')
          const isAccounting = page.key === 'accounting'

          // 帳務管理：可展開子選單
          if (isAccounting) {
            return (
              <div key={page.key}>
                <button
                  onClick={() => setAccountingOpen(!accountingOpen)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                    isAccountingActive
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {isAccountingActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-full" />
                  )}
                  <Icon className={cn("w-[18px] h-[18px] flex-shrink-0", isAccountingActive ? 'text-emerald-400' : 'text-muted-foreground group-hover:text-foreground')} />
                  <span className="flex-1 text-left">{page.name}</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform duration-200",
                    accountingOpen && "rotate-180"
                  )} />
                </button>

                {/* 子選單 */}
                <div className={cn(
                  "overflow-hidden transition-all duration-200",
                  accountingOpen ? "max-h-96 mt-1" : "max-h-0"
                )}>
                  <div className="ml-4 pl-4 border-l-2 border-border space-y-0.5">
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
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <SubIcon className={cn("w-3.5 h-3.5 flex-shrink-0", isSubActive ? 'text-emerald-400' : 'text-muted-foreground')} />
                          {sub.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          }

          // 一般選單項目
          return (
            <Link
              key={page.key}
              href={page.route}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {/* 活動指示條 */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-full" />
              )}
              <Icon className={cn("w-[18px] h-[18px] flex-shrink-0", isActive ? 'text-emerald-400' : 'text-muted-foreground group-hover:text-foreground')} />
              <span>{page.name}</span>

              {/* 權限限制標識 */}
              {(page.key === 'payment_requests' || page.key === 'confirmed_payments') && (
                <div className="ml-auto">
                  <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" title="編輯者以上權限" />
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* 底部操作區 */}
      <div className="p-4 border-t border-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200"
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          <span>登出</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <MobileMenuButton />

      {/* 桌面版：固定側邊欄 */}
      <div className="hidden lg:block flex-shrink-0">
        {sidebarContent}
      </div>

      {/* 行動裝置：Overlay 側滑選單 */}
      {isMobile && isMobileOpen && (
        <div className="fixed inset-0 z-[60]">
          {/* 半透明遮罩 */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
          {/* 側邊欄 */}
          <div className="absolute left-0 top-0 h-full animate-in slide-in-from-left duration-300">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
