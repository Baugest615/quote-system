'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PendingPaymentFileModal } from '@/components/pending-payments/PendingPaymentFileModal'
import { BankInfoEditModal } from '@/components/pending-payments/BankInfoEditModal'
import { ProjectGroupView } from '@/components/pending-payments/ProjectGroupView'
import { BatchSettingsBar } from '@/components/pending-payments/BatchSettingsBar'
import { usePaymentGrouping } from '@/hooks/payments/usePaymentGrouping'
import { useBatchSettings } from '@/hooks/pending-payments/useBatchSettings'
import { isItemReady } from '@/lib/pending-payments/grouping-utils'
import {
  Search, Paperclip, Receipt, Trash2, AlertCircle,
  FileText, Users, Unlink, X, CheckCircle, LayoutList, FolderKanban, Save,
  ChevronsUpDown, FolderOpen, FolderClosed, Filter
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Database, Json } from '@/types/database.types'
import { PendingPaymentItem, PendingPaymentAttachment } from '@/lib/payments/types'
import type { KolBankInfo } from '@/types/schemas'
import { getDefaultExpenseByBankType } from '@/types/custom.types'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import { queryKeys } from '@/lib/queryKeys'

const MERGE_COLORS = ['bg-chart-3/15', 'bg-chart-4/15', 'bg-chart-1/15', 'bg-chart-2/15', 'bg-chart-5/15', 'bg-destructive/15']

// 預設預計支付月份：下個月
const getNextMonth = () => {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${next.getFullYear()}年${next.getMonth() + 1}月`
}
const DEFAULT_PAYMENT_MONTH = getNextMonth()

const isValidInvoiceFormat = (invoiceNumber: string | null | undefined): boolean => {
  if (!invoiceNumber) return false;
  const invoiceRegex = /^[A-Z]{2}-\d{8}$/;
  return invoiceRegex.test(invoiceNumber);
};

export default function PendingPaymentsPage() {
  const queryClient = useQueryClient()
  const { defaultSubjectsMap } = useExpenseDefaults()
  const [items, setItems] = useState<PendingPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
  const [selectedMergeType, setSelectedMergeType] = useState<'account' | null>(null)
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [selectedItemForFile, setSelectedItemForFile] = useState<PendingPaymentItem | null>(null)
  const [bankInfoModalOpen, setBankInfoModalOpen] = useState(false)
  const [selectedItemForBankInfo, setSelectedItemForBankInfo] = useState<PendingPaymentItem | null>(null)
  const [isMergeMode, setIsMergeMode] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'rejected' | 'in_progress' | 'complete'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'pending' | 'cost' | 'date_desc' | 'date_asc'>('name')
  const [kolFilter, setKolFilter] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const batchSettings = useBatchSettings()
  // 防止快速連續操作時重複 INSERT draft payment_request
  const pendingInserts = useRef<Set<string>>(new Set())

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

        const expenseDefaults = getDefaultExpenseByBankType(item.kols);
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
          original_cost: (cost !== null && cost !== undefined) ? (Number(cost) || 0) : 0,
          remittance_name_input: defaultRemittanceName || null,
          expense_type_input: expenseDefaults.expenseType,
          accounting_subject_input: expenseDefaults.accountingSubject,
          expected_payment_month_input: DEFAULT_PAYMENT_MONTH,
          isSettingsModified: false,
        } as PendingPaymentItem);
      });

      // Process rejected requests
      rejectedRequests?.forEach(req => {
        if (req.quotation_items) {
          const rejDefaults = getDefaultExpenseByBankType(req.quotation_items.kols);
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
            original_cost: req.cost_amount ?? ((req.quotation_items.cost !== null && req.quotation_items.cost !== undefined) ? (req.quotation_items.cost * (req.quotation_items.quantity || 1)) : 0),
            remittance_name_input: req.quotation_items.remittance_name || null,
            expense_type_input: (req as any).expense_type || rejDefaults.expenseType,
            accounting_subject_input: (req as any).accounting_subject || rejDefaults.accountingSubject,
            expected_payment_month_input: (req as any).expected_payment_month || DEFAULT_PAYMENT_MONTH,
            isSettingsModified: !!((req as any).expense_type && (req as any).expense_type !== rejDefaults.expenseType) || !!((req as any).accounting_subject && (req as any).accounting_subject !== rejDefaults.accountingSubject) || !!((req as any).expected_payment_month && (req as any).expected_payment_month !== DEFAULT_PAYMENT_MONTH),
          } as PendingPaymentItem);
        }
      });

      // Process draft requests
      draftRequests?.forEach(req => {
        if (req.quotation_items) {
          const draftDefaults = getDefaultExpenseByBankType(req.quotation_items.kols);
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
            original_cost: req.cost_amount ?? ((req.quotation_items.cost !== null && req.quotation_items.cost !== undefined) ? (req.quotation_items.cost * (req.quotation_items.quantity || 1)) : 0),
            remittance_name_input: req.quotation_items.remittance_name || null,
            expense_type_input: (req as any).expense_type || draftDefaults.expenseType,
            accounting_subject_input: (req as any).accounting_subject || draftDefaults.accountingSubject,
            expected_payment_month_input: (req as any).expected_payment_month || DEFAULT_PAYMENT_MONTH,
            isSettingsModified: !!((req as any).expense_type && (req as any).expense_type !== draftDefaults.expenseType) || !!((req as any).accounting_subject && (req as any).accounting_subject !== draftDefaults.accountingSubject) || !!((req as any).expected_payment_month && (req as any).expected_payment_month !== DEFAULT_PAYMENT_MONTH),
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

  // 持久化帳務設定到 DB（INSERT 或 UPDATE draft payment_request）
  const saveAccountingSettings = useCallback(async (
    itemId: string,
    expenseType: string,
    accountingSubject: string,
    expectedPaymentMonth: string,
    paymentRequestId: string | null
  ) => {
    const payload = {
      expense_type: expenseType,
      accounting_subject: accountingSubject || null,
      expected_payment_month: expectedPaymentMonth,
    }
    try {
      if (paymentRequestId) {
        // 已有記錄（draft 或 rejected）→ UPDATE
        await supabase
          .from('payment_requests')
          .update(payload)
          .eq('id', paymentRequestId)
      } else {
        // 避免快速連續修改造成重複 INSERT
        if (pendingInserts.current.has(itemId)) return
        pendingInserts.current.add(itemId)
        try {
          const { data } = await supabase
            .from('payment_requests')
            .insert({
              quotation_item_id: itemId,
              verification_status: 'pending',
              ...payload,
            })
            .select('id')
            .single()
          if (data) {
            setItems(prev => prev.map(item =>
              item.id === itemId ? { ...item, payment_request_id: data.id } : item
            ))
          }
        } finally {
          pendingInserts.current.delete(itemId)
        }
      }
    } catch (error) {
      console.error('儲存帳務設定失敗:', error)
    }
  }, [])

  const handleExpenseTypeChange = (itemId: string, newType: string) => {
    const defaultSubject = defaultSubjectsMap[newType] || ''
    const current = items.find(i => i.id === itemId)
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, expense_type_input: newType, accounting_subject_input: defaultSubject, isSettingsModified: true } : item
    ))
    if (current) {
      saveAccountingSettings(itemId, newType, defaultSubject, current.expected_payment_month_input, current.payment_request_id)
    }
  };

  const handleAccountingSubjectChange = (itemId: string, newSubject: string) => {
    const current = items.find(i => i.id === itemId)
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, accounting_subject_input: newSubject, isSettingsModified: true } : item
    ))
    if (current) {
      saveAccountingSettings(itemId, current.expense_type_input, newSubject, current.expected_payment_month_input, current.payment_request_id)
    }
  };

  const handleExpectedPaymentMonthChange = (itemId: string, newMonth: string) => {
    const current = items.find(i => i.id === itemId)
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, expected_payment_month_input: newMonth, isSettingsModified: true } : item
    ))
    if (current) {
      saveAccountingSettings(itemId, current.expense_type_input, current.accounting_subject_input, newMonth, current.payment_request_id)
    }
  };

  const handleToggleExpand = useCallback((itemId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }, [])

  const handleResetToBatch = useCallback((itemId: string) => {
    const { expenseType, accountingSubject, paymentMonth } = batchSettings.settings
    const current = items.find(i => i.id === itemId)
    setItems(prev => prev.map(item =>
      item.id === itemId ? {
        ...item,
        expense_type_input: expenseType,
        accounting_subject_input: accountingSubject,
        expected_payment_month_input: paymentMonth,
        isSettingsModified: false,
      } : item
    ))
    if (current) {
      saveAccountingSettings(itemId, expenseType, accountingSubject, paymentMonth, current.payment_request_id)
    }
  }, [batchSettings.settings, items, saveAccountingSettings])

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
    // 文字搜尋只比對項目層級欄位（KOL、服務、客戶）
    // 專案名稱篩選請使用專案下拉篩選器
    let result = searchTerm
      ? items.filter(item => {
          const term = searchTerm.toLowerCase()
          return (
            (item.kols?.name || '').toLowerCase().includes(term) ||
            item.service.toLowerCase().includes(term) ||
            (item.quotations?.clients?.name || '').toLowerCase().includes(term)
          )
        })
      : items

    // KOL 篩選：在分組前過濾，確保只顯示匹配的項目
    if (kolFilter) {
      result = result.filter(item => item.kol_id === kolFilter)
    }

    return result
  }, [searchTerm, items, kolFilter]);

  const { projectGroups, toggleProject, expandAll, collapseAll, isAllExpanded } = usePaymentGrouping(filteredItems)

  // 摘要統計
  const stats = useMemo(() => {
    const totalProjects = projectGroups.length
    const totalItems = projectGroups.reduce((sum, g) => sum + g.totalItems, 0)
    const totalReady = projectGroups.reduce((sum, g) => sum + g.readyItems, 0)
    const totalPending = totalItems - totalReady
    const totalCost = projectGroups.reduce((sum, g) => sum + g.totalCost, 0)
    const rejectedCount = projectGroups.filter(g => g.hasRejected).length
    return { totalProjects, totalItems, totalReady, totalPending, totalCost, rejectedCount }
  }, [projectGroups])

  // 篩選下拉選項：KOL 列表（從所有項目中提取不重複）
  const kolOptions = useMemo(() => {
    const kolMap = new Map<string, string>()
    items.forEach(item => {
      if (item.kol_id && item.kols?.name) {
        kolMap.set(item.kol_id, item.kols.name)
      }
    })
    return Array.from(kolMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  // 篩選下拉選項：專案列表
  const projectOptions = useMemo(() => {
    return projectGroups
      .map(g => ({ id: g.projectId, name: g.projectName }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projectGroups])

  // 篩選下拉選項：成案月份列表
  const monthOptions = useMemo(() => {
    const months = new Set<string>()
    projectGroups.forEach(g => {
      if (g.quotationCreatedAt) {
        const d = new Date(g.quotationCreatedAt)
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    })
    return Array.from(months).sort().reverse()
  }, [projectGroups])

  // 是否有啟用的進階篩選
  const hasActiveFilters = !!(kolFilter || projectFilter || monthFilter)

  const clearAdvancedFilters = useCallback(() => {
    setKolFilter(null)
    setProjectFilter(null)
    setMonthFilter(null)
  }, [])

  // 篩選 + 排序後的顯示群組
  const displayGroups = useMemo(() => {
    let groups = [...projectGroups]

    // KOL 篩選已在 filteredItems 階段完成（項目層級過濾）

    // 進階篩選：專案
    if (projectFilter) {
      groups = groups.filter(g => g.projectId === projectFilter)
    }

    // 進階篩選：成案月份
    if (monthFilter) {
      groups = groups.filter(g => {
        if (!g.quotationCreatedAt) return false
        const d = new Date(g.quotationCreatedAt)
        const gMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return gMonth === monthFilter
      })
    }

    // 狀態篩選
    if (statusFilter === 'rejected') {
      groups = groups.filter(g => g.hasRejected)
    } else if (statusFilter === 'in_progress') {
      groups = groups.filter(g => !g.hasRejected && g.readyItems < g.totalItems)
    } else if (statusFilter === 'complete') {
      groups = groups.filter(g => !g.hasRejected && g.readyItems === g.totalItems)
    }

    // 排序
    if (sortBy === 'pending') {
      groups.sort((a, b) => (b.totalItems - b.readyItems) - (a.totalItems - a.readyItems))
    } else if (sortBy === 'cost') {
      groups.sort((a, b) => b.totalCost - a.totalCost)
    } else if (sortBy === 'date_desc') {
      groups.sort((a, b) => {
        const dateA = a.quotationCreatedAt ? new Date(a.quotationCreatedAt).getTime() : 0
        const dateB = b.quotationCreatedAt ? new Date(b.quotationCreatedAt).getTime() : 0
        return dateB - dateA
      })
    } else if (sortBy === 'date_asc') {
      groups.sort((a, b) => {
        const dateA = a.quotationCreatedAt ? new Date(a.quotationCreatedAt).getTime() : 0
        const dateB = b.quotationCreatedAt ? new Date(b.quotationCreatedAt).getTime() : 0
        return dateA - dateB
      })
    }
    // 'name' 使用原始排序（駁回優先 → 專案名稱）

    return groups
  }, [projectGroups, statusFilter, sortBy, projectFilter, monthFilter])

  // 計算目前篩選結果中的所有項目 ID
  const filteredItemIds = useMemo(() => {
    return displayGroups.flatMap(g => g.items.map(item => item.id))
  }, [displayGroups])

  const handleApplyBatchToFiltered = useCallback(async () => {
    batchSettings.applyToFiltered(filteredItemIds, setItems)
    // 持久化到 DB（平行處理）
    const { expenseType, accountingSubject, paymentMonth } = batchSettings.settings
    const affectedItems = items.filter(i => filteredItemIds.includes(i.id))
    await Promise.all(
      affectedItems.map(item =>
        saveAccountingSettings(item.id, expenseType, accountingSubject, paymentMonth, item.payment_request_id)
      )
    )
  }, [batchSettings, filteredItemIds, items, saveAccountingSettings])

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

    // 合併群組：找 leader 作為寫入目標
    const targetItem = updatedItem.merge_group_id
      ? items.find(i => i.merge_group_id === updatedItem.merge_group_id && i.is_merge_leader) || updatedItem
      : updatedItem;
    const targetId = targetItem.id;

    // 更新前端 state
    setItems(prevItems => prevItems.map(item => {
      if (updatedItem.merge_group_id && item.merge_group_id === updatedItem.merge_group_id) {
        return { ...item, attachments: newAttachments };
      }
      if (item.id === itemId) {
        return { ...item, attachments: newAttachments };
      }
      return item;
    }));

    const attachmentJson = newAttachments.length > 0 ? JSON.stringify(newAttachments) : null;

    try {
      if (targetItem.payment_request_id) {
        // 已有 draft/rejected 記錄 → UPDATE
        const { error } = await supabase
          .from('payment_requests')
          .update({ attachment_file_path: attachmentJson })
          .eq('id', targetItem.payment_request_id);
        if (error) throw error;
      } else {
        // 全新項目 → INSERT draft 記錄
        if (pendingInserts.current.has(targetId)) return;
        pendingInserts.current.add(targetId);
        try {
          const { data, error } = await supabase
            .from('payment_requests')
            .insert({
              quotation_item_id: targetId,
              verification_status: 'pending',
              attachment_file_path: attachmentJson,
              expense_type: targetItem.expense_type_input || null,
              accounting_subject: targetItem.accounting_subject_input || null,
              expected_payment_month: targetItem.expected_payment_month_input || null,
            })
            .select('id')
            .single();
          if (error) throw error;
          if (data) {
            // 回寫 payment_request_id 到 state，後續更新走 UPDATE 路徑
            setItems(prev => prev.map(item =>
              item.id === targetId ? { ...item, payment_request_id: data.id } : item
            ));
          }
        } finally {
          pendingInserts.current.delete(targetId);
        }
      }
    } catch (error: unknown) {
      toast.error('同步附件至資料庫失敗: ' + (error instanceof Error ? error.message : String(error)));
      fetchPendingItems();
    }
  }

  const handleOpenBankInfoModal = (item: PendingPaymentItem) => {
    setSelectedItemForBankInfo(item)
    setBankInfoModalOpen(true)
  }

  const handleBankInfoSaved = (kolId: string, updatedBankInfo: KolBankInfo) => {
    let newRemittanceName: string | null = null
    if (updatedBankInfo.bankType === 'company' && updatedBankInfo.companyAccountName) {
      newRemittanceName = updatedBankInfo.companyAccountName
    } else if (updatedBankInfo.bankType === 'individual' && updatedBankInfo.personalAccountName) {
      newRemittanceName = updatedBankInfo.personalAccountName
    }

    setItems(prev => prev.map(item => {
      if (item.kol_id === kolId) {
        return {
          ...item,
          kols: item.kols ? { ...item.kols, bank_info: updatedBankInfo as unknown as Json } : item.kols,
          remittance_name_input: item.remittance_name_input || newRemittanceName,
        }
      }
      return item
    }))
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
              attachment_file_path: JSON.stringify(item.attachments),
              expense_type: item.expense_type_input,
              accounting_subject: item.accounting_subject_input || null,
              expected_payment_month: item.expected_payment_month_input,
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
              attachment_file_path: JSON.stringify(item.attachments),
              expense_type: item.expense_type_input,
              accounting_subject: item.accounting_subject_input || null,
              expected_payment_month: item.expected_payment_month_input,
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
                attachment_file_path: JSON.stringify(leader.attachments),
                expense_type: item.expense_type_input,
                accounting_subject: item.accounting_subject_input || null,
                expected_payment_month: item.expected_payment_month_input,
              })
              .eq('id', item.payment_request_id);

            if (error) throw error;
          }
        }
      }

      toast.success('送出請款申請成功');
      fetchPendingItems();
      // 同步 invalidate 請款申請頁面的快取，避免使用者切換頁面時看到舊資料
      queryClient.invalidateQueries({ queryKey: [...queryKeys.paymentRequests] });
    } catch (error: unknown) {
      toast.error('送出失敗: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const STATUS_FILTERS = [
    { key: 'all' as const, label: '全部' },
    { key: 'rejected' as const, label: '有駁回', count: stats.rejectedCount },
    { key: 'in_progress' as const, label: '進行中', count: stats.totalProjects - stats.rejectedCount - projectGroups.filter(g => !g.hasRejected && g.readyItems === g.totalItems).length },
    { key: 'complete' as const, label: '已就緒', count: projectGroups.filter(g => !g.hasRejected && g.readyItems === g.totalItems).length },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 標題 + 操作按鈕 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">待請款專案管理</h1>
          <p className="text-muted-foreground mt-1 text-sm">管理所有待請款的專案項目</p>
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

      {/* 摘要統計 */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-lg border border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">專案數</div>
            <div className="text-xl font-bold mt-0.5">{stats.totalProjects}</div>
          </div>
          <div className="bg-card rounded-lg border border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">總項目</div>
            <div className="text-xl font-bold mt-0.5">{stats.totalItems}</div>
          </div>
          <div className="bg-card rounded-lg border border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">待處理</div>
            <div className="text-xl font-bold mt-0.5 text-warning">{stats.totalPending}</div>
          </div>
          <div className="bg-card rounded-lg border border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">總成本</div>
            <div className="text-xl font-bold mt-0.5">NT$ {stats.totalCost.toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">

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

        {/* 搜尋 + 篩選 + 排序 + 展開/收合 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="搜尋專案、KOL/服務、客戶..."
              className="pl-10 bg-secondary border-border w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 排序 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 text-sm bg-secondary border border-border text-foreground rounded-md px-3 focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="name">專案名稱排序</option>
            <option value="date_desc">成案日期（新→舊）</option>
            <option value="date_asc">成案日期（舊→新）</option>
            <option value="pending">待請款數（多→少）</option>
            <option value="cost">總成本（高→低）</option>
          </select>

          {/* 展開/收合全部 */}
          <Button
            variant="outline"
            size="sm"
            className="border-border"
            onClick={isAllExpanded ? collapseAll : expandAll}
          >
            {isAllExpanded ? (
              <><FolderClosed className="w-4 h-4 mr-1.5" />收合全部</>
            ) : (
              <><FolderOpen className="w-4 h-4 mr-1.5" />展開全部</>
            )}
          </Button>
        </div>

        {/* 進階篩選列 */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />

          {/* KOL 篩選 */}
          <select
            value={kolFilter || ''}
            onChange={(e) => setKolFilter(e.target.value || null)}
            className="h-8 text-xs bg-secondary border border-border text-foreground rounded-md px-2 focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">全部 KOL</option>
            {kolOptions.map(kol => (
              <option key={kol.id} value={kol.id}>{kol.name}</option>
            ))}
          </select>

          {/* 專案篩選 */}
          <select
            value={projectFilter || ''}
            onChange={(e) => setProjectFilter(e.target.value || null)}
            className="h-8 text-xs bg-secondary border border-border text-foreground rounded-md px-2 focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">全部專案</option>
            {projectOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* 成案月份篩選 */}
          <select
            value={monthFilter || ''}
            onChange={(e) => setMonthFilter(e.target.value || null)}
            className="h-8 text-xs bg-secondary border border-border text-foreground rounded-md px-2 focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">全部月份</option>
            {monthOptions.map(m => {
              const [year, month] = m.split('-')
              return <option key={m} value={m}>{year}年{parseInt(month)}月</option>
            })}
          </select>

          {/* 清除篩選按鈕 */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAdvancedFilters}
            >
              <X className="w-3 h-3 mr-1" />
              清除篩選
            </Button>
          )}
        </div>

        {/* 狀態篩選 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full transition-colors font-medium",
                statusFilter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              )}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span className="ml-1 opacity-70">{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 批次設定面板 */}
      {!loading && (
        <BatchSettingsBar
          expenseType={batchSettings.settings.expenseType}
          accountingSubject={batchSettings.settings.accountingSubject}
          paymentMonth={batchSettings.settings.paymentMonth}
          onExpenseTypeChange={batchSettings.setExpenseType}
          onAccountingSubjectChange={batchSettings.setAccountingSubject}
          onPaymentMonthChange={batchSettings.setPaymentMonth}
          onApplyToFiltered={handleApplyBatchToFiltered}
          filteredItemCount={filteredItemIds.length}
          hasActiveFilters={hasActiveFilters}
          isCollapsed={batchSettings.isCollapsed}
          onToggleCollapse={batchSettings.toggleCollapsed}
        />
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">載入中...</div>
      ) : (
        <ProjectGroupView
          groups={displayGroups}
          onToggleProject={toggleProject}
          expandedRows={expandedRows}
          onToggleExpand={handleToggleExpand}
          batchExpenseType={batchSettings.settings.expenseType}
          batchAccountingSubject={batchSettings.settings.accountingSubject}
          batchPaymentMonth={batchSettings.settings.paymentMonth}
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
          onOpenBankInfoModal={handleOpenBankInfoModal}
          onInvoiceChange={handleInvoiceNumberChange}
          onSelect={handlePaymentSelection}
          onExpenseTypeChange={handleExpenseTypeChange}
          onAccountingSubjectChange={handleAccountingSubjectChange}
          onExpectedPaymentMonthChange={handleExpectedPaymentMonthChange}
          onResetToBatch={handleResetToBatch}
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

      {selectedItemForBankInfo && selectedItemForBankInfo.kols && (
        <BankInfoEditModal
          isOpen={bankInfoModalOpen}
          onClose={() => {
            setBankInfoModalOpen(false)
            setSelectedItemForBankInfo(null)
          }}
          kolId={selectedItemForBankInfo.kols.id}
          kolName={selectedItemForBankInfo.kols.name}
          currentBankInfo={selectedItemForBankInfo.kols.bank_info}
          onSaved={handleBankInfoSaved}
        />
      )}
    </div>
  )
}