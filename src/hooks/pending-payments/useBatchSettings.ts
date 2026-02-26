import { useState, useCallback } from 'react'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import type { PendingPaymentItem } from '@/lib/payments/types'
import { toast } from 'sonner'

export interface BatchSettings {
    expenseType: string
    accountingSubject: string
    paymentMonth: string
}

const getNextMonth = () => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return `${next.getFullYear()}年${next.getMonth() + 1}月`
}

export function useBatchSettings() {
    const { defaultSubjectsMap } = useExpenseDefaults()
    const [settings, setSettings] = useState<BatchSettings>({
        expenseType: '勞務報酬',
        accountingSubject: '勞務成本',
        paymentMonth: getNextMonth(),
    })
    const [isCollapsed, setIsCollapsed] = useState(true)

    const setExpenseType = useCallback((value: string) => {
        const defaultSubject = defaultSubjectsMap[value] || ''
        setSettings(prev => ({
            ...prev,
            expenseType: value,
            accountingSubject: defaultSubject,
        }))
    }, [defaultSubjectsMap])

    const setAccountingSubject = useCallback((value: string) => {
        setSettings(prev => ({ ...prev, accountingSubject: value }))
    }, [])

    const setPaymentMonth = useCallback((value: string) => {
        setSettings(prev => ({ ...prev, paymentMonth: value }))
    }, [])

    const toggleCollapsed = useCallback(() => {
        setIsCollapsed(prev => !prev)
    }, [])

    const applyToFiltered = useCallback((
        visibleItemIds: string[],
        setItems: React.Dispatch<React.SetStateAction<PendingPaymentItem[]>>
    ): number => {
        if (visibleItemIds.length === 0) {
            toast.info('目前沒有可套用的項目')
            return 0
        }
        const idSet = new Set(visibleItemIds)
        let count = 0
        setItems(prev => prev.map(item => {
            if (idSet.has(item.id)) {
                count++
                return {
                    ...item,
                    expense_type_input: settings.expenseType,
                    accounting_subject_input: settings.accountingSubject,
                    expected_payment_month_input: settings.paymentMonth,
                    isSettingsModified: true,
                }
            }
            return item
        }))
        toast.success(`已套用批次設定至 ${count} 筆項目`)
        return count
    }, [settings])

    return {
        settings,
        setExpenseType,
        setAccountingSubject,
        setPaymentMonth,
        applyToFiltered,
        isCollapsed,
        toggleCollapsed,
    }
}
