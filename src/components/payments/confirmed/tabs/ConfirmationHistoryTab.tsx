'use client'

import { useState, useMemo } from 'react'
import { Search, FileText, DollarSign, Calendar, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PaymentConfirmation } from '@/lib/payments/types'
import type { WithholdingSettings } from '@/types/custom.types'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmationRow } from '../ConfirmationRow'

interface ConfirmationHistoryTabProps {
    confirmations: PaymentConfirmation[]
    onToggleExpansion: (id: string) => void
    withholdingRates?: WithholdingSettings | null
    onRevertItem?: (itemId: string) => void
}

export function ConfirmationHistoryTab({
    confirmations,
    onToggleExpansion,
    withholdingRates,
    onRevertItem,
}: ConfirmationHistoryTabProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [sortField, setSortField] = useState<'date' | 'amount' | 'items'>('date')
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })

    // 篩選邏輯
    const filteredConfirmations = useMemo(() => {
        const result = confirmations.filter((confirmation) => {
            const searchLower = searchTerm.toLowerCase()
            const confirmationDate = confirmation.confirmation_date

            if (dateRange.start && confirmationDate < dateRange.start) return false
            if (dateRange.end && confirmationDate > dateRange.end) return false

            const hasMatchingItem = confirmation.payment_confirmation_items.some(item => {
                if (item.source_type === 'personal' || item.expense_claim_id) {
                    const claim = item.expense_claims
                    return (
                        (claim?.project_name || '').toLowerCase().includes(searchLower) ||
                        (claim?.vendor_name || '').toLowerCase().includes(searchLower) ||
                        (claim?.expense_type || '').toLowerCase().includes(searchLower)
                    )
                }

                if (item.source_type === 'quotation' || item.quotation_item_id) {
                    const qi = item.quotation_items
                    return (
                        (qi?.quotations?.project_name || item.project_name_at_confirmation || '').toLowerCase().includes(searchLower) ||
                        (qi?.kols?.name || item.kol_name_at_confirmation || '').toLowerCase().includes(searchLower) ||
                        (qi?.service || item.service_at_confirmation || '').toLowerCase().includes(searchLower) ||
                        (item.kol_name_at_confirmation || '').toLowerCase().includes(searchLower)
                    )
                }

                const request = item.payment_requests
                const quotationItem = request?.quotation_items
                const quotation = quotationItem?.quotations
                const kol = quotationItem?.kols

                return (
                    (quotation?.project_name || '').toLowerCase().includes(searchLower) ||
                    (kol?.name || '').toLowerCase().includes(searchLower) ||
                    (quotationItem?.service || '').toLowerCase().includes(searchLower)
                )
            })

            return (confirmationDate || '').includes(searchTerm) || hasMatchingItem
        })

        result.sort((a, b) => {
            let aValue = 0, bValue = 0
            switch (sortField) {
                case 'date':
                    aValue = new Date(a.confirmation_date).getTime()
                    bValue = new Date(b.confirmation_date).getTime()
                    break
                case 'amount':
                    aValue = a.total_amount
                    bValue = b.total_amount
                    break
                case 'items':
                    aValue = a.total_items
                    bValue = b.total_items
                    break
                default: return 0
            }
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
        })

        return result
    }, [confirmations, searchTerm, sortField, sortDirection, dateRange])

    const handleSort = (field: 'date' | 'amount' | 'items') => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDirection('desc')
        }
    }

    return (
        <div className="space-y-4">
            {/* 控制列 */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg shadow-none border border-border">
                <div className="relative flex-1 w-full md:max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="搜尋日期、專案名稱、KOL/服務或執行內容..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* 日期篩選 */}
                <div className="flex items-center space-x-2 w-full md:w-auto">
                    <div className="flex items-center space-x-2 bg-secondary p-1 rounded-md border">
                        <Calendar className="h-4 w-4 text-muted-foreground ml-2" />
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-transparent border-none text-sm focus:ring-0 p-1 text-muted-foreground"
                            placeholder="開始日期"
                        />
                        <span className="text-muted-foreground">-</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-transparent border-none text-sm focus:ring-0 p-1 text-muted-foreground"
                            placeholder="結束日期"
                        />
                        {(dateRange.start || dateRange.end) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 rounded-full hover:bg-muted"
                                onClick={() => setDateRange({ start: '', end: '' })}
                            >
                                <X className="h-3 w-3 text-muted-foreground" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* 排序按鈕 */}
            <div className="flex space-x-2">
                <Button variant={sortField === 'date' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('date')}>
                    <Calendar className="h-4 w-4 mr-1" /> 日期 {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </Button>
                <Button variant={sortField === 'amount' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('amount')}>
                    <DollarSign className="h-4 w-4 mr-1" /> 金額 {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </Button>
                <Button variant={sortField === 'items' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('items')}>
                    <FileText className="h-4 w-4 mr-1" /> 項目數 {sortField === 'items' && (sortDirection === 'asc' ? '↑' : '↓')}
                </Button>
            </div>

            {/* 列表內容 */}
            {filteredConfirmations.length > 0 ? (
                <div className="space-y-4">
                    {filteredConfirmations.map((confirmation) => (
                        <ConfirmationRow
                            key={confirmation.id}
                            confirmation={confirmation}
                            onToggleExpansion={onToggleExpansion}
                            withholdingRates={withholdingRates}
                            onRevertItem={onRevertItem}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    type={searchTerm || dateRange.start || dateRange.end ? 'no-results' : 'no-data'}
                    title={searchTerm || dateRange.start || dateRange.end ? '沒有找到符合的清單' : '目前沒有已確認的請款記錄'}
                    description={searchTerm || dateRange.start || dateRange.end ? '請嘗試其他搜尋關鍵字或日期範圍' : '所有請款都還在處理中'}
                />
            )}
        </div>
    )
}
