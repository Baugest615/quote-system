'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Search, 
  Building2, 
  FileText, 
  Trash2, 
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Download,
  Calendar,
  DollarSign
} from 'lucide-react'
import { toast } from 'sonner'

// 類型定義
type PaymentConfirmation = Database['public']['Tables']['payment_confirmations']['Row']
type PaymentConfirmationItem = Database['public']['Tables']['payment_confirmation_items']['Row']

type PaymentConfirmationWithItems = PaymentConfirmation & {
  payment_confirmation_items: (PaymentConfirmationItem & {
    payment_requests: {
      quotation_item_id: string
      quotation_items: {
        kol_id: string
        kols: {
          bank_info: any
        } | null
      } | null
    } | null
  })[]
  isExpanded?: boolean
}

type ConfirmationDisplayItem = {
  id: string
  project_name: string
  kol_name: string
  service: string
  quantity: number
  price: number
}

type AccountGroup = {
  accountName: string
  bankName: string
  branchName: string
  accountNumber: string
  items: ConfirmationDisplayItem[]
  totalAmount: number
}

export default function ConfirmedPaymentsPage() {
  const [confirmedPayments, setConfirmedPayments] = useState<PaymentConfirmationWithItems[]>([])
  const [filteredPayments, setFilteredPayments] = useState<PaymentConfirmationWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'date' | 'amount' | 'items'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const fetchConfirmedPayments = useCallback(async () => {
    setLoading(true)
    try {
      const { data: confirmations, error: confirmError } = await supabase
        .from('payment_confirmations')
        .select(`
          *,
          payment_confirmation_items (
            *,
            payment_requests (
              quotation_item_id,
              quotation_items (
                kol_id,
                kols ( bank_info )
              )
            )
          )
        `)
        .order('confirmation_date', { ascending: false })
      
      if (confirmError) throw confirmError
      
      const paymentsWithState = (confirmations || []).map(p => ({ ...p, isExpanded: false }))
      setConfirmedPayments(paymentsWithState as PaymentConfirmationWithItems[])
      setFilteredPayments(paymentsWithState as PaymentConfirmationWithItems[])
      
    } catch (error: any) {
      console.error('載入已確認請款記錄失敗:', error)
      toast.error('載入請款記錄失敗: ' + error.message)
      setConfirmedPayments([]); setFilteredPayments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfirmedPayments() }, [fetchConfirmedPayments])
  useEffect(() => {
    // ... 搜尋功能不變 ...
    const filtered = confirmedPayments.filter((confirmation) => {
      const searchLower = searchTerm.toLowerCase()
      const confirmationDate = confirmation.confirmation_date
      const hasMatchingItem = confirmation.payment_confirmation_items.some(item => 
        (item.project_name_at_confirmation || '').toLowerCase().includes(searchLower) ||
        (item.kol_name_at_confirmation || '').toLowerCase().includes(searchLower) ||
        (item.service_at_confirmation || '').toLowerCase().includes(searchLower)
      )
      return (confirmationDate || '').includes(searchTerm) || hasMatchingItem
    })
    setFilteredPayments(filtered)
  }, [confirmedPayments, searchTerm])

  const handleSort = (field: 'date' | 'amount' | 'items') => {
    // ... 排序功能不變 ...
    const direction = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortField(field); setSortDirection(direction)
    const sorted = [...filteredPayments].sort((a, b) => {
      let aValue: any, bValue: any
      switch (field) {
        case 'date': aValue = new Date(a.confirmation_date); bValue = new Date(b.confirmation_date); break
        case 'amount': aValue = a.total_amount; bValue = b.total_amount; break
        case 'items': aValue = a.total_items; bValue = b.total_items; break
        default: return 0
      }
      if (direction === 'asc') return aValue > bValue ? 1 : -1
      else return aValue < bValue ? 1 : -1
    })
    setFilteredPayments(sorted)
  }

  const toggleExpansion = (index: number) => {
    // ... 切換展開狀態不變 ...
    setFilteredPayments(prev => prev.map((confirmation, i) => 
      i === index ? { ...confirmation, isExpanded: !confirmation.isExpanded } : confirmation
    ))
  }

  // ✨ 再次修正與確認：退回操作
  const revertConfirmedPayment = async (confirmation: PaymentConfirmationWithItems) => {
    const confirmationId = confirmation.id;
    const itemsToRevert = confirmation.payment_confirmation_items;

    if (!itemsToRevert || itemsToRevert.length === 0) {
      toast.error('此確認清單沒有項目可退回。');
      return;
    }

    if (!window.confirm(`確定要將此清單中的 ${itemsToRevert.length} 筆項目退回到「請款申請」頁面嗎？`)) return;

    try {
      // 1. 取得所有需要退回的 payment_request_id
      const requestIdsToRevert = itemsToRevert.map(item => item.payment_request_id);

      // 2. 刪除關聯的 payment_confirmation_items 記錄 (必須先刪除子表)
      const { error: itemsError } = await supabase
        .from('payment_confirmation_items')
        .delete()
        .eq('payment_confirmation_id', confirmationId);
      if (itemsError) throw new Error(`刪除確認項目失敗: ${itemsError.message}`);
      
      // 3. 刪除 payment_confirmations 主記錄
      const { error: confirmationError } = await supabase
        .from('payment_confirmations')
        .delete()
        .eq('id', confirmationId);
      if (confirmationError) throw new Error(`刪除確認主記錄失敗: ${confirmationError.message}`);
      
      // 4. 將這些 payment_requests 的狀態更新回 'pending' (最後執行，避免外鍵約束問題)
      const { error: updateError } = await supabase
        .from('payment_requests')
        .update({ verification_status: 'pending' })
        .in('id', requestIdsToRevert);
      if (updateError) throw new Error(`退回項目狀態失敗: ${updateError.message}`);
      
      toast.success('清單已退回，相關項目已回到「請款申請」頁面。');
      await fetchConfirmedPayments(); // 重新載入資料

    } catch (error: any) {
      console.error('退回請款清單失敗:', error);
      toast.error('操作失敗: ' + error.message);
      // 如果失敗，最好也刷新一下頁面以顯示當前最新狀態
      await fetchConfirmedPayments();
    }
  }

  const groupItemsByAccount = (confirmationItems: any[]): AccountGroup[] => {
    // ... 分組功能不變 ...
    const groups = new Map<string, AccountGroup>()
    confirmationItems.forEach(item => {
      const key = item.kol_name_at_confirmation
      if (!groups.has(key)) {
        let bankInfo = { bankName: '未設定', branchName: '', accountNumber: '未設定' }
        const kolBankInfo = item.payment_requests?.quotation_items?.kols?.bank_info;
        if (kolBankInfo && typeof kolBankInfo === 'object') {
          bankInfo = { bankName: kolBankInfo.bankName || '未設定', branchName: kolBankInfo.branchName || '', accountNumber: kolBankInfo.accountNumber || '未設定' }
        }
        groups.set(key, {
          accountName: item.kol_name_at_confirmation, bankName: bankInfo.bankName, branchName: bankInfo.branchName,
          accountNumber: bankInfo.accountNumber, items: [], totalAmount: 0
        })
      }
      const group = groups.get(key)!
      group.items.push({
        id: item.payment_request_id, project_name: item.project_name_at_confirmation, kol_name: item.kol_name_at_confirmation,
        service: item.service_at_confirmation, quantity: 1, price: item.amount_at_confirmation,
      })
      group.totalAmount += item.amount_at_confirmation
    })
    return Array.from(groups.values())
  }
  
  const exportToCSV = (confirmation: PaymentConfirmationWithItems) => {
    // ... CSV 導出功能不變 ...
    const accountGroups = groupItemsByAccount(confirmation.payment_confirmation_items)
    const csvData: (string|number)[][] = []
    csvData.push(['確認日期', '戶名', '銀行資訊', '專案名稱', 'KOL', '服務項目', '金額'])
    accountGroups.forEach(group => {
      const bankInfo = `${group.bankName} ${group.branchName} | ${group.accountNumber}`
      group.items.forEach(item => {
        csvData.push([
          confirmation.confirmation_date, group.accountName, bankInfo,
          item.project_name, item.kol_name, item.service, item.price
        ])
      })
    })
    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url); link.setAttribute('download', `請款清單_${confirmation.confirmation_date}.csv`)
    link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link)
    toast.success('CSV檔案已下載')
  }

  // ... (return JSX 不變) ...
    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">已確認請款清單</h1>
                    <p className="text-gray-500 mt-1">檢視和管理已確認的請款清單</p>
                </div>
                <div className="flex space-x-2">
                    <Button onClick={fetchConfirmedPayments} variant="outline" disabled={loading} className="text-blue-600 hover:text-blue-700">
                        <RefreshCw className="h-4 w-4 mr-2" />重新載入
                    </Button>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input placeholder="搜尋日期、專案名稱、KOL名稱或服務項目..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <div className="flex items-center space-x-1"><FileText className="h-4 w-4" /><span>共 {filteredPayments.length} 份清單</span></div>
                    <div className="flex items-center space-x-1"><DollarSign className="h-4 w-4" /><span>總金額 NT$ {filteredPayments.reduce((sum, conf) => sum + (conf.total_amount || 0), 0).toLocaleString()}</span></div>
                </div>
            </div>
            <div className="flex space-x-2">
                <Button variant={sortField === 'date' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('date')}><Calendar className="h-4 w-4 mr-1" /> 日期 {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}</Button>
                <Button variant={sortField === 'amount' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('amount')}><DollarSign className="h-4 w-4 mr-1" /> 金額 {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}</Button>
                <Button variant={sortField === 'items' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('items')}><FileText className="h-4 w-4 mr-1" /> 項目數 {sortField === 'items' && (sortDirection === 'asc' ? '↑' : '↓')}</Button>
            </div>
            {filteredPayments.length > 0 ? (
                <div className="space-y-4">
                    {filteredPayments.map((confirmation, confirmationIndex) => {
                        const accountGroups = groupItemsByAccount(confirmation.payment_confirmation_items || []);
                        return (
                            <div key={confirmation.id} className="bg-white shadow-md rounded-lg overflow-hidden">
                                <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-4 border-b bg-gray-50" onClick={() => toggleExpansion(confirmationIndex)}>
                                    <div className="flex items-center space-x-3">
                                        {confirmation.isExpanded ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                                        <FileText className="h-5 w-5 text-blue-500" />
                                        <div>
                                            <div className="font-medium text-gray-900">請款清單 - {confirmation.confirmation_date}</div>
                                            <div className="text-sm text-gray-500">{confirmation.total_items} 筆項目 | {accountGroups.length} 個戶名 | 總金額 NT$ {(confirmation.total_amount || 0).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); exportToCSV(confirmation); }} className="text-green-600 hover:text-green-700"><Download className="h-4 w-4 mr-1" /> CSV</Button>
                                        <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); revertConfirmedPayment(confirmation); }}><Trash2 className="h-4 w-4 mr-1" /> 退回申請</Button>
                                    </div>
                                </div>
                                {confirmation.isExpanded && (
                                    <div className="p-4">
                                        {accountGroups.length > 0 ? (
                                            <div className="space-y-4">
                                                {accountGroups.map((group, groupIndex) => (
                                                    <div key={groupIndex} className="border rounded-lg overflow-hidden">
                                                        <div className="bg-blue-50 border-b"><div className="flex items-center justify-between p-4"><div className="flex items-center space-x-3"><Building2 className="h-6 w-6 text-blue-600" /><div><div className="font-semibold text-lg text-gray-900">{group.accountName}</div><div className="text-sm text-gray-600 mt-1">{group.bankName} {group.branchName && `${group.branchName} |`} {group.accountNumber}</div></div></div><div className="text-right"><div className="font-semibold text-xl text-blue-600">NT$ {group.totalAmount.toLocaleString()}</div><div className="text-sm text-gray-500">{group.items.length} 筆項目</div></div></div></div>
                                                        <div className="overflow-x-auto">
                                                            <table className="min-w-full">
                                                                <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案名稱</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KOL</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">服務項目</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">數量</th><th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th></tr></thead>
                                                                <tbody className="bg-white divide-y divide-gray-200">
                                                                    {group.items.map((item) => (
                                                                        <tr key={item.id} className="text-sm hover:bg-gray-50"><td className="px-4 py-3 text-gray-900">{item.project_name}</td><td className="px-4 py-3 text-gray-700">{item.kol_name}</td><td className="px-4 py-3 text-gray-700">{item.service}</td><td className="px-4 py-3 text-gray-700">{item.quantity}</td><td className="px-4 py-3 text-right font-medium text-gray-900">NT$ {(item.price || 0).toLocaleString()}</td></tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (<div className="text-center py-8 text-gray-500"><FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" /><p>此確認記錄沒有關聯的項目</p></div>)}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="text-center py-12"><FileText className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">沒有已確認的請款清單</h3><p className="mt-1 text-sm text-gray-500">{searchTerm ? '沒有符合搜尋條件的資料' : '目前沒有已確認的請款記錄'}</p></div>
            )}
        </div>
    )
}