// Custom hook for fetching and managing pending payment items

import { useState, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Database } from '@/types/database.types'
import type { PendingPaymentItem, PendingPaymentAttachment } from '@/lib/pending-payments/grouping-utils'

type QuotationItemWithDetails = (Database['public']['Tables']['quotation_items']['Row'] & {
    quotations: Database['public']['Tables']['quotations']['Row'] & {
        clients: Pick<Database['public']['Tables']['clients']['Row'], 'name'> | null
    } | null
    kols: Pick<Database['public']['Tables']['kols']['Row'], 'id' | 'name' | 'real_name' | 'bank_info'> | null
});

const MERGE_COLORS = ['bg-red-100', 'bg-blue-100', 'bg-green-100', 'bg-yellow-100', 'bg-purple-100', 'bg-pink-100']

export function usePendingItems() {
    const [items, setItems] = useState<PendingPaymentItem[]>([])
    const [loading, setLoading] = useState(true)

    const fetchPendingItems = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch rejected requests
            const { data: rejectedRequests, error: rejectedError } = await supabase
                .from('payment_requests')
                .select(`*, quotation_items:quotation_item_id (*, quotations:quotation_id(*, clients:client_id(name)), kols:kol_id(id, name, real_name, bank_info))`)
                .eq('verification_status', 'rejected')

            if (rejectedError) throw new Error(`獲取駁回項目失敗: ${rejectedError.message}`);

            const rejectedItemIds = new Set(rejectedRequests.map(req => req.quotation_item_id));

            // Fetch available items
            const { data: availableItemsData, error: itemsError } = await supabase.rpc('get_available_pending_payments');
            if (itemsError) throw new Error(`獲取全新項目失敗: ${itemsError.message}`);

            const availableItems = (availableItemsData as any[]).filter(item => !rejectedItemIds.has(item.id));

            // Fetch costs for available items separately since RPC might be missing it
            const availableItemIds = availableItems.map(item => item.id);
            let costsMap = new Map<string, number | null>();

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
                const cost = costsMap.get(item.id);
                processedItems.push({
                    ...(item as QuotationItemWithDetails),
                    quotations: item.quotations ? JSON.parse(JSON.stringify(item.quotations)) : null,
                    kols: item.kols ? JSON.parse(JSON.stringify(item.kols)) : null,
                    merge_type: null,
                    merge_group_id: null,
                    is_merge_leader: false,
                    merge_color: '',
                    rejection_reason: null,
                    is_selected: false,
                    invoice_number_input: null,
                    attachments: [],
                    payment_request_id: null,
                    cost_amount_input: (cost !== null && cost !== undefined) ? (cost * (item.quantity || 1)) : 0
                });
            });

            // Process rejected items
            rejectedRequests.forEach(req => {
                if (req.quotation_items) {
                    processedItems.push({
                        ...(req.quotation_items as QuotationItemWithDetails),
                        payment_request_id: req.id,
                        rejection_reason: req.rejection_reason,
                        attachments: req.attachment_file_path ? JSON.parse(req.attachment_file_path) : [],
                        invoice_number_input: req.invoice_number,
                        is_selected: false,
                        merge_type: req.merge_type as 'account' | null,
                        merge_group_id: req.merge_group_id,
                        is_merge_leader: req.is_merge_leader,
                        merge_color: req.merge_color || '',
                        cost_amount_input: req.cost_amount ?? ((req.quotation_items.cost !== null && req.quotation_items.cost !== undefined) ? (req.quotation_items.cost * (req.quotation_items.quantity || 1)) : 0)
                    });
                }
            });

            // Assign merge group leaders and colors
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
                    return {
                        ...item,
                        is_merge_leader: !!isLeader,
                        merge_color: item.merge_color || mergeGroupColors.get(item.merge_group_id) || ''
                    };
                }
                return item;
            }).sort((a, b) => (a.rejection_reason ? -1 : 1));

            setItems(finalProcessedItems);
        } catch (error: any) {
            toast.error('載入資料失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateItem = useCallback((itemId: string, updates: Partial<PendingPaymentItem>) => {
        setItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, ...updates } : item
        ));
    }, []);

    const updateItemsByGroup = useCallback((groupId: string, updates: Partial<PendingPaymentItem>) => {
        setItems(prev => prev.map(item =>
            item.merge_group_id === groupId ? { ...item, ...updates } : item
        ));
    }, []);

    return {
        items,
        setItems,
        loading,
        setLoading,
        fetchPendingItems,
        updateItem,
        updateItemsByGroup
    }
}
