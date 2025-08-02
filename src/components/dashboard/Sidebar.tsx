'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { 
  LayoutDashboard, 
  Users, 
  Star, 
  FileText, 
  BarChart3, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Receipt,
  Wallet
} from 'lucide-react'
import supabase from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface SidebarProps {
  className?: string
}

export default function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const toggleCollapsed = () => {
    setCollapsed(!collapsed)
  }

  const navigation = [
    {
      name: '儀表板',
      href: '/dashboard',
      icon: LayoutDashboard,
      current: pathname === '/dashboard'
    },
    {
      name: '客戶管理',
      href: '/dashboard/clients',
      icon: Users,
      current: pathname === '/dashboard/clients'
    },
    {
      name: 'KOL管理',
      href: '/dashboard/kols',
      icon: Star,
      current: pathname === '/dashboard/kols'
    },
    {
      name: '報價單',
      href: '/dashboard/quotes',
      icon: FileText,
      current: pathname.startsWith('/dashboard/quotes')
    },
    {
      name: '報表分析',
      href: '/dashboard/reports',
      icon: BarChart3,
      current: pathname === '/dashboard/reports'
    },
    // 🆕 新增請款功能區塊
    {
      name: '請款管理',
      href: '#',
      icon: Wallet,
      current: pathname.startsWith('/dashboard/pending-payments') || pathname.startsWith('/dashboard/payment-requests'),
      isGroup: true,
      children: [
        {
          name: '待請款管理',
          href: '/dashboard/pending-payments',
          icon: Receipt,
          current: pathname === '/dashboard/pending-payments',
          description: '管理已簽約項目的請款申請'
        },
        {
          name: '請款申請',
          href: '/dashboard/payment-requests',
          icon: CreditCard,
          current: pathname === '/dashboard/payment-requests',
          description: '審核和確認請款申請'
        }
      ]
    },
    {
      name: '系統設定',
      href: '/dashboard/settings',
      icon: Settings,
      current: pathname === '/dashboard/settings'
    }
  ]

  return (
    <div className={cn(
      "flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-300",
      collapsed ? "w-16" : "w-64",
      className
    )}>
      {/* Logo區域 */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        {!collapsed && (
          <h1 className="text-xl font-bold text-gray-900">
            KOL 管理系統
          </h1>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          className="p-2"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* 導航區域 */}
      <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {navigation.map((item) => {
          if (item.isGroup && item.children) {
            // 群組項目（請款管理）
            return (
              <div key={item.name} className="space-y-1">
                {/* 群組標題 */}
                <div className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md",
                  item.current
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}>
                  <item.icon className={cn(
                    "flex-shrink-0 h-5 w-5",
                    collapsed ? "mx-auto" : "mr-3"
                  )} />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.name}</span>
                    </>
                  )}
                </div>
                
                {/* 子項目 */}
                {!collapsed && (
                  <div className="ml-6 space-y-1">
                    {item.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.href}
                        className={cn(
                          "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                          child.current
                            ? "bg-indigo-100 text-indigo-700"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                        title={collapsed ? child.name : undefined}
                      >
                        <child.icon className={cn(
                          "flex-shrink-0 h-4 w-4",
                          "mr-3"
                        )} />
                        <div className="flex-1">
                          <div className="font-medium">{child.name}</div>
                          {child.description && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {child.description}
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          // 一般項目
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                item.current
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn(
                "flex-shrink-0 h-5 w-5",
                collapsed ? "mx-auto" : "mr-3"
              )} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* 登出按鈕 */}
      <div className="p-4 border-t border-gray-200">
        <Button
          onClick={handleLogout}
          variant="ghost"
          className={cn(
            "w-full justify-start text-gray-600 hover:text-gray-900 hover:bg-gray-50",
            collapsed && "justify-center"
          )}
          title={collapsed ? "登出" : undefined}
        >
          <LogOut className={cn(
            "h-5 w-5",
            collapsed ? "mx-auto" : "mr-3"
          )} />
          {!collapsed && <span>登出</span>}
        </Button>
      </div>
    </div>
  )
}