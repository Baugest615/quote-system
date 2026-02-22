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

    const applyToUnmodified = useCallback((
        items: PendingPaymentItem[],
        setItems: React.Dispatch<React.SetStateAction<PendingPaymentItem[]>>
    ): number => {
        let count = 0
        setItems(prev => prev.map(item => {
            if (!item.isSettingsModified) {
                count++
                return {
                    ...item,
                    expense_type_input: settings.expenseType,
                    accounting_subject_input: settings.accountingSubject,
                    expected_payment_month_input: settings.paymentMonth,
                }
            }
            return item
        }))
        if (count > 0) {
            toast.success(`已套用至 ${count} 筆未修改項目`)
        } else {
            toast.info('沒有未修改的項目需要套用')
        }
        return count
    }, [settings])

    return {
        settings,
        setExpenseType,
        setAccountingSubject,
        setPaymentMonth,
        applyToUnmodified,
        isCollapsed,
        toggleCollapsed,
    }
}
