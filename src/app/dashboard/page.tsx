'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { User } from '@supabase/supabase-js'
import { Briefcase, Users, Star, DollarSign, FileText, UserPlus, StarOff, TrendingUp } from 'lucide-react'
import Link from 'next/link'

// 重新設計的統計卡片元件 - Dark Tech 風格
const StatCard = ({ title, value, icon: Icon, accent }: { title: string, value: string | number, icon: React.ElementType, accent: string }) => (
  <div className="bg-card border border-border rounded-xl p-5 hover:border-emerald-500/30 transition-all duration-300 group">
    <div className="flex items-center gap-4">
      <div className={`${accent} rounded-lg p-2.5 flex-shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground font-medium truncate">{title}</p>
        <p className="text-2xl font-bold text-foreground font-mono tracking-tight">{value}</p>
      </div>
    </div>
  </div>
)

// 重新設計的快速功能按鈕
const ActionButton = ({ href, icon: Icon, text }: { href: string, icon: React.ElementType, text: string }) => (
  <Link href={href} className="flex flex-col items-center justify-center p-5 bg-card border border-border rounded-xl hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all duration-300 group">
    <Icon className="h-7 w-7 text-muted-foreground group-hover:text-emerald-400 mb-2 transition-colors" />
    <span className="font-medium text-sm text-foreground">{text}</span>
  </Link>
)

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    quoteCount: 0,
    clientCount: 0,
    kolCount: 0,
    monthlyTotal: 0,
  })
  const router = useRouter()

  const fetchUserAndStats = useCallback(async () => {
    setLoading(true);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      console.error('Session error or no user found:', sessionError)
      router.push('/auth/login')
      return
    }

    setUser(session.user)

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 1).toISOString().split('T')[0];

      const [quoteRes, clientRes, kolRes, monthlyTotalRes] = await Promise.all([
        supabase.from('quotations').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('kols').select('*', { count: 'exact', head: true }),
        supabase
          .from('quotations')
          .select('grand_total_taxed')
          .eq('status', '已簽約')
          .gte('created_at', startDate)
          .lt('created_at', endDate),
      ]);

      const monthlyTotal = monthlyTotalRes.data?.reduce((sum, item) => sum + (item.grand_total_taxed || 0), 0) || 0;

      setStats({
        quoteCount: quoteRes.count ?? 0,
        clientCount: clientRes.count ?? 0,
        kolCount: kolRes.count ?? 0,
        monthlyTotal: monthlyTotal,
      });

    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    } finally {
      setLoading(false)
    }
  }, [router]);

  useEffect(() => {
    fetchUserAndStats()
  }, [fetchUserAndStats])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-emerald-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">總覽</h1>
        <p className="text-muted-foreground mt-1 text-sm">歡迎，{user?.email}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="報價單總數" value={stats.quoteCount} icon={Briefcase} accent="bg-emerald-500/15 text-emerald-400" />
        <StatCard title="客戶數量" value={stats.clientCount} icon={Users} accent="bg-sky-500/15 text-sky-400" />
        <StatCard title="KOL 數量" value={stats.kolCount} icon={Star} accent="bg-amber-500/15 text-amber-400" />
        <StatCard title="本月簽約總額" value={`NT$ ${stats.monthlyTotal.toLocaleString()}`} icon={DollarSign} accent="bg-rose-500/15 text-rose-400" />
      </div>

      <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">快速功能</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <ActionButton href="/dashboard/quotes/new" icon={FileText} text="建立新報價單" />
          <ActionButton href="/dashboard/clients" icon={UserPlus} text="管理客戶" />
          <ActionButton href="/dashboard/kols" icon={StarOff} text="管理 KOL" />
        </div>
      </div>
    </div>
  )
}