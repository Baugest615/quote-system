'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, CheckCircle, XCircle, FileText, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

type PaymentRequestWithDetails = Database['public']['Views']['payment_requests_with_details']['Row']
type PaymentRequestItem = PaymentRequestWithDetails & { is_editing?: boolean }

export default function PaymentRequestsPage() {
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestItem[]>([])
  const [filteredRequests, setFilteredRequests] = useState<PaymentRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  const fetchPaymentRequests = useCallback(async () => {
    setLoading(true)
    try {
      const { data: requests, error } = await supabase
        .from('payment_requests_with_details')
        .select('*')
        .not('verification_status', 'eq', 'confirmed')
        .order('request_date', { ascending: false })

      if (error) throw error
      const items = (requests || []).map(r => ({...r, is_editing: false}))
      setPaymentRequests(items)
      setFilteredRequests(items)
    } catch (error: any) {
      toast.error('載入請款申請失敗: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPaymentRequests() }, [fetchPaymentRequests])
  useEffect(() => {
    const filtered = paymentRequests.filter(item => 
      (item.project_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.kol_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.service || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredRequests(filtered)
  }, [paymentRequests, searchTerm])

  const handleVerification = async (itemId: string, action: 'approve' | 'reject' | 'revert') => {
    const itemToProcess = paymentRequests.find(p => p.id === itemId);
    if (!itemToProcess) return toast.error("找不到要操作的項目");

    const groupItems = itemToProcess.merge_group_id
      ? paymentRequests.filter(p => p.merge_group_id === itemToProcess.merge_group_id)
      : [itemToProcess];
    
    const groupItemIds = groupItems.map(i => i.id);
    const isGroupAction = groupItems.length > 1;
    const itemText = isGroupAction ? `群組 (${groupItems.length}筆)` : '項目';

    if (action === 'reject') {
      const reason = window.prompt(`請輸入駁回 ${itemText} 的原因:`);
      if (reason === null) return;

      try {
        const rejectionReasons = JSON.parse(localStorage.getItem('rejectionReasons') || '{}');
        groupItems.forEach(item => {
          if (item.quotation_item_id) {
            // ✨ 暫存包含群組資訊的完整物件
            rejectionReasons[item.quotation_item_id] = {
              reason: reason || '無提供原因',
              merge_group_id: item.merge_group_id,
              merge_type: item.merge_type,
              merge_color: item.merge_color
            };
          }
        });
        localStorage.setItem('rejectionReasons', JSON.stringify(rejectionReasons));

        const { error } = await supabase.from('payment_requests').delete().in('id', groupItemIds);
        if (error) throw error;
        
        toast.success(`${itemText} 已駁回並退回至待請款管理`);
        fetchPaymentRequests();

      } catch (error: any) {
        toast.error(`駁回失敗: ${error.message}`);
      }
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("無法獲取使用者資訊");
      
      const newStatus = action === 'approve' ? 'approved' : 'pending';
      const updates = { verification_status: newStatus, updated_at: new Date().toISOString() };
      
      const { error } = await supabase.from('payment_requests').update(updates).in('id', groupItemIds);
      if (error) throw error;

      if (newStatus === 'approved') toast.success(`${itemText} 已通過`);
      if (newStatus === 'pending') toast.info(`${itemText} 已退回待審核`);
      
      setPaymentRequests(prev => prev.map(item =>
        groupItemIds.includes(item.id) ? { ...item, verification_status: newStatus } : item
      ));

    } catch (error: any) {
      toast.error(`操作失敗: ${error.message}`);
    }
  }
  
  const handlePaymentConfirmation = async () => {
    const approvedItems = paymentRequests.filter(item => item.verification_status === 'approved')
    if (approvedItems.length === 0) { toast.error('沒有已通過的請款項目'); return }
    const invalidItems = approvedItems.filter(item => !item.kol_name || !item.project_name || !item.service)
    if (invalidItems.length > 0) { toast.error('部分項目缺少必要資訊，請檢查資料完整性'); return }
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) throw new Error('無法獲取使用者資訊')
      const totalAmount = approvedItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
      await handlePaymentConfirmationWithTransaction(approvedItems, totalAmount, user.id)
    } catch (error: any) { console.error('請款確認失敗:', error); toast.error('請款確認失敗: ' + error.message) }
  }

  const handlePaymentConfirmationWithTransaction = async (approvedItems: PaymentRequestItem[], totalAmount: number, userId: string) => {
    let confirmationId: string | null = null
    try {
      const { data: newConfirmation, error: confirmationError } = await supabase.from('payment_confirmations')
        .insert({ confirmation_date: new Date().toISOString().split('T')[0], total_amount: totalAmount, total_items: approvedItems.length, created_by: userId }).select().single()
      if (confirmationError) throw confirmationError; confirmationId = newConfirmation.id
      const itemsToInsert = approvedItems.map(item => ({
        payment_confirmation_id: confirmationId!, payment_request_id: item.id,
        amount_at_confirmation: (item.price || 0) * (item.quantity || 1), kol_name_at_confirmation: item.kol_name || '未知KOL',
        project_name_at_confirmation: item.project_name || '未知專案', service_at_confirmation: item.service || '未知服務'
      }));
      const { error: itemError } = await supabase.from('payment_confirmation_items').insert(itemsToInsert); if (itemError) throw itemError;
      const approvedItemIds = approvedItems.map(item => item.id);
      const { error: updateError } = await supabase.from('payment_requests').update({ verification_status: 'confirmed', updated_at: new Date().toISOString() }).in('id', approvedItemIds);
      if (updateError) throw updateError;
      await fetchPaymentRequests(); toast.success(`✅ 已確認 ${approvedItems.length} 筆請款項目`)
    } catch (error: any) {
      console.error('❌ 事務性確認失敗:', error)
      if (confirmationId) {
        await supabase.from('payment_confirmation_items').delete().eq('payment_confirmation_id', confirmationId)
        await supabase.from('payment_confirmations').delete().eq('id', confirmationId)
      }
      throw error
    }
  }

  const shouldShowControls = (item: PaymentRequestItem) => !item.merge_group_id || item.is_merge_leader

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div></div>

  return (
      <div className="space-y-6">
          <div className="flex justify-between items-center">
              <div>
                  <h1 className="text-3xl font-bold">請款申請</h1>
                  <p className="text-gray-500 mt-1">審核和管理請款申請</p>
              </div>
              <Button onClick={handlePaymentConfirmation} disabled={!paymentRequests.some(item => item.verification_status === 'approved')} className="bg-green-600 hover:bg-green-700">
                  請款確認
              </Button>
          </div>
          <div className="flex items-center space-x-4">
              <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input placeholder="搜尋專案名稱、KOL名稱或服務項目..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <div className="text-sm text-gray-500">
                  待審核 {paymentRequests.filter(r => r.verification_status === 'pending').length} 筆 |
                  已通過 {paymentRequests.filter(r => r.verification_status === 'approved').length} 筆
              </div>
          </div>
          {filteredRequests.length > 0 ? (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案名稱</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KOL名稱</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合作項目</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">檢核文件</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">檢核</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredRequests.map((item) => (
                                <tr key={item.id} className={`${item.merge_color || ''} ${item.verification_status === 'approved' ? 'bg-green-50' : ''} ${item.verification_status === 'rejected' ? 'bg-red-50' : ''}`}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.project_name || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.kol_name || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.service || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">NT$ {((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex items-center space-x-2">
                                            {item.attachment_file_path && <span className="text-green-600 text-xs">附件</span>}
                                            {item.invoice_number && <span className="text-blue-600 text-xs">發票: {item.invoice_number}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {shouldShowControls(item) && (
                                            <div className="flex items-center space-x-2">
                                                {item.verification_status === 'pending' && (
                                                    <>
                                                        <Button size="sm" onClick={() => handleVerification(item.id, 'approve')} className="bg-green-600 hover:bg-green-700"><CheckCircle className="h-4 w-4 mr-1" />通過</Button>
                                                        <Button size="sm" variant="destructive" onClick={() => handleVerification(item.id, 'reject')}><XCircle className="h-4 w-4 mr-1" />駁回</Button>
                                                    </>
                                                )}
                                                {item.verification_status === 'approved' && (
                                                    <>
                                                        <span className="flex items-center text-green-700 font-semibold text-xs px-2 py-1 bg-green-200 rounded-full"><CheckCircle className="h-4 w-4 mr-1" />已通過</span>
                                                        <Button size="sm" variant="outline" onClick={() => handleVerification(item.id, 'revert')}><Undo2 className="h-4 w-4 mr-1" />退回</Button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          ) : (
              <div className="text-center py-12"><FileText className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">沒有請款申請</h3><p className="mt-1 text-sm text-gray-500">{searchTerm ? '沒有符合搜尋條件的資料' : '目前沒有待審核的請款申請'}</p></div>
          )}
      </div>
  )
}