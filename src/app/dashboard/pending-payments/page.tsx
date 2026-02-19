'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PendingPaymentFileModal } from '@/components/pending-payments/PendingPaymentFileModal'
import { ProjectGroupView } from '@/components/pending-payments/ProjectGroupView'
import { usePaymentGrouping } from '@/hooks/payments/usePaymentGrouping'
import { isItemReady } from '@/lib/pending-payments/grouping-utils'
import {
  Search, Paperclip, Receipt, Trash2, AlertCircle,
  FileText, Users, Unlink, X, CheckCircle, LayoutList, FolderKanban, Save
} from 'lucide-react'
import { toast } from 'sonner'
import { Database } from '@/types/database.types'
import { PendingPaymentItem, PendingPaymentAttachment } from '@/lib/payments/types'

const MERGE_COLORS = ['bg-chart-3/15', 'bg-chart-4/15', 'bg-chart-1/15', 'bg-chart-2/15', 'bg-chart-5/15', 'bg-destructive/15']

const isValidInvoiceFormat = (invoiceNumber: string | null | undefined): boolean => {
  if (!invoiceNumber) return false;
  const invoiceRegex = /^[A-Z]{2}-\d{8}$/;
  return invoiceRegex.test(invoiceNumber);
};

export default function PendingPaymentsPage() {
  const [items, setItems] = useState<PendingPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
  const [selectedMergeType, setSelectedMergeType] = useState<'account' | null>(null)
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [selectedItemForFile, setSelectedItemForFile] = useState<PendingPaymentItem | null>(null)
  const [isMergeMode, setIsMergeMode] = useState(false)

  const fetchPendingItems = useCallback(async () => {
    setLoading(true)
    try {
      // 並行載入三個資料來源
      const [rejectedRes, draftRes, availableRes] = await Promise.all([
        supabase
          .from('payment_requests')
          .select(`*, quotation_items:quotation_item_id (*, quotations:quotation_id(*, clients:client_id(name)), kols:kol_id(id, name, real_name, bank_info))`)
          .eq('verification_status', 'rejected'),
        supabase
          .from('payment_requests')
          .select(`*, quotation_items:quotation_item_id (*, quotations:quotation_id(*, clients:client_id(name)), kols:kol_id(id, name, real_name, bank_info))`)
          .eq('verification_status', 'pending')
          .is('request_date', null),
        supabase.rpc('get_available_pending_payments'),
      ])

      if (rejectedRes.error) throw new Error(`獲取駁回項目失敗: ${rejectedRes.error.message}`);
      if (draftRes.error) throw new Error(`獲取草稿項目失敗: ${draftRes.error.message}`);
      if (availableRes.error) throw new Error(`獲取全新項目失敗: ${availableRes.error.message}`);

      const rejectedRequests = rejectedRes.data;
      const draftRequests = draftRes.data;
      const availableItemsData = availableRes.data;

      const rejectedItemIds = new Set(rejectedRequests?.map(req => req.quotation_item_id) || []);
      const draftItemIds = new Set(draftRequests?.map(req => req.quotation_item_id) || []);

      // Filter out items that are already rejected or in draft
      const availableItems = (availableItemsData as any[]).filter(item =>
        !rejectedItemIds.has(item.id) && !draftItemIds.has(item.id)
      );

      const availableItemIds = availableItems.map(item => item.id);
      let costsMap = new Map<string, number | null>();

      // 4. Fetch costs for available items
      if (availableItemIds.length > 0) {
        const { data: costsData, error: costsError } = await supabase
          .from('quotation_items')
          .select('id, cost')
          .in('id', availableItemIds);

        if (!costsError && costsData) {
          costsData.forEach(item => costsMap.set(item.id, item.cost));
        }
      }

      const processedItems: PendingPaymentItem[] = [];

      // Process available items
      availableItems.forEach(item => {
        const cost = item.cost !== undefined ? item.cost : costsMap.get(item.id);

        let defaultRemittanceName = item.remittance_name;
        if (!defaultRemittanceName && item.kols?.bank_info) {
          const bankInfo = item.kols.bank_info as any;
          if (bankInfo.bankType === 'company' && bankInfo.companyAccountName && bankInfo.bankName) {
            defaultRemittanceName = bankInfo.companyAccountName;
          } else if (bankInfo.bankType === 'individual' && bankInfo.personalAccountName && bankInfo.bankName) {
            defaultRemittanceName = bankInfo.personalAccountName;
          }
        }

        processedItems.push({
          ...item,
          quotations: item.quotations ? JSON.parse(JSON.stringify(item.quotations)) : null,
          kols: item.kols ? JSON.parse(JSON.stringify(item.kols)) : null,
          merge_type: null, merge_group_id: null, is_merge_leader: false, merge_color: '',
          rejection_reason: null,
          rejected_by: null,
          rejected_at: null,
          is_selected: false,
          invoice_number_input: null,
          attachments: [], payment_request_id: null,
          cost_amount_input: (cost !== null && cost !== undefined) ? (Number(cost) || 0) : 0,
          remittance_name_input: defaultRemittanceName || null
        } as PendingPaymentItem);
      });

      // Process rejected requests
      rejectedRequests?.forEach(req => {
        if (req.quotation_items) {
          processedItems.push({
            ...(req.quotation_items as any),
            quotations: req.quotation_items.quotations,
            kols: req.quotation_items.kols,
            payment_request_id: req.id,
            rejection_reason: req.rejection_reason,
            rejected_by: req.rejected_by,
            rejected_at: req.rejected_at,
            attachments: req.attachment_file_path ? JSON.parse(req.attachment_file_path) : [],
            invoice_number_input: req.invoice_number,
            is_selected: false,
            merge_type: req.merge_type as 'account' | null,
            merge_group_id: req.merge_group_id,
            is_merge_leader: req.is_merge_leader,
            merge_color: req.merge_color || '',
            cost_amount_input: req.cost_amount ?? ((req.quotation_items.cost !== null && req.quotation_items.cost !== undefined) ? (req.quotation_items.cost * (req.quotation_items.quantity || 1)) : 0),
            remittance_name_input: req.quotation_items.remittance_name || null
          } as PendingPaymentItem);
        }
      });

      // Process draft requests
      draftRequests?.forEach(req => {
        if (req.quotation_items) {
          processedItems.push({
            ...(req.quotation_items as any),
            quotations: req.quotation_items.quotations,
            kols: req.quotation_items.kols,
            payment_request_id: req.id,
            rejection_reason: null,
            rejected_by: null,
            rejected_at: null,
            attachments: req.attachment_file_path ? JSON.parse(req.attachment_file_path) : [],
            invoice_number_input: req.invoice_number,
            is_selected: false,
            merge_type: req.merge_type as 'account' | null,
            merge_group_id: req.merge_group_id,
            is_merge_leader: req.is_merge_leader,
            merge_color: req.merge_color || '',
            cost_amount_input: req.cost_amount ?? ((req.quotation_items.cost !== null && req.quotation_items.cost !== undefined) ? (req.quotation_items.cost * (req.quotation_items.quantity || 1)) : 0),
            remittance_name_input: req.quotation_items.remittance_name || null
          } as PendingPaymentItem);
        }
      });

      // Handle merge grouping visualization
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
      }).sort((a, b) => (a.rejection_reason ? -1 : 1));

      setItems(finalProcessedItems);
    } catch (error: unknown) {
      toast.error('載入資料失敗: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCostAmountChange = (itemId: string, newCost: string) => {
    const costValue = newCost === '' ? 0 : parseFloat(newCost);
    if (!isNaN(costValue)) {
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, cost_amount_input: costValue } : item
      ));
    }
  };

  const handleRemittanceNameChange = (itemId: string, newValue: string) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, remittance_name_input: newValue } : item
    ));
  };

  const handleSaveCost = async (itemId: string, newCost: number, remittanceName: string | null) => {
    try {
      const { error } = await supabase
        .from('quotation_items')
        .update({
          cost: newCost,
          remittance_name: remittanceName
        })
        .eq('id', itemId);

      if (error) throw error;

      setItems(prev => prev.map(item =>
        item.id === itemId ? {
          ...item,
          cost_amount_input: newCost,
          remittance_name_input: remittanceName
        } : item
      ));

      toast.success('已儲存');
    } catch (error: unknown) {
      toast.error('儲存失敗: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  useEffect(() => { fetchPendingItems() }, [fetchPendingItems]);

  const filteredItems = useMemo(() => {
    return items.filter(item =>
      (item.quotations?.project_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.kols?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.quotations?.clients?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm, items]);

  const { projectGroups, toggleProject } = usePaymentGrouping(filteredItems)

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
      } catch (error: unknown) {
        toast.error('同步附件狀態至資料庫失敗: ' + (error instanceof Error ? error.message : String(error)));
        fetchPendingItems();
      }
    }
  }

  const handleInvoiceNumberChange = async (itemId: string, inputValue: string) => {
    let formattedValue = inputValue.toUpperCase();

    if (formattedValue.length > 2 && formattedValue[2] !== '-') {
      formattedValue = formattedValue.slice(0, 2) + '-' + formattedValue.slice(2);
    }

    if (formattedValue.length > 11) {
      formattedValue = formattedValue.slice(0, 11);
    }

    const updatedItem = items.find(i => i.id === itemId);
    if (!updatedItem) return;

    setItems(prevItems => prevItems.map(item => {
      if (updatedItem.merge_group_id && item.merge_group_id === updatedItem.merge_group_id) {
        return { ...item, invoice_number_input: formattedValue };
      }
      if (item.id === itemId) {
        return { ...item, invoice_number_input: formattedValue };
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
            .update({ invoice_number: formattedValue })
            .eq('id', leaderItem.payment_request_id);

          if (error) throw error;
        }
      } catch (error: unknown) {
        toast.error('同步發票號碼至資料庫失敗: ' + (error instanceof Error ? error.message : String(error)));
      }
    }
  };

  const handleMergeSelection = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedForMerge(prev => [...prev, itemId]);
    } else {
      setSelectedForMerge(prev => prev.filter(id => id !== itemId));
    }
  };

  const handleMergeSubmit = async () => {
    if (selectedForMerge.length < 2) {
      toast.error('請至少選擇兩個項目進行合併');
      return;
    }

    if (!selectedMergeType) {
      toast.error('請選擇合併類型');
      return;
    }

    try {
      const { error } = await supabase.rpc('create_payment_request_group', {
        p_quotation_item_ids: selectedForMerge,
        p_merge_type: selectedMergeType
      });

      if (error) throw error;

      toast.success('合併成功');
      setSelectedForMerge([]);
      setSelectedMergeType(null);
      setIsMergeMode(false);
      fetchPendingItems();
    } catch (error: unknown) {
      toast.error('合併失敗: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleUnmerge = async (groupId: string) => {
    try {
      const { error } = await supabase.rpc('ungroup_payment_requests', {
        p_group_id: groupId
      });

      if (error) throw error;

      toast.success('已解除合併');
      fetchPendingItems();
    } catch (error: unknown) {
      toast.error('解除合併失敗: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const canMergeWith = (item: PendingPaymentItem) => {
    if (selectedForMerge.length === 0) return true;
    const firstItemId = selectedForMerge[0];
    const firstItem = items.find(i => i.id === firstItemId);
    if (!firstItem) return false;
    return item.kol_id === firstItem.kol_id;
  };

  const canSelectForPayment = (item: PendingPaymentItem) => {
    return isItemReady(item);
  };

  const handlePaymentSelection = (itemId: string, checked: boolean) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, is_selected: checked } : item
    ));
  };

  const handleSubmitPayment = async () => {
    const selectedItems = items.filter(item => item.is_selected);
    if (selectedItems.length === 0) {
      toast.error('請選擇要請款的項目');
      return;
    }

    try {
      const groups = new Map<string, PendingPaymentItem[]>();
      const individualItems: PendingPaymentItem[] = [];

      selectedItems.forEach(item => {
        if (item.merge_group_id) {
          if (!groups.has(item.merge_group_id)) {
            groups.set(item.merge_group_id, []);
          }
          groups.get(item.merge_group_id)!.push(item);
        } else {
          individualItems.push(item);
        }
      });

      for (const [groupId, groupItems] of Array.from(groups.entries())) {
        const allGroupItems = items.filter(i => i.merge_group_id === groupId);
        if (groupItems.length !== allGroupItems.length) {
          toast.error('合併項目必須全部一起送出');
          return;
        }
      }

      for (const item of individualItems) {
        if (item.payment_request_id) {
          const { error } = await supabase
            .from('payment_requests')
            .update({
              verification_status: 'pending',
              request_date: new Date().toISOString(),
              rejection_reason: null,
              rejected_by: null,
              rejected_at: null,
              cost_amount: item.cost_amount_input,
              invoice_number: item.invoice_number_input,
              attachment_file_path: JSON.stringify(item.attachments)
            })
            .eq('id', item.payment_request_id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('payment_requests')
            .insert({
              quotation_item_id: item.id,
              verification_status: 'pending',
              request_date: new Date().toISOString(),
              cost_amount: item.cost_amount_input,
              invoice_number: item.invoice_number_input,
              attachment_file_path: JSON.stringify(item.attachments)
            });
          if (error) throw error;
        }
      }

      for (const [groupId, groupItems] of Array.from(groups.entries())) {
        const leader = groupItems.find((i: PendingPaymentItem) => i.is_merge_leader);
        if (!leader) continue;

        for (const item of groupItems) {
          if (item.payment_request_id) {
            const { error } = await supabase
              .from('payment_requests')
              .update({
                verification_status: 'pending',
                request_date: new Date().toISOString(),
                rejection_reason: null,
                rejected_by: null,
                rejected_at: null,
                cost_amount: item.cost_amount_input,
                invoice_number: leader.invoice_number_input,
                attachment_file_path: JSON.stringify(leader.attachments)
              })
              .eq('id', item.payment_request_id);

            if (error) throw error;
          }
        }
      }

      toast.success('送出請款申請成功');
      fetchPendingItems();
    } catch (error: unknown) {
      toast.error('送出失敗: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">待請款項目</h1>
            <p className="text-muted-foreground mt-1 text-sm">管理所有待請款的報價項目</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isMergeMode && (
              <Button variant="outline" className="border-border" onClick={() => {
                setIsMergeMode(true);
                setSelectedMergeType('account');
              }}>
                <Unlink className="w-4 h-4 mr-2" />
                合併模式
              </Button>
            )}
            <Button onClick={handleSubmitPayment} disabled={!items.some(i => i.is_selected)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <CheckCircle className="w-4 h-4 mr-2" />
              送出請款
            </Button>
          </div>
        </div>

        {isMergeMode && (
          <div className="flex flex-wrap items-center gap-2 bg-primary/10 px-4 py-3 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm text-primary font-medium">
              {selectedForMerge.length > 0 ? `已選擇 ${selectedForMerge.length} 筆` : '請選擇合併項目'}
            </span>
            <select
              className="text-sm border-border bg-secondary text-foreground rounded-md focus:border-primary focus:ring-primary"
              value={selectedMergeType || ''}
              onChange={(e) => setSelectedMergeType(e.target.value as 'account')}
            >
              <option value="">選擇合併類型...</option>
              <option value="account">帳號合併</option>
            </select>
            <Button size="sm" onClick={handleMergeSubmit} disabled={!selectedMergeType || selectedForMerge.length < 2} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Unlink className="w-4 h-4 mr-2" />
              確認合併
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              setIsMergeMode(false);
              setSelectedForMerge([]);
              setSelectedMergeType(null);
            }}>
              <X className="w-4 h-4" />
              取消
            </Button>
          </div>
        )}

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="搜尋專案、KOL/服務、執行內容..."
            className="pl-10 bg-secondary border-border w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">載入中...</div>
      ) : (
        <ProjectGroupView
          groups={projectGroups}
          onToggleProject={toggleProject}
          selectedMergeType={selectedMergeType}
          selectedForMerge={selectedForMerge}
          isMergeMode={isMergeMode}
          canMergeWith={canMergeWith}
          canSelectForPayment={canSelectForPayment}
          onCostChange={handleCostAmountChange}
          onRemittanceNameChange={handleRemittanceNameChange}
          onSaveCost={handleSaveCost}
          onMergeSelection={handleMergeSelection}
          onUnmerge={handleUnmerge}
          onClearRejection={clearRejectionReason}
          onFileModalOpen={(item) => {
            setSelectedItemForFile(item);
            setFileModalOpen(true);
          }}
          onInvoiceChange={handleInvoiceNumberChange}
          onSelect={handlePaymentSelection}
          selectedItems={items.filter(i => i.is_selected).map(i => i.id)}
          shouldShowControls={(item: PendingPaymentItem) => true}
          isValidInvoiceFormat={isValidInvoiceFormat}
        />
      )}

      {selectedItemForFile && (
        <PendingPaymentFileModal
          isOpen={fileModalOpen}
          onClose={() => {
            setFileModalOpen(false);
            setSelectedItemForFile(null);
          }}
          itemId={selectedItemForFile.id}
          projectName={selectedItemForFile.quotations?.project_name || ''}
          currentAttachments={selectedItemForFile.attachments || []}
          onUpdate={handleFileUpdate}
        />
      )}
    </div>
  )
}