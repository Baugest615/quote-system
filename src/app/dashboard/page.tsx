'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import {
  DollarSign,
  TrendingUp,
  Clock,
  Briefcase,
  FileText,
  UserPlus,
  Star,
} from 'lucide-react'
import Link from 'next/link'

import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import { useDashboardData } from '@/hooks/dashboard/useDashboardData'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { ActionItems } from '@/components/dashboard/ActionItems'

const RevenueChart = dynamic(
  () => import('@/components/dashboard/RevenueChart').then(m => ({ default: m.RevenueChart })),
  { loading: () => <div className="h-64 bg-muted/50 animate-pulse rounded-lg" />, ssr: false }
)
const QuoteStatusChart = dynamic(
  () => import('@/components/dashboard/QuoteStatusChart').then(m => ({ default: m.QuoteStatusChart })),
  { loading: () => <div className="h-64 bg-muted/50 animate-pulse rounded-lg" />, ssr: false }
)

// 快速功能按鈕
function QuickAction({
  href,
  icon: Icon,
  text,
}: {
  href: string
  icon: React.ElementType
  text: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-all duration-200 group"
    >
      <Icon className="h-5 w-5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
      <span className="text-sm font-medium text-foreground">{text}</span>
    </Link>
  )
}

// 載入骨架
function DashboardSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl animate-pulse">
      <div>
        <div className="h-8 w-24 bg-muted rounded" />
        <div className="h-4 w-48 bg-muted rounded mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 h-72" />
        <div className="bg-card border border-border rounded-xl p-6 h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 h-48 lg:col-span-2" />
        <div className="bg-card border border-border rounded-xl p-6 h-48" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const router = useRouter()

  const { data, isLoading: dataLoading } = useDashboardData()

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()
      if (error || !session?.user) {
        router.push('/auth/login')
        return
      }
      setUser(session.user)
      setAuthLoading(false)
    }
    checkAuth()
  }, [router])

  if (authLoading || dataLoading || !data) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* 標題 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">總覽</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          歡迎，{user?.email}
        </p>
      </div>

      {/* Section 1: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="本月營收"
          value={formatCurrency(data.kpiCards.monthlyRevenue)}
          icon={DollarSign}
          accentColor="text-emerald-400"
          accentBg="bg-emerald-500/15"
          sparklineData={data.sparklines.revenue}
          sparklineColor="#10b981"
        />
        <KpiCard
          title="簽約率"
          value={`${data.kpiCards.conversionRate}%`}
          icon={TrendingUp}
          accentColor="text-sky-400"
          accentBg="bg-sky-500/15"
          sparklineData={data.sparklines.conversionRate}
          sparklineColor="#0ea5e9"
        />
        <KpiCard
          title="待收款"
          value={formatCurrency(data.kpiCards.outstandingPayments.amount)}
          icon={Clock}
          accentColor="text-amber-400"
          accentBg="bg-amber-500/15"
          sparklineData={data.sparklines.outstandingPayments}
          sparklineColor="#f59e0b"
        />
        <KpiCard
          title="活躍專案"
          value={`${data.kpiCards.activeProjects}`}
          icon={Briefcase}
          accentColor="text-rose-400"
          accentBg="bg-rose-500/15"
          sparklineData={data.sparklines.activeProjects}
          sparklineColor="#f43f5e"
        />
      </div>

      {/* Section 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart data={data.revenueChartData} />
        <QuoteStatusChart data={data.quoteStatusDistribution} />
      </div>

      {/* Section 3: Action Items + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ActionItems {...data.actionItems} />
        </div>
        <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
          <h3 className="text-base font-bold text-foreground mb-4">
            快速功能
          </h3>
          <div className="space-y-1">
            <QuickAction
              href="/dashboard/quotes/new"
              icon={FileText}
              text="建立新報價單"
            />
            <QuickAction
              href="/dashboard/clients"
              icon={UserPlus}
              text="管理客戶"
            />
            <QuickAction
              href="/dashboard/kols"
              icon={Star}
              text="管理 KOL"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
