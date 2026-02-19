/* src/app/dashboard/reports/page.tsx*/
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Database } from '@/types/database.types'
import { formatCurrency, formatDate, exportToCSV } from '@/lib/utils'
import { toast } from 'sonner' // 【修正】加入了 toast 的 import
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/Skeleton'

// 定義從資料庫來的型別
type Quotation = Database['public']['Tables']['quotations']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type KOL = Pick<Database['public']['Tables']['kols']['Row'], 'id' | 'name'>
type QuotationItem = Database['public']['Tables']['quotation_items']['Row']

// 組合型別，讓報價單包含客戶和項目詳情
type QuotationWithDetails = Quotation & {
  clients?: Client | null // 客戶可能是 null
  quotation_items: QuotationItem[]
}

// 定義報表資料的結構
interface ReportData {
  totalQuotations: number
  totalRevenue: number
  avgQuotationValue: number
  conversionRate: number
  statusBreakdown: Record<string, number>
  monthlyRevenue: Array<{ month: string; revenue: number; count: number }>
  topClients: Array<{ client: string; revenue: number; quotations: number }>
  topKols: Array<{ kol: string; revenue: number; quotations: number }>
  serviceTypeBreakdown: Array<{ service: string; revenue: number; count: number }>
}

export default function ReportsPage() {
  const [quotations, setQuotations] = useState<QuotationWithDetails[]>([])
  const [kols, setKols] = useState<KOL[]>([])
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // 年初
    end: new Date().toISOString().split('T')[0] // 今天
  })
  const router = useRouter()

  useEffect(() => {
    fetchData()
  }, [dateRange])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 並行載入報價單與 KOL（只取 id + name）
      const [quotationsRes, kolsRes] = await Promise.all([
        supabase
          .from('quotations')
          .select(`*, clients(id, name), quotation_items(*)`)
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase
          .from('kols')
          .select('id, name'),
      ])

      if (quotationsRes.error) throw quotationsRes.error
      if (kolsRes.error) throw kolsRes.error

      const quotationsData = quotationsRes.data
      const kolsData = kolsRes.data

      setQuotations((quotationsData as QuotationWithDetails[]) || [])
      setKols(kolsData || [])

      if (quotationsData) {
        generateReportData(quotationsData as QuotationWithDetails[], kolsData || [])
      }

    } catch (error: unknown) {
      console.error('Error fetching data:', error)
      setError(error instanceof Error ? error.message : String(error))
      toast.error("載入報表資料失敗")
    } finally {
      setLoading(false)
    }
  }

  const generateReportData = (quotations: QuotationWithDetails[], kols: KOL[]) => {
    const totalQuotations = quotations.length
    const totalRevenue = quotations.reduce((sum, q) => {
      // 【修正】處理 null，提供預設值 0
      const amount = q.has_discount ? (q.discounted_price || 0) : (q.grand_total_taxed || 0)
      return sum + amount
    }, 0)
    const avgQuotationValue = totalQuotations > 0 ? totalRevenue / totalQuotations : 0
    
    const signedQuotations = quotations.filter(q => q.status === '已簽約').length
    const conversionRate = totalQuotations > 0 ? (signedQuotations / totalQuotations) * 100 : 0

    const statusBreakdown = quotations.reduce((acc, q) => {
      // 【修正】檢查 status 是否為 null
      if (q.status) {
        acc[q.status] = (acc[q.status] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    const monthlyData = quotations.reduce((acc, q) => {
      // 【修正】檢查 created_at 是否為 null
      if (q.created_at) {
        const month = new Date(q.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit' })
        const amount = q.has_discount ? (q.discounted_price || 0) : (q.grand_total_taxed || 0)
        
        if (!acc[month]) {
          acc[month] = { revenue: 0, count: 0 }
        }
        acc[month].revenue += amount
        acc[month].count += 1
      }
      return acc
    }, {} as Record<string, { revenue: number; count: number }>)

    const monthlyRevenue = Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month))

    const clientData = quotations.reduce((acc, q) => {
      if (!q.clients || !q.clients.name) return acc
      
      const clientName = q.clients.name
      const amount = q.has_discount ? (q.discounted_price || 0) : (q.grand_total_taxed || 0)
      
      if (!acc[clientName]) {
        acc[clientName] = { revenue: 0, quotations: 0 }
      }
      acc[clientName].revenue += amount
      acc[clientName].quotations += 1
      return acc
    }, {} as Record<string, { revenue: number; quotations: number }>)

    const topClients = Object.entries(clientData)
      .map(([client, data]) => ({ client, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const kolData = quotations.reduce((acc, q) => {
      q.quotation_items.forEach(item => {
        if (!item.kol_id) return
        
        const kol = kols.find(k => k.id === item.kol_id)
        if (!kol || !kol.name) return
        
        const kolName = kol.name
        // 【修正】處理 null，提供預設值 0
        const amount = (item.quantity || 0) * (item.price || 0)
        
        if (!acc[kolName]) {
          acc[kolName] = { revenue: 0, quotations: 0 }
        }
        acc[kolName].revenue += amount
        acc[kolName].quotations += 1
      })
      return acc
    }, {} as Record<string, { revenue: number; quotations: number }>)

    const topKols = Object.entries(kolData)
      .map(([kol, data]) => ({ kol, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const serviceData = quotations.reduce((acc, q) => {
      q.quotation_items.forEach(item => {
        // 【修正】檢查 service 是否為 null
        if (item.service) {
          const service = item.service
          const amount = (item.quantity || 0) * (item.price || 0)
          
          if (!acc[service]) {
            acc[service] = { revenue: 0, count: 0 }
          }
          acc[service].revenue += amount
          acc[service].count += 1
        }
      })
      return acc
    }, {} as Record<string, { revenue: number; count: number }>)

    const serviceTypeBreakdown = Object.entries(serviceData)
      .map(([service, data]) => ({ service, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    setReportData({
      totalQuotations,
      totalRevenue,
      avgQuotationValue,
      conversionRate,
      statusBreakdown,
      monthlyRevenue,
      topClients,
      topKols,
      serviceTypeBreakdown
    })
  }

  const handleExportCSV = () => {
    if (!quotations.length) {
        toast.info("No data to export.");
        return;
    }

    const exportData = quotations.map(q => ({
      報價單編號: q.id,
      專案名稱: q.project_name || '',
      客戶名稱: q.clients?.name || '未指定',
      聯絡人: q.client_contact || '',
      狀態: q.status || '',
      小計未稅: q.subtotal_untaxed || 0,
      稅金: q.tax || 0,
      合計含稅: q.grand_total_taxed || 0,
      有無優惠: q.has_discount ? '有' : '無',
      優惠價: q.discounted_price || 0,
      付款方式: q.payment_method || '',
      // 【修正】檢查日期是否為 null
      建立日期: q.created_at ? formatDate(q.created_at) : '',
      更新日期: q.updated_at ? formatDate(q.updated_at) : ''
    }))

    exportToCSV(exportData, `報價單報表_${dateRange.start}_${dateRange.end}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary p-6 space-y-6">
        <SkeletonPageHeader />
        <SkeletonStatCards count={4} />
        <SkeletonTable rows={8} columns={5} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <div className="bg-card shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">報表分析</h1>
              <p className="text-sm text-muted-foreground mt-1">
                營收統計與業績分析
              </p>
            </div>
            <div className="flex space-x-4">
              <Button 
                onClick={() => router.push('/dashboard')}
                variant="outline"
              >
                返回首頁
              </Button>
              <Button 
                onClick={handleExportCSV}
                className="bg-success hover:bg-success/90"
                disabled={!quotations.length}
              >
                � 匯出 CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">

          {error && (
            <div className="bg-destructive/15 border border-destructive/25 rounded-md p-4 mb-6">
              <div className="text-sm text-destructive">{error}</div>
            </div>
          )}

          {/* 日期範圍選擇 */}
          <div className="bg-card shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-foreground mb-4">
                報表時間範圍
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/70">開始日期</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                    className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/70">結束日期</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                    className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-2 border"
                  />
                </div>
              </div>
            </div>
          </div>

          {reportData && (
            <>
              {/* 核心指標 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-card overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">📋</span>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-muted-foreground truncate">
                            總報價單數
                          </dt>
                          <dd className="text-lg font-medium text-foreground">
                            {reportData.totalQuotations}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-card overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">💰</span>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-muted-foreground truncate">
                            總營收
                          </dt>
                          <dd className="text-lg font-medium text-foreground">
                            {formatCurrency(reportData.totalRevenue)}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-card overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">📈</span>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-muted-foreground truncate">
                            平均報價金額
                          </dt>
                          <dd className="text-lg font-medium text-foreground">
                            {formatCurrency(reportData.avgQuotationValue)}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-card overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">🎯</span>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-muted-foreground truncate">
                            簽約轉換率
                          </dt>
                          <dd className="text-lg font-medium text-foreground">
                            {reportData.conversionRate.toFixed(1)}%
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 狀態分佈 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-card shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-foreground mb-4">
                      報價單狀態分佈
                    </h3>
                    <div className="space-y-3">
                      {Object.entries(reportData.statusBreakdown).map(([status, count]) => {
                        const percentage = reportData.totalQuotations > 0 ? (count / reportData.totalQuotations) * 100 : 0
                        return (
                          <div key={status} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-foreground">{status}</span>
                              <span className="text-sm text-muted-foreground">({count})</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-20 bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full"
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-muted-foreground w-12 text-right">
                                {percentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* 月度營收趨勢 */}
                <div className="bg-card shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-foreground mb-4">
                      月度營收趨勢
                    </h3>
                    <div className="space-y-3">
                      {reportData.monthlyRevenue.map((data) => (
                        <div key={data.month} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-foreground">{data.month}</span>
                            <span className="text-sm text-muted-foreground">({data.count} 單)</span>
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {formatCurrency(data.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 客戶和 KOL 排行 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* 客戶排行 */}
                <div className="bg-card shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-foreground mb-4">
                      客戶營收排行 TOP 10
                    </h3>
                    {reportData.topClients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">暫無客戶數據</p>
                    ) : (
                      <div className="space-y-3">
                        {reportData.topClients.map((client, index) => (
                          <div key={client.client} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium text-primary">
                                {index + 1}
                              </span>
                              <div>
                                <span className="text-sm font-medium text-foreground">{client.client}</span>
                                <span className="text-xs text-muted-foreground block">{client.quotations} 筆報價</span>
                              </div>
                            </div>
                            <span className="text-sm font-medium text-foreground">
                              {formatCurrency(client.revenue)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* KOL 排行 */}
                <div className="bg-card shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-foreground mb-4">
                      KOL 營收排行 TOP 10
                    </h3>
                    {reportData.topKols.length === 0 ? (
                      <p className="text-sm text-muted-foreground">暫無 KOL 數據</p>
                    ) : (
                      <div className="space-y-3">
                        {reportData.topKols.map((kol, index) => (
                          <div key={kol.kol} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className="flex-shrink-0 w-6 h-6 bg-chart-4/15 rounded-full flex items-center justify-center text-xs font-medium text-chart-4">
                                {index + 1}
                              </span>
                              <div>
                                <span className="text-sm font-medium text-foreground">{kol.kol}</span>
                                <span className="text-xs text-muted-foreground block">{kol.quotations} 個項目</span>
                              </div>
                            </div>
                            <span className="text-sm font-medium text-foreground">
                              {formatCurrency(kol.revenue)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 服務類型分析 */}
              <div className="bg-card shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-foreground mb-4">
                    服務類型營收分析 TOP 10
                  </h3>
                  {reportData.serviceTypeBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暫無服務數據</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-secondary">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              排名
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              服務內容
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              項目數量
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              營收金額
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {reportData.serviceTypeBreakdown.map((service, index) => (
                            <tr key={service.service}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                                #{index + 1}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                                {service.service}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground text-right">
                                {service.count}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground text-right">
                                {formatCurrency(service.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}