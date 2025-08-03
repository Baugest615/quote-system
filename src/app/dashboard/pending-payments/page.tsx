'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusCircle, Search, Paperclip, Receipt, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type Quotation = Database['public']['Tables']['quotations']['Row']
type Kol = Database['public']['Tables']['kols']['Row']

type PendingPaymentItem = QuotationItem & {
  quotations: Pick<Quotation, 'project_name' | 'id' | 'status'>
  kols: (Pick<Kol, 'name' | 'real_name' | 'bank_info'>) | null
  attachment_file?: File | null
  invoice_number_input?: string
  is_selected?: boolean
  merge_type?: 'company' | 'account' | null
  merge_group_id?: string | null
  is_merge_leader?: boolean
  merge_color?: string
  rejection_reason?: string | null
}

const MERGE_COLORS = [
  'bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-purple-50',
  'bg-pink-50', 'bg-indigo-50', 'bg-gray-50', 'bg-red-50'
]

export default function PendingPaymentsPage() {
  const [items, setItems] = useState<PendingPaymentItem[]>([])
  const [filteredItems, setFilteredItems] = useState<PendingPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedMergeType, setSelectedMergeType] = useState<'company' | 'account' | null>(null)
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])

  const fetchPendingItems = useCallback(async () => {
    setLoading(true)
    try {
      const { data: quotationItems, error: quotationError } = await supabase
        .from('quotation_items').select(`*, quotations!inner (id, project_name, status), kols (name, real_name, bank_info)`)
        .eq('quotations.status', '已簽約').order('created_at', { ascending: false })
      if (quotationError) throw quotationError

      if (!quotationItems || quotationItems.length === 0) {
        setItems([]); setFilteredItems([]); setLoading(false); return
      }

      const itemIds = quotationItems.map(item => item.id)
      const { data: existingRequests } = await supabase.from('payment_requests').select('quotation_item_id').in('quotation_item_id', itemIds)
      const submittedItemIds = new Set(existingRequests?.map(req => req.quotation_item_id) || [])
      const pendingItems = quotationItems.filter(item => !submittedItemIds.has(item.id))

      const rejectionInfo = JSON.parse(localStorage.getItem('rejectionReasons') || '{}');
      const itemsWithState = pendingItems.map(item => {
        const reasonData = rejectionInfo[item.id];
        return {
          ...item,
          is_selected: false, attachment_file: null, invoice_number_input: '',
          merge_type: reasonData?.merge_type || null,
          merge_group_id: reasonData?.merge_group_id || null,
          is_merge_leader: false,
          merge_color: reasonData?.merge_color || '',
          rejection_reason: reasonData?.reason || null
        }
      }) as PendingPaymentItem[]

      const groups: { [key: string]: string[] } = {};
      itemsWithState.forEach(item => {
        if (item.merge_group_id) {
          if (!groups[item.merge_group_id]) { groups[item.merge_group_id] = [] }
          groups[item.merge_group_id].push(item.id);
        }
      });
      Object.values(groups).forEach(memberIds => {
        if (memberIds.length > 0) {
          const leaderId = memberIds.sort()[0];
          const leaderItem = itemsWithState.find(i => i.id === leaderId);
          if (leaderItem) leaderItem.is_merge_leader = true;
        }
      });

      setItems(itemsWithState);
      setFilteredItems(itemsWithState);
    } catch (error: any) {
      toast.error('載入資料失敗: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPendingItems() }, [fetchPendingItems])
  
  useEffect(() => {
    const filtered = items.filter((item) => 
      (item.quotations?.project_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.kols?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.service || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredItems(filtered)
  }, [items, searchTerm])

  const getBankInfo = (kol: PendingPaymentItem['kols']) => { if (!kol?.bank_info) return null; const bankInfo = kol.bank_info as any; return { bankType: bankInfo.bankType, companyName: bankInfo.companyAccountName, accountName: bankInfo.bankType === 'company' ? bankInfo.companyAccountName : kol.real_name, bankName: bankInfo.bankName, branchName: bankInfo.branchName, accountNumber: bankInfo.accountNumber } }
  const handleMergeTypeChange = (type: 'company' | 'account') => { if (selectedMergeType === type) { setSelectedMergeType(null); setSelectedForMerge([]) } else { setSelectedMergeType(type); setSelectedForMerge([]) } }
  const handleMergeSelection = (itemId: string, checked: boolean) => { if (checked) { setSelectedForMerge(prev => [...prev, itemId]) } else { setSelectedForMerge(prev => prev.filter(id => id !== itemId)) } }
  const canMergeWith = (item: PendingPaymentItem) => { if (!selectedMergeType || selectedForMerge.length === 0) return true; const firstSelectedItem = items.find(i => i.id === selectedForMerge[0]); if (!firstSelectedItem) return true; const firstBankInfo = getBankInfo(firstSelectedItem.kols); const currentBankInfo = getBankInfo(item.kols); if (!firstBankInfo || !currentBankInfo) return false; if (selectedMergeType === 'company') { return firstBankInfo.bankType === 'company' && currentBankInfo.bankType === 'company' && firstBankInfo.companyName === currentBankInfo.companyName } else { return firstBankInfo.accountName === currentBankInfo.accountName && firstBankInfo.bankName === currentBankInfo.bankName && firstBankInfo.accountNumber === currentBankInfo.accountNumber } }
  const handleMerge = () => { if (selectedForMerge.length < 2) { toast.error('請選擇至少兩筆資料進行合併'); return }; if (!window.confirm('你是否確認合併申請？')) return; const groupId = Date.now().toString(); const colorIndex = items.filter(i => i.merge_group_id).length % MERGE_COLORS.length; const mergeColor = MERGE_COLORS[colorIndex]; setItems(prev => prev.map(item => { if (selectedForMerge.includes(item.id)) { return { ...item, merge_type: selectedMergeType, merge_group_id: groupId, is_merge_leader: item.id === selectedForMerge[0], merge_color: mergeColor } } return item })); setSelectedForMerge([]); setSelectedMergeType(null); toast.success(`已合併 ${selectedForMerge.length} 筆資料`) }
  const handleFileUpload = (itemId: string, file: File) => { if (file.size > 10 * 1024 * 1024) { toast.error('檔案大小不能超過 10MB'); return }; setItems(prev => prev.map(item => { if (item.merge_group_id) { if (item.merge_group_id === items.find(i => i.id === itemId)?.merge_group_id) { return { ...item, attachment_file: file } } return item } else if (item.id === itemId) { return { ...item, attachment_file: file } } return item })); toast.success('檔案已選擇') }
  const handleInvoiceNumberChange = (itemId: string, invoiceNumber: string) => { setItems(prev => prev.map(item => { if (item.merge_group_id) { if (item.merge_group_id === items.find(i => i.id === itemId)?.merge_group_id) { return { ...item, invoice_number_input: invoiceNumber } } return item } else if (item.id === itemId) { return { ...item, invoice_number_input: invoiceNumber } } return item })) }
  const handlePaymentSelection = (itemId: string, isSelected: boolean) => { const item = items.find(i => i.id === itemId); if (item?.merge_group_id) { setItems(prev => prev.map(i => i.merge_group_id === item.merge_group_id ? { ...i, is_selected: isSelected } : i)); } else { setItems(prev => prev.map(i => i.id === itemId ? { ...i, is_selected: isSelected } : i)); } }
  
  // ✨ 修改：解除合併時，同時清除 localStorage 的暫存資訊
  const handleUnmerge = (groupId: string) => {
    if (!window.confirm('確定要解除合併嗎？此操作將一併清除駁回原因。')) return;
    
    // 1. 從 localStorage 清除
    const rejectionReasons = JSON.parse(localStorage.getItem('rejectionReasons') || '{}');
    const itemsToClean = items.filter(i => i.merge_group_id === groupId);
    itemsToClean.forEach(item => {
      delete rejectionReasons[item.id];
    });
    localStorage.setItem('rejectionReasons', JSON.stringify(rejectionReasons));

    // 2. 更新當前頁面狀態
    setItems(prev => prev.map(item => {
      if (item.merge_group_id === groupId) {
        return { 
          ...item, 
          merge_type: null, 
          merge_group_id: null, 
          is_merge_leader: false, 
          merge_color: '',
          rejection_reason: null // 同時清除原因
        };
      }
      return item;
    }));
    toast.success('已解除合併');
  }

  const handleConfirmUpload = async () => {
    const initiallySelectedItems = items.filter(item => item.is_selected)
    if (initiallySelectedItems.length === 0) { toast.error('請選擇要申請付款的項目'); return }
    
    const itemsToSubmitMap = new Map<string, PendingPaymentItem>()
    initiallySelectedItems.forEach(item => {
      if (item.merge_group_id) {
        items.forEach(member => { if (member.merge_group_id === item.merge_group_id) { itemsToSubmitMap.set(member.id, member) } })
      } else { itemsToSubmitMap.set(item.id, item) }
    })
    const finalItemsToSubmit = Array.from(itemsToSubmitMap.values());
    
    if (finalItemsToSubmit.length === 0) { toast.error('請選擇有效的項目'); return }

    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('無法獲取使用者資訊');
      const itemIds = finalItemsToSubmit.map(item => item.id);
      const { data: existingRequests, error: checkError } = await supabase.from('payment_requests').select('quotation_item_id').in('quotation_item_id', itemIds);
      if (checkError) throw new Error('檢查重複申請失敗: ' + checkError.message);
      if (existingRequests && existingRequests.length > 0) {
        toast.error('部分項目已提交過，請重新整理'); await fetchPendingItems(); setUploading(false); return;
      }

      const currentDate = new Date().toISOString().split('T')[0];
      const paymentRequestsData = finalItemsToSubmit.map(item => ({
          quotation_item_id: item.id, verification_status: 'pending' as const, request_date: currentDate,
          merge_type: item.merge_type || null, merge_group_id: item.merge_group_id || null, is_merge_leader: item.is_merge_leader || false,
          merge_color: item.merge_color || null, attachment_file_path: null, invoice_number: item.invoice_number_input?.trim() || null
      }));
      const { data: insertedData, error: insertError } = await supabase.from('payment_requests').insert(paymentRequestsData).select();
      if (insertError) throw new Error('插入請款申請失敗: ' + insertError.message);
      if (!insertedData || insertedData.length !== finalItemsToSubmit.length) throw new Error('插入操作返回資料量與預期不符');

      const rejectionReasons = JSON.parse(localStorage.getItem('rejectionReasons') || '{}');
      let reasonsChanged = false;
      finalItemsToSubmit.forEach(item => {
        if (rejectionReasons[item.id]) {
          delete rejectionReasons[item.id];
          reasonsChanged = true;
        }
      });
      if (reasonsChanged) {
        localStorage.setItem('rejectionReasons', JSON.stringify(rejectionReasons));
      }

      setSelectedForMerge([]);
      setSelectedMergeType(null);
      await fetchPendingItems();
      toast.success(`✅ 已成功提交 ${finalItemsToSubmit.length} 筆請款申請`);
    } catch (error: any) {
      toast.error(error.message || '提交請款申請失敗');
    } finally {
      setUploading(false);
    }
  }
  
  const shouldShowControls = (item: PendingPaymentItem) => !item.merge_group_id || item.is_merge_leader

  if (loading) { return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div></div> }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-bold">待請款管理</h1><p className="text-gray-500 mt-1">管理已簽約專案的請款項目</p></div>
        <Button onClick={handleConfirmUpload} disabled={uploading || !items.some(item => item.is_selected)} className="bg-green-600 hover:bg-green-700">{uploading ? '上傳中...' : '確認上傳'}</Button>
      </div>
      <div className="flex items-center space-x-4"><div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" /><Input placeholder="搜尋專案名稱、KOL名稱或服務項目..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10"/></div><div className="text-sm text-gray-500">共 {filteredItems.length} 筆資料</div></div>
      {!selectedMergeType && (<div className="bg-blue-50 p-4 rounded-lg"><h4 className="font-medium mb-3">合併設定</h4><div className="flex space-x-4"><Button variant="outline" onClick={() => handleMergeTypeChange('company')} className="bg-white">同公司合併</Button><Button variant="outline" onClick={() => handleMergeTypeChange('account')} className="bg-white">同戶名合併</Button></div></div>)}
      {selectedMergeType && (<div className="bg-yellow-50 p-4 rounded-lg"><div className="flex items-center justify-between"><div><h4 className="font-medium">{selectedMergeType === 'company' ? '同公司合併模式' : '同戶名合併模式'}</h4><p className="text-sm text-gray-600 mt-1">已選擇 {selectedForMerge.length} 筆資料</p></div><div className="flex space-x-2"><Button onClick={handleMerge} disabled={selectedForMerge.length < 2} className="bg-blue-600 hover:bg-blue-700">合併</Button><Button variant="outline" onClick={() => setSelectedMergeType(null)}>取消</Button></div></div></div>)}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案名稱</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KOL</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合作項目</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合併</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">檢核文件</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申請付款</th></tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => (
                <tr key={item.id} className={`${item.merge_color} ${item.rejection_reason ? 'bg-red-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 align-top">
                    {item.quotations?.project_name || '-'}
                    {item.rejection_reason && (item.is_merge_leader || !item.merge_group_id) && (
                      <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded-md">
                          <div className="flex items-start">
                              <AlertCircle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                              <div>
                                  <p className="text-xs font-semibold text-red-800">{item.merge_group_id ? '群組駁回原因' : '駁回原因'}</p>
                                  <p className="text-xs text-red-700 whitespace-pre-wrap">{item.rejection_reason}</p>
                              </div>
                          </div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 align-top">{item.kols?.name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 align-top">{item.service || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right align-top">NT$ {((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm align-top">{shouldShowControls(item) && (<div className="flex items-center">{!item.merge_group_id && selectedMergeType && (<input type="checkbox" checked={selectedForMerge.includes(item.id)} disabled={!canMergeWith(item)} onChange={(e) => handleMergeSelection(item.id, e.target.checked)} className="h-4 w-4 text-indigo-600"/>)}{item.merge_group_id && item.is_merge_leader && (<Button variant="outline" size="sm" onClick={() => handleUnmerge(item.merge_group_id!)} className="text-red-600"><Trash2 className="h-4 w-4 mr-1"/>解除</Button>)}</div>)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm align-top">{shouldShowControls(item) && (<div className="flex items-center space-x-2">
                    <label className="cursor-pointer">
                      <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(item.id, file) }}/>
                      {/* ✨ 修正 asChild 警告 */}
                      <Button variant="outline" size="sm" type="button">
                          <Paperclip className="h-4 w-4 mr-1"/>附件
                      </Button>
                    </label>
                    <div className="flex items-center"><Receipt className="h-4 w-4 text-gray-400 mx-1"/><Input placeholder="發票號碼" className="w-24 text-xs" value={item.invoice_number_input || ''} onChange={(e) => handleInvoiceNumberChange(item.id, e.target.value)}/></div>{(item.attachment_file || item.invoice_number_input?.trim()) && (<CheckCircle className="h-4 w-4 text-green-500"/>)}</div>)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm align-top">{shouldShowControls(item) && (<input type="checkbox" checked={item.is_selected || false} onChange={(e) => handlePaymentSelection(item.id, e.target.checked)} className="h-4 w-4 text-indigo-600"/>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredItems.length === 0 && (<div className="text-center py-12"><AlertCircle className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">沒有待請款項目</h3><p className="mt-1 text-sm text-gray-500">{searchTerm ? '沒有符合搜尋條件的資料' : '所有已簽約項目皆已進入請款流程'}</p></div>)}
      </div>
    </div>
  )
}