'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PendingPaymentFileModal } from '@/components/pending-payments/PendingPaymentFileModal'
import {
  Search, Paperclip, Receipt, Trash2, AlertCircle,
  FileText, Users, Unlink, X, CheckCircle //【NEW】Import CheckCircle icon
} from 'lucide-react'
import { toast } from 'sonner'
import { Database } from '@/types/database.types'

// --- 類型定義 (維持不變) ---
interface PendingPaymentAttachment {
  name: string;
  url: string;
  path: string;
  uploadedAt: string;
  size: number;
}
type QuotationItemWithDetails = (Database['public']['Tables']['quotation_items']['Row'] & {
  quotations: Database['public']['Tables']['quotations']['Row'] & {
    clients: Pick<Database['public']['Tables']['clients']['Row'], 'name'> | null
  } | null
  kols: Pick<Database['public']['Tables']['kols']['Row'], 'id' | 'name' | 'real_name' | 'bank_info'> | null
});
interface PendingPaymentItem extends QuotationItemWithDetails {
  merge_type: 'account' | null
  merge_group_id: string | null
  is_merge_leader: boolean
  merge_color: string
  rejection_reason: string | null
  is_selected: boolean
  invoice_number_input: string | null
  attachments: PendingPaymentAttachment[]
  payment_request_id: string | null
}

const MERGE_COLORS = ['bg-red-100', 'bg-blue-100', 'bg-green-100', 'bg-yellow-100', 'bg-purple-100', 'bg-pink-100']

const isValidInvoiceFormat = (invoiceNumber: string | null | undefined): boolean => {
  if (!invoiceNumber) return false;
  const invoiceRegex = /^[A-Za-z]{2}-\d{8}$/;
  return invoiceRegex.test(invoiceNumber);
};


// 駁回原因顯示元件 (維持不變)
const RejectionReasonDisplay = ({ item, onClear, onUnmerge }: {
  item: PendingPaymentItem
  onClear: (paymentRequestId: string) => void
  onUnmerge: (groupId: string) => void
}) => {
  const shouldShowControls = !item.merge_group_id || item.is_merge_leader;
  if (!item.rejection_reason || !shouldShowControls) return null;
  return (
    <div className="mt-2 bg-red-50 border border-red-200 rounded-md p-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start flex-1">
          <AlertCircle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-red-800">{item.merge_group_id ? '合併群組駁回原因' : '駁回原因'}</p>
            <p className="text-xs text-red-700 whitespace-pre-wrap mt-1">{item.rejection_reason}</p>
          </div>
        </div>
        <div className="flex space-x-1 ml-2">
          {item.merge_group_id && (<Button variant="ghost" size="sm" onClick={() => onUnmerge(item.merge_group_id!)} className="h-6 w-6 p-0 text-orange-500 hover:text-orange-700 hover:bg-orange-100" title="解除合併"><Unlink className="h-3 w-3" /></Button>)}
          <Button variant="ghost" size="sm" onClick={() => onClear(item.payment_request_id!)} className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-100" title="清除駁回原因"><X className="h-3 w-3" /></Button>
        </div>
      </div>
    </div>
  )
}

export default function PendingPaymentsPage() {
  const [items, setItems] = useState<PendingPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
  const [selectedMergeType, setSelectedMergeType] = useState<'account' | null>(null)
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [selectedItemForFile, setSelectedItemForFile] = useState<PendingPaymentItem | null>(null)

  const fetchPendingItems = useCallback(async () => {
    setLoading(true)
    try {
      const { data: rejectedRequests, error: rejectedError } = await supabase
        .from('payment_requests')
        .select(`*, quotation_items:quotation_item_id (*, quotations:quotation_id(*, clients:client_id(name)), kols:kol_id(id, name, real_name, bank_info))`)
        .eq('verification_status', 'rejected')
      if (rejectedError) throw new Error(`獲取駁回項目失敗: ${rejectedError.message}`);
      
      const rejectedItemIds = new Set(rejectedRequests.map(req => req.quotation_item_id));

      const { data: availableItemsData, error: itemsError } = await supabase.rpc('get_available_pending_payments');
      if (itemsError) throw new Error(`獲取全新項目失敗: ${itemsError.message}`);

      const availableItems = (availableItemsData as any[]).filter(item => !rejectedItemIds.has(item.id));

      const processedItems: PendingPaymentItem[] = [];

      availableItems.forEach(item => {
        processedItems.push({
          ...(item as QuotationItemWithDetails),
          quotations: item.quotations ? JSON.parse(JSON.stringify(item.quotations)) : null,
          kols: item.kols ? JSON.parse(JSON.stringify(item.kols)) : null,
          merge_type: null, merge_group_id: null, is_merge_leader: false, merge_color: '',
          rejection_reason: null, 
          is_selected: Boolean(item.is_selected),
          invoice_number_input: null,
          attachments: [], payment_request_id: null
        });
      });

      rejectedRequests.forEach(req => {
        if (req.quotation_items) {
          processedItems.push({
            ...(req.quotation_items as QuotationItemWithDetails),
            payment_request_id: req.id,
            rejection_reason: req.rejection_reason,
            attachments: req.attachment_file_path ? JSON.parse(req.attachment_file_path) : [],
            invoice_number_input: req.invoice_number,
            is_selected: Boolean(req.is_selected),
            merge_type: req.merge_type as 'account' | null,
            merge_group_id: req.merge_group_id,
            is_merge_leader: req.is_merge_leader,
            merge_color: req.merge_color || '',
          });
        }
      });
      
      const mergeGroupLeaders = new Map<string, string>();
      processedItems.forEach(item => {
        if (item.merge_group_id && !mergeGroupLeaders.has(item.merge_group_id)) {
          mergeGroupLeaders.set(item.merge_group_id, item.id);
        }
      });

      const mergeGroupColors = new Map<string, string>();
      let colorIndex = 0;
      
      const finalProcessedItems = processedItems.map(item => {
        if (item.merge_group_id) {
          const isLeader = mergeGroupLeaders.get(item.merge_group_id) === item.id;
          if (!item.merge_color && !mergeGroupColors.has(item.merge_group_id)) {
            const color = MERGE_COLORS[colorIndex % MERGE_COLORS.length];
            mergeGroupColors.set(item.merge_group_id, color);
            colorIndex++;
          }
          return { ...item, is_merge_leader: !!isLeader, merge_color: item.merge_color || mergeGroupColors.get(item.merge_group_id) || '' };
        }
        return item;
      }).sort((a,b) => (a.rejection_reason ? -1 : 1));

      setItems(finalProcessedItems);
    } catch (error: any) {
      toast.error('載入資料失敗: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchPendingItems() }, [fetchPendingItems]);
  const filteredItems = useMemo(() => {
    return items.filter(item =>
      (item.quotations?.project_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.kols?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.quotations?.clients?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm, items]);
  const clearRejectionReason = async (paymentRequestId: string) => {
    const { error } = await supabase
      .from('payment_requests')
      .update({ rejection_reason: null, rejected_by: null, rejected_at: null })
      .eq('id', paymentRequestId);
    
    if (error) {
      toast.error("清除駁回原因失敗: " + error.message);
    } else {
      setItems(prev => prev.map(item => 
        item.payment_request_id === paymentRequestId
          ? { ...item, rejection_reason: null }
          : item
      ));
      toast.success('已清除駁回原因，您可以修改後重新提交');
    }
  }

  const handleFileUpdate = async (itemId: string, newAttachments: PendingPaymentAttachment[]) => {
    const updatedItem = items.find(i => i.id === itemId);
    if (!updatedItem) return;

    setItems(prevItems => prevItems.map(item => {
      if (updatedItem.merge_group_id && item.merge_group_id === updatedItem.merge_group_id) {
        return { ...item, attachments: newAttachments };
      }
      if (item.id === itemId) {
        return { ...item, attachments: newAttachments };
      }
      return item;
    }));

    if (updatedItem.payment_request_id) {
      try {
        const leaderItem = updatedItem.merge_group_id
          ? items.find(i => i.merge_group_id === updatedItem.merge_group_id && i.is_merge_leader)
          : updatedItem;
        
        if (leaderItem?.payment_request_id) {
          const { error } = await supabase
            .from('payment_requests')
            .update({ attachment_file_path: JSON.stringify(newAttachments) })
            .eq('id', leaderItem.payment_request_id);

          if (error) throw error;
          
          toast.success('附件狀態已同步至資料庫。');
        }
      } catch (error: any) {
        toast.error('同步附件狀態至資料庫失敗: ' + error.message);
        fetchPendingItems();
      }
    }
  }

  const handleInvoiceNumberChange = async (itemId: string, newInvoiceNumber: string) => {
    const updatedItem = items.find(i => i.id === itemId);
    if (!updatedItem) return;
  
    setItems(prevItems => prevItems.map(item => {
      if (updatedItem.merge_group_id && item.merge_group_id === updatedItem.merge_group_id) {
        return { ...item, invoice_number_input: newInvoiceNumber };
      }
      if (item.id === itemId) {
        return { ...item, invoice_number_input: newInvoiceNumber };
      }
      return item;
    }));
  
    if (updatedItem.payment_request_id) {
      try {
        const leaderItem = updatedItem.merge_group_id
          ? items.find(i => i.merge_group_id === updatedItem.merge_group_id && i.is_merge_leader)
          : updatedItem;
  
        if (leaderItem?.payment_request_id) {
          const { error } = await supabase
            .from('payment_requests')
            .update({ invoice_number: newInvoiceNumber.trim() || null })
            .eq('id', leaderItem.payment_request_id);
  
          if (error) throw error;
  
          toast.success('發票號碼已同步至資料庫。');
        }
      } catch (error: any) {
        toast.error('同步發票號碼至資料庫失敗: ' + error.message);
        fetchPendingItems();
      }
    }
  }

  const handleUnmergeWithBetterUX = async (groupId: string) => {
    const groupItems = items.filter(i => i.merge_group_id === groupId);
    if (!window.confirm(`確定要解除合併嗎？這將影響 ${groupItems.length} 個項目。`)) return;
    const leaderItem = groupItems.find(item => item.is_merge_leader);
    if (!leaderItem) { toast.error("找不到群組主導項，無法解除合併"); return; }
    const updatesForNonLeaders = {
        merge_group_id: null, merge_type: null, is_merge_leader: false, merge_color: '',
        attachment_file_path: null, invoice_number: null,
    };
    const updatesForLeader = {
        merge_group_id: null, merge_type: null, is_merge_leader: false, merge_color: '',
    };
    try {
      const nonLeaderIds = groupItems.filter(item => !item.is_merge_leader && item.payment_request_id).map(item => item.payment_request_id!);
      if (nonLeaderIds.length > 0) {
        const { error: nonLeaderError } = await supabase.from('payment_requests').update(updatesForNonLeaders).in('id', nonLeaderIds);
        if (nonLeaderError) throw nonLeaderError;
      }
      if (leaderItem.payment_request_id) {
        const { error: leaderError } = await supabase.from('payment_requests').update(updatesForLeader).eq('id', leaderItem.payment_request_id);
        if (leaderError) throw leaderError;
      }
      setItems(prev => prev.map(item => {
        if (item.merge_group_id === groupId) {
          const isLeader = item.id === leaderItem.id;
          return { 
            ...item, 
            merge_type: null, merge_group_id: null, is_merge_leader: false, merge_color: '',
            attachments: isLeader ? item.attachments : [],
            invoice_number_input: isLeader ? item.invoice_number_input : null,
          };
        }
        return item;
      }));
      toast.success(`已解除合併`);
    } catch (error: any) { toast.error("解除合併失敗: " + error.message); }
  }
  const handleConfirmUpload = async () => {
    const selectedItems = items.filter(item => item.is_selected);
    if (selectedItems.length === 0) { toast.error('請選擇要申請付款的項目'); return; }
    setLoading(true);
    try {
      const operations = selectedItems.map(item => {
        const leaderItem = item.merge_group_id ? items.find(i => i.merge_group_id === item.merge_group_id && i.is_merge_leader) || item : item;
        const requestData = {
          quotation_item_id: item.id, request_date: new Date().toISOString(), verification_status: 'pending' as const,
          merge_type: item.merge_type, merge_group_id: item.merge_group_id, is_merge_leader: item.is_merge_leader, merge_color: item.merge_color,
          attachment_file_path: leaderItem.attachments.length > 0 ? JSON.stringify(leaderItem.attachments) : null,
          invoice_number: leaderItem.invoice_number_input?.trim() || null,
          rejection_reason: null, rejected_by: null, rejected_at: null,
        };
        if (item.payment_request_id) { return supabase.from('payment_requests').update(requestData).eq('id', item.payment_request_id); } 
        else { return supabase.from('payment_requests').insert(requestData); }
      });
      const results = await Promise.all(operations);
      const hasError = results.some(res => res.error);
      if (hasError) {
        const firstError = results.find(res => res.error)?.error;
        throw new Error(`部分項目提交失敗: ${firstError?.message}`);
      }
      toast.success(`✅ 已成功提交 ${selectedItems.length} 筆請款申請`);
      fetchPendingItems();
    } catch (error: any) { toast.error(error.message || '提交請款申請失敗');
    } finally { setLoading(false); }
  }

  const canSelectForPayment = (item: PendingPaymentItem): boolean => {
    if (item.merge_group_id) {
      const leaderItem = items.find(i => i.merge_group_id === item.merge_group_id && i.is_merge_leader) || item;
      const hasAttachments = leaderItem.attachments && leaderItem.attachments.length > 0;
      const hasValidInvoice = isValidInvoiceFormat(leaderItem.invoice_number_input);
      return hasAttachments || hasValidInvoice;
    } else {
      const hasAttachments = item.attachments && item.attachments.length > 0;
      const hasValidInvoice = isValidInvoiceFormat(item.invoice_number_input);
      return hasAttachments || hasValidInvoice;
    }
  }

  const handlePaymentSelection = (itemId: string, isSelected: boolean) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (isSelected && !canSelectForPayment(item)) { toast.error('申請付款請檢附文件或填入正確格式的發票號碼'); return; }
    setItems(prev => prev.map(i => {
      if (item.merge_group_id && i.merge_group_id === item.merge_group_id) { return { ...i, is_selected: isSelected }; }
      if (i.id === itemId) { return { ...i, is_selected: isSelected }; }
      return i;
    }));
  }
  const openFileModal = (item: PendingPaymentItem) => { setSelectedItemForFile(item); setFileModalOpen(true); }
  const handleFileModalClose = () => { setFileModalOpen(false); setSelectedItemForFile(null); }
  const handleMergeTypeChange = () => { setSelectedMergeType(prev => prev ? null : 'account'); setSelectedForMerge([]); }
  const handleMergeSelection = (itemId: string, checked: boolean) => {
    if (checked) { setSelectedForMerge(prev => [...prev, itemId]); } else { setSelectedForMerge(prev => prev.filter(id => id !== itemId)); }
  }
  const canMergeWith = (item: PendingPaymentItem) => {
    if (!selectedMergeType || selectedForMerge.length === 0) return true;
    const firstSelectedItem = items.find(i => i.id === selectedForMerge[0]);
    if (!firstSelectedItem) return true;
    const firstBankInfo = firstSelectedItem.kols?.bank_info;
    const currentBankInfo = item.kols?.bank_info;
    if (!firstBankInfo || !currentBankInfo) return false;
    return JSON.stringify(firstBankInfo) === JSON.stringify(currentBankInfo);
  }
  const handleMerge = () => {
    if (selectedForMerge.length < 2) { toast.error('請選擇至少兩筆資料進行合併'); return; }
    if (!window.confirm('你是否確認合併申請？')) return;
    const groupId = `merge-${Date.now()}`;
    const colorIndex = items.filter(i => i.merge_group_id).map(i => i.merge_group_id).filter((v, i, a) => a.indexOf(v) === i).length;
    const mergeColor = MERGE_COLORS[colorIndex % MERGE_COLORS.length];
    setItems(prev => prev.map(item => {
      if (selectedForMerge.includes(item.id)) {
        return { ...item, merge_type: 'account', merge_group_id: groupId, is_merge_leader: item.id === selectedForMerge[0], merge_color: mergeColor };
      }
      return item;
    }));
    setSelectedForMerge([]); setSelectedMergeType(null);
    toast.success(`已合併 ${selectedForMerge.length} 筆資料`);
  }
  const shouldShowControls = (item: PendingPaymentItem) => !item.merge_group_id || item.is_merge_leader;

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div></div>
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-bold">待請款管理</h1><p className="text-gray-500 mt-1">管理已簽約專案的請款項目</p></div>
        <Button onClick={handleConfirmUpload} disabled={loading || !items.some(item => item.is_selected)} className="bg-green-600 hover:bg-green-700">
          {loading ? '處理中...' : `提交請款申請 (${items.filter(item => item.is_selected).length})`}
        </Button>
      </div>
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" /><Input placeholder="搜尋專案、KOL、服務項目..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10"/></div>
        <Button onClick={handleMergeTypeChange} variant={selectedMergeType ? "default" : "outline"} className="flex items-center"><Users className="h-4 w-4 mr-2" />{selectedMergeType ? '取消合併' : '帳戶合併'}</Button>
        {selectedForMerge.length > 0 && (<Button onClick={handleMerge} className="bg-blue-600 hover:bg-blue-700">合併 ({selectedForMerge.length})</Button>)}
        <div className="text-sm text-gray-500">共 {filteredItems.length} 筆項目</div>
      </div>
      {filteredItems.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案名稱</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KOL</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合作項目</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合併</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">檢核文件</th><th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">申請付款</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => {
                 const displayItem = item.merge_group_id ? items.find(i => i.merge_group_id === item.merge_group_id && i.is_merge_leader) || item : item;
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${item.merge_color}`}>
                    <td className="px-4 py-4 align-top"><div className="font-medium text-gray-900 text-sm">{item.quotations?.project_name || 'N/A'}</div><RejectionReasonDisplay item={item} onClear={() => clearRejectionReason(item.payment_request_id!)} onUnmerge={handleUnmergeWithBetterUX}/></td>
                    <td className="px-4 py-4 align-top text-sm">{item.kols?.name || '自訂項目'}</td><td className="px-4 py-4 align-top text-sm">{item.service}</td><td className="px-4 py-4 align-top text-sm font-medium">NT$ {((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
                    <td className="px-4 py-4 align-top text-sm">{selectedMergeType && canMergeWith(item) && !item.merge_group_id && (<label className="flex items-center"><input type="checkbox" checked={selectedForMerge.includes(item.id)} onChange={(e) => handleMergeSelection(item.id, e.target.checked)} className="mr-1" /><span className="text-xs">選擇合併</span></label>)}{item.merge_group_id && (<div className="text-xs"><span className="bg-blue-100 px-2 py-1 rounded">合併申請{item.is_merge_leader && ' (主)'}</span>{item.is_merge_leader && (<Button variant="ghost" size="sm" onClick={() => handleUnmergeWithBetterUX(item.merge_group_id!)} className="ml-1 h-6 w-6 p-0 text-orange-500 hover:text-orange-700" title="解除合併"><Trash2 className="h-3 w-3" /></Button>)}</div>)}</td>
                    <td className="px-4 py-4 align-top">{shouldShowControls(item) && (
                      <div>
                        <div className="space-y-2">
                          <Button variant="outline" size="sm" onClick={() => openFileModal(item)} className="flex items-center w-full justify-center"><Paperclip className="h-3 w-3 mr-1" />{displayItem.attachments?.length > 0 ? `${displayItem.attachments.length} 個檔案` : '上傳/管理檔案'}</Button>
                          <Input 
                              placeholder="發票號碼(AB-12345678)" 
                              value={displayItem.invoice_number_input || ''} 
                              onChange={(e) => handleInvoiceNumberChange(item.id, e.target.value)} 
                              className={`w-full text-xs ${
                                  displayItem.invoice_number_input && !isValidInvoiceFormat(displayItem.invoice_number_input)
                                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                                  : ''
                              }`}
                          />
                        </div>
                        {/* 【DEFINITIVE FIX】Added conditional rendering for the checkmark icon */}
                        {canSelectForPayment(item) && (
                          <div className="flex items-center text-green-600 mt-2 text-xs font-medium">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            <span>檢核資料已備妥</span>
                          </div>
                        )}
                      </div>
                    )}</td>
                    <td className="px-4 py-4 align-top text-center">{shouldShowControls(item) && (<input type="checkbox" checked={item.is_selected} onChange={(e) => handlePaymentSelection(item.id, e.target.checked)} disabled={!canSelectForPayment(item)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" title={!canSelectForPayment(item) ? '需檢附文件或正確格式的發票號碼' : '申請付款'}/>)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12"><FileText className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">沒有待請款項目</h3><p className="mt-1 text-sm text-gray-500">{searchTerm ? '沒有符合搜尋條件的項目' : '目前沒有需要處理的待請款項目'}</p></div>
      )}
      {selectedItemForFile && (<PendingPaymentFileModal isOpen={fileModalOpen} onClose={handleFileModalClose} itemId={selectedItemForFile.id} projectName={selectedItemForFile.quotations?.project_name || ''} currentAttachments={selectedItemForFile.attachments} onUpdate={handleFileUpdate}/>)}
    </div>
  )
}