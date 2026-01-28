'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { User } from '@supabase/supabase-js'
import { Briefcase, Users, Star, DollarSign, FileText, UserPlus, StarOff } from 'lucide-react'
import Link from 'next/link'

// 重新設計的統計卡片元件
const StatCard = ({ title, value, icon: Icon }: { title: string, value: string | number, icon: React.ElementType }) => (
  <div className="bg-white p-6 rounded-lg shadow-md flex items-center">
    <div className="bg-indigo-500 text-white rounded-full p-3 flex-shrink-0">
      <Icon className="h-6 w-6" />
    </div>
    <div className="ml-4">
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  </div>
)

// 重新設計的快速功能按鈕
const ActionButton = ({ href, icon: Icon, text }: { href: string, icon: React.ElementType, text: string }) => (
  <Link href={href} className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-lg hover:bg-indigo-50 hover:shadow-sm transition-all border border-gray-200">
    <Icon className="h-8 w-8 text-indigo-600 mb-2" />
    <span className="font-semibold text-gray-700">{text}</span>
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
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">總覽</h1>
        <p className="text-gray-500 mt-1">歡迎回來，{user?.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="報價單總數" value={stats.quoteCount} icon={Briefcase} />
        <StatCard title="客戶數量" value={stats.clientCount} icon={Users} />
        <StatCard title="KOL 數量" value={stats.kolCount} icon={Star} />
        <StatCard title="本月簽約總額" value={`NT$ ${stats.monthlyTotal.toLocaleString()}`} icon={DollarSign} />
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">快速功能</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ActionButton href="/dashboard/quotes/new" icon={FileText} text="建立新報價單" />
          <ActionButton href="/dashboard/clients" icon={UserPlus} text="管理客戶" />
          <ActionButton href="/dashboard/kols" icon={StarOff} text="管理 KOL" />
        </div>
      </div>
    </div>
  )
}