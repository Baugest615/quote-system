'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, CheckCircle, XCircle, FileText, Undo2, Paperclip, Receipt,
  Eye, Download, AlertCircle, Link as LinkIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'

// --- 類型定義 (維持不變) ---
interface ParsedAttachment {
  name: string;
  url: string;
  path: string;
  uploadedAt: string;
  size: number;
}
type PaymentRequestDetails = Database['public']['Views']['payment_requests_with_details']['Row'];
interface PaymentRequestItem extends PaymentRequestDetails {
  is_editing?: boolean;
  parsed_attachments?: ParsedAttachment[];
}

// --- 檔案檢視 Modal (維持不變) ---
const FileViewerModal = ({ isOpen, onClose, request }: {
  isOpen: boolean
  onClose: () => void
  request: PaymentRequestItem | null
}) => {
  if (!request) return null;
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  const handleFileAction = async (path: string, download = false) => {
    setDownloadError(null);
    try {
      const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 60);
      if (error) throw new Error(`無法生成安全連結: ${error.message}`);
      if (!data?.signedUrl) throw new Error("無法取得檔案連結");
      if (download) {
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = path.split('/').pop() || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error: any) {
      setDownloadError(error.message);
      toast.error(`檔案操作失敗: ${error.message}`);
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`檢視附件 - ${request.project_name}`}>
      <div className="space-y-4">
        {downloadError && <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{downloadError}</div>}
        {request.parsed_attachments && request.parsed_attachments.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">{request.parsed_attachments.map((file, index) => (
            <div key={index} className="bg-gray-50 p-3 rounded-lg border flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate text-sm" title={file.name}><LinkIcon className="h-3 w-3 inline-block mr-2" />{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{file.size ? `${formatFileSize(file.size)} • ` : ''}{new Date(file.uploadedAt).toLocaleString('zh-TW')}</p>
              </div>
              <div className="flex space-x-2 ml-3">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleFileAction(file.path)} title="預覽"><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleFileAction(file.path, true)} title="下載"><Download className="h-4 w-4" /></Button>
              </div>
            </div>))}
          </div>
        ) : <div className="text-center py-8 text-gray-500"><AlertCircle className="mx-auto h-8 w-8 mb-2" /><p>沒有可檢視的附件</p></div>}
        <div className="flex justify-end pt-4 border-t"><Button variant="outline" onClick={onClose}>關閉</Button></div>
      </div>
    </Modal>
  );
};

export default function PaymentRequestsPage() {
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestItem[]>([])
  const [filteredRequests, setFilteredRequests] = useState<PaymentRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequestItem | null>(null);

  const fetchPaymentRequests = useCallback(async () => {
    setLoading(true)
    try {
      const { data: requests, error } = await supabase
        .from('payment_requests_with_details')
        .select('*')
        .in('verification_status', ['pending', 'approved'])
        .order('request_date', { ascending: false })

      if (error) throw error;

      const items = (requests || []).map(r => {
        let parsed_attachments: ParsedAttachment[] = [];
        if (r.attachment_file_path) {
          try {
            const parsed = JSON.parse(r.attachment_file_path);
            if (Array.isArray(parsed)) parsed_attachments = parsed;
          } catch (e) {
            console.error("無法解析附件JSON:", e);
          }
        }
        return { ...r, is_editing: false, parsed_attachments };
      });

      setPaymentRequests(items as PaymentRequestItem[]);
      setFilteredRequests(items as PaymentRequestItem[]);
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

  const openFileViewer = (request: PaymentRequestItem) => {
    setSelectedRequest(request);
    setIsFileViewerOpen(true);
  };

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
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("無法取得使用者資訊");

        const updates = {
          verification_status: 'rejected' as const,
          rejection_reason: reason || '無提供原因',
          rejected_by: user.id,
          rejected_at: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('payment_requests')
          .update(updates)
          .in('id', groupItemIds);

        if (error) throw error;
        
        toast.success(`${itemText} 已駁回，並退回至「待請款管理」`);
        fetchPaymentRequests();

      } catch (error: any) {
        toast.error(`駁回失敗: ${error.message}`);
      }
      return;
    }

    try {
      const newStatus = action === 'approve' ? 'approved' : 'pending';
      const updates = { 
        verification_status: newStatus, 
        updated_at: new Date().toISOString(),
        rejection_reason: null,
        rejected_at: null,
        rejected_by: null
      };
      
      const { error } = await supabase.from('payment_requests').update(updates).in('id', groupItemIds);
      if (error) throw error;

      if (newStatus === 'approved') toast.success(`${itemText} 已通過`);
      if (newStatus === 'pending') toast.info(`${itemText} 已退回待審核`);
      
      fetchPaymentRequests();

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
    } catch (error: any) { toast.error('請款確認失敗: ' + error.message) }
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
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-3xl font-bold">請款申請</h1><p className="text-gray-500 mt-1">審核和管理請款申請</p></div>
          <Button onClick={handlePaymentConfirmation} disabled={!paymentRequests.some(item => item.verification_status === 'approved')} className="bg-green-600 hover:bg-green-700">請款確認</Button>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" /><Input placeholder="搜尋專案名稱、KOL名稱或服務項目..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" /></div>
          <div className="text-sm text-gray-500">待審核 {paymentRequests.filter(r => r.verification_status === 'pending').length} 筆 | 已通過 {paymentRequests.filter(r => r.verification_status === 'approved').length} 筆</div>
        </div>
        {filteredRequests.length > 0 ? (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案名稱</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KOL名稱</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合作項目</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">檢核文件</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">檢核</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((item) => (
                    <tr key={item.id} className={`${item.merge_color || ''} ${item.verification_status === 'approved' ? 'bg-green-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.project_name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.kol_name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.service || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">NT$ {((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {/* 🔥 **修正點 1：只有主導項 (leader) 才顯示附件和發票資訊** */}
                        {shouldShowControls(item) && (
                          <div className="flex flex-col space-y-1 text-xs">
                            {item.invoice_number && (<span className="text-blue-600 flex items-center"><Receipt className="h-3 w-3 mr-1" /> 發票: {item.invoice_number}</span>)}
                            {item.parsed_attachments && item.parsed_attachments.length > 0 ? (<Button variant="link" size="sm" className="text-indigo-600 p-0 h-auto text-xs flex items-center" onClick={() => openFileViewer(item)}><Paperclip className="h-3 w-3 mr-1" /> {item.parsed_attachments.length} 個附件</Button>) : (!item.invoice_number && <span className="text-gray-400">無</span>)}
                          </div>
                        )}
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
      <FileViewerModal isOpen={isFileViewerOpen} onClose={() => setIsFileViewerOpen(false)} request={selectedRequest}/>
    </>
  )
}