'use client'

import { useQuery } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ---- 型別定義 ----

export interface DashboardData {
  kpiCards: {
    monthlyRevenue: number
    conversionRate: number
    outstandingPayments: { count: number; amount: number }
    activeProjects: number
  }
  sparklines: {
    revenue: number[]
    conversionRate: number[]
    outstandingPayments: number[]
    activeProjects: number[]
  }
  monthLabels: string[]
  revenueChartData: Array<{ month: string; revenue: number }>
  quoteStatusDistribution: Array<{ name: string; value: number; color: string }>
  actionItems: {
    pendingReview: number
    pendingSignature: number
    approvedPendingConfirm: number
  }
}

// ---- 工具函式 ----

/** 取得最近 N 個月的月份起始日陣列（含當月） */
function getMonthBuckets(count: number): { start: Date; label: string }[] {
  const buckets: { start: Date; label: string }[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      start: d,
      label: `${d.getMonth() + 1}月`,
    })
  }
  return buckets
}

/** 將 ISO 日期字串歸入月份 bucket index */
function getMonthIndex(dateStr: string, buckets: { start: Date }[]): number {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = d.getMonth()
  return buckets.findIndex(
    (b) => b.start.getFullYear() === year && b.start.getMonth() === month
  )
}

// ---- 狀態配色 ----

const STATUS_COLORS: Record<string, string> = {
  草稿: '#64748b',
  待簽約: '#f59e0b',
  已簽約: '#10b981',
  已歸檔: '#6366f1',
}

// ---- 資料取得 ----

async function fetchDashboardData(): Promise<DashboardData> {
  const buckets = getMonthBuckets(6)
  const sixMonthsAgo = buckets[0].start.toISOString()

  // 平行查詢（限制近 6 個月，避免全表掃描）
  const [quotationsRes, paymentRes, clientCountRes, kolCountRes] =
    await Promise.all([
      supabase
        .from('quotations')
        .select('status, created_at, grand_total_taxed')
        .gte('created_at', sixMonthsAgo),
      supabase
        .from('payment_requests')
        .select('verification_status, cost_amount, created_at')
        .gte('created_at', sixMonthsAgo),
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('kols').select('*', { count: 'exact', head: true }),
    ])

  if (quotationsRes.error) throw quotationsRes.error
  if (paymentRes.error) throw paymentRes.error

  const quotations = quotationsRes.data ?? []
  const payments = paymentRes.data ?? []

  // ---- 月份分組計算 ----

  // 月營收 sparkline
  const monthlyRevenue = new Array(6).fill(0)
  // 月簽約率 sparkline
  const monthlySignedCount = new Array(6).fill(0)
  const monthlyTotalCount = new Array(6).fill(0)
  // 月活躍專案 sparkline
  const monthlyActive = new Array(6).fill(0)

  for (const q of quotations) {
    const idx = getMonthIndex(q.created_at, buckets)
    if (idx >= 0) {
      monthlyTotalCount[idx]++
      if (q.status === '已簽約') {
        monthlyRevenue[idx] += q.grand_total_taxed || 0
        monthlySignedCount[idx]++
      }
      if (q.status === '待簽約' || q.status === '已簽約') {
        monthlyActive[idx]++
      }
    }
  }

  const monthlyConversionRate = monthlyTotalCount.map((total, i) =>
    total > 0 ? Math.round((monthlySignedCount[i] / total) * 100) : 0
  )

  // 月待收款 sparkline
  const monthlyOutstanding = new Array(6).fill(0)
  for (const p of payments) {
    if (p.verification_status === 'approved') {
      const idx = getMonthIndex(p.created_at, buckets)
      if (idx >= 0) {
        monthlyOutstanding[idx] += p.cost_amount || 0
      }
    }
  }

  // ---- 當月 KPI ----

  const currentMonthRevenue = monthlyRevenue[5]
  const totalQuotations = quotations.length
  const signedQuotations = quotations.filter((q) => q.status === '已簽約').length
  const conversionRate =
    totalQuotations > 0
      ? Math.round((signedQuotations / totalQuotations) * 100 * 10) / 10
      : 0

  const approvedPayments = payments.filter(
    (p) => p.verification_status === 'approved'
  )
  const outstandingAmount = approvedPayments.reduce(
    (sum, p) => sum + (p.cost_amount || 0),
    0
  )

  const activeProjects = quotations.filter(
    (q) => q.status === '待簽約' || q.status === '已簽約'
  ).length

  // ---- 報價單狀態分布 ----

  const statusCounts: Record<string, number> = {}
  for (const q of quotations) {
    statusCounts[q.status] = (statusCounts[q.status] || 0) + 1
  }
  const quoteStatusDistribution = Object.entries(statusCounts).map(
    ([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || '#94a3b8',
    })
  )

  // ---- 待辦事項 ----

  const pendingReview = payments.filter(
    (p) => p.verification_status === 'pending'
  ).length
  const pendingSignature = quotations.filter(
    (q) => q.status === '待簽約'
  ).length
  const approvedPendingConfirm = approvedPayments.length

  // ---- 折線圖資料 ----

  const revenueChartData = buckets.map((b, i) => ({
    month: b.label,
    revenue: monthlyRevenue[i],
  }))

  return {
    kpiCards: {
      monthlyRevenue: currentMonthRevenue,
      conversionRate,
      outstandingPayments: {
        count: approvedPayments.length,
        amount: outstandingAmount,
      },
      activeProjects,
    },
    sparklines: {
      revenue: monthlyRevenue,
      conversionRate: monthlyConversionRate,
      outstandingPayments: monthlyOutstanding,
      activeProjects: monthlyActive,
    },
    monthLabels: buckets.map((b) => b.label),
    revenueChartData,
    quoteStatusDistribution,
    actionItems: {
      pendingReview,
      pendingSignature,
      approvedPendingConfirm,
    },
  }
}

// ---- Hook ----

export function useDashboardData() {
  return useQuery({
    queryKey: [...queryKeys.dashboardStats],
    queryFn: fetchDashboardData,
    staleTime: 5 * 60 * 1000,
  })
}
