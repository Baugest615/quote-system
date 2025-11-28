'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown, Trash2, ExternalLink, CheckCircle, UploadCloud } from 'lucide-react'
import { EditableCell } from './EditableCell'
import { QuotationItemsList } from './QuotationItemsList'
import { FileModal } from '@/components/quotes/FileModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { QuotationWithClient } from '@/app/dashboard/quotes/page'

interface QuotesDataGridProps {
    data: QuotationWithClient[]
    clients: Database['public']['Tables']['clients']['Row'][]
    onRefresh: () => void
}

export function QuotesDataGrid({ data, clients, onRefresh }: QuotesDataGridProps) {
    const router = useRouter()
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    // 檔案上傳 Modal 狀態
    const [fileModalOpen, setFileModalOpen] = useState(false)
    const [selectedQuote, setSelectedQuote] = useState<QuotationWithClient | null>(null)

    // 狀態選項
    const statusOptions = [
        { value: '草稿', label: '草稿', color: 'bg-gray-100 text-gray-800' },
        { value: '待簽約', label: '待簽約', color: 'bg-yellow-100 text-yellow-800' },
        { value: '已簽約', label: '已簽約', color: 'bg-green-100 text-green-800' },
        { value: '已歸檔', label: '已歸檔', color: 'bg-blue-100 text-blue-800' }
    ]

    // 客戶選項
    const clientOptions = clients.map(c => ({
        label: c.name,
        value: c.id
    }))

    // 切換展開/收合
    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    // 輔助函數：檢查附件
    const hasAttachment = (attachments: any): boolean => {
        return attachments && Array.isArray(attachments) && attachments.length > 0
    }

    // 更新報價單
    const handleUpdateQuotation = async (id: string, field: keyof QuotationWithClient, value: any) => {
        // 狀態驗證邏輯
        if (field === 'status' && value === '已簽約') {
            const quote = data.find(q => q.id === id)
            if (quote && !hasAttachment(quote.attachments)) {
                toast.error('無法更改狀態：請先上傳雙方用印的委刊報價單')
                onRefresh()
                return
            }
        }

        const { error } = await supabase
            .from('quotations')
            .update({ [field]: value })
            .eq('id', id)

        if (error) {
            toast.error('更新失敗: ' + error.message)
        } else {
            toast.success('已更新')
            onRefresh()
        }
    }

    // 刪除報價單
    const handleDelete = async (id: string) => {
        if (!confirm('確定要刪除此報價單嗎？')) return

        const { error } = await supabase
            .from('quotations')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('刪除失敗')
        } else {
            toast.success('已刪除')
            onRefresh()
        }
    }

    // 渲染附件按鈕
    const renderAttachmentButton = (quote: QuotationWithClient) => {
        const hasFile = hasAttachment(quote.attachments)
        return (
            <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0", hasFile ? "text-green-600" : "text-gray-400")}
                onClick={(e) => {
                    e.stopPropagation()
                    setSelectedQuote(quote)
                    setFileModalOpen(true)
                }}
                title={hasFile ? "已上傳 (點擊管理)" : "上傳檔案"}
            >
                {hasFile ? <CheckCircle className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
            </Button>
        )
    }

    return (
        <div className="h-full flex flex-col overflow-auto bg-white border rounded-lg shadow">
            {/* 表頭 (移動到 scroll container 內以支援水平捲動同步，並保持 sticky) */}
            <div className="flex bg-gray-100 border-b font-medium text-sm text-gray-600 sticky top-0 z-10 min-w-max">
                <div className="w-10 p-3 flex-shrink-0"></div>
                <div className="w-32 p-3 flex-shrink-0">ID</div>
                <div className="w-32 p-3 flex-shrink-0">日期</div>
                <div className="w-[200px] flex-1 p-3">專案名稱</div>
                <div className="w-48 p-3 flex-shrink-0">客戶</div>
                <div className="w-32 p-3 flex-shrink-0 text-right">總金額</div>
                <div className="w-32 p-3 flex-shrink-0">狀態</div>
                <div className="w-32 p-3 flex-shrink-0 text-center">操作</div>
            </div>

            {/* 表格內容 */}
            <div className="min-w-max">
                {data.map((quote) => {
                    const isExpanded = expandedRows.has(quote.id)
                    const total = quote.has_discount && quote.discounted_price ?
                        quote.discounted_price + Math.round(quote.discounted_price * 0.05) :
                        (quote.grand_total_taxed || 0)

                    return (
                        <div key={quote.id} className="border-b last:border-b-0">
                            {/* 主行 */}
                            <div className={cn(
                                "flex items-center hover:bg-blue-50/50 transition-colors group",
                                isExpanded && "bg-blue-50/30"
                            )}>
                                {/* 展開按鈕 */}
                                <div className="w-10 p-3 flex justify-center flex-shrink-0 cursor-pointer" onClick={() => toggleRow(quote.id)}>
                                    {isExpanded ?
                                        <ChevronDown className="h-4 w-4 text-gray-500" /> :
                                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                    }
                                </div>

                                {/* ID (唯讀) */}
                                <div className="w-32 p-3 flex-shrink-0 text-xs font-mono text-gray-500 truncate" title={quote.id}>
                                    {quote.id.slice(0, 8)}...
                                </div>

                                {/* 日期 (唯讀) */}
                                <div className="w-32 p-3 flex-shrink-0 text-sm text-gray-600">
                                    {new Date(quote.created_at || '').toLocaleDateString('zh-TW')}
                                </div>

                                {/* 專案名稱 (可編輯) */}
                                <div className="w-[200px] flex-1 p-2">
                                    <EditableCell
                                        value={quote.project_name}
                                        onChange={(val) => handleUpdateQuotation(quote.id, 'project_name', val)}
                                        className="font-medium text-gray-900"
                                    />
                                </div>

                                {/* 客戶 (可編輯 - 下拉) */}
                                <div className="w-48 p-2 flex-shrink-0">
                                    <EditableCell
                                        value={quote.client_id}
                                        type="select"
                                        options={clientOptions}
                                        onChange={(val) => handleUpdateQuotation(quote.id, 'client_id', val)}
                                    />
                                </div>

                                {/* 總金額 (唯讀 - 自動計算) */}
                                <div className="w-32 p-3 flex-shrink-0 text-right font-mono font-medium text-gray-700">
                                    {total.toLocaleString()}
                                </div>

                                {/* 狀態 (可編輯 - 下拉) */}
                                <div className="w-32 p-2 flex-shrink-0">
                                    <EditableCell
                                        value={quote.status}
                                        type="select"
                                        options={statusOptions}
                                        onChange={(val) => handleUpdateQuotation(quote.id, 'status', val)}
                                        className="text-xs"
                                    />
                                </div>

                                {/* 操作 */}
                                <div className="w-32 p-2 flex-shrink-0 flex justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {renderAttachmentButton(quote)}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => router.push(`/dashboard/quotes/view/${quote.id}`)}
                                        title="檢視詳情"
                                    >
                                        <ExternalLink className="h-4 w-4 text-blue-500" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => handleDelete(quote.id)}
                                        title="刪除"
                                    >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>

                            {/* 展開內容 (成本明細) */}
                            {isExpanded && (
                                <div className="bg-gray-50/50 border-t border-gray-100 p-4 pl-14 shadow-inner overflow-x-auto">
                                    <QuotationItemsList
                                        quotationId={quote.id}
                                        onUpdate={onRefresh}
                                    />
                                </div>
                            )}
                        </div>
                    )
                })}

                {data.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                        沒有資料
                    </div>
                )}
            </div>

            {/* 檔案上傳 Modal */}
            <FileModal
                isOpen={fileModalOpen}
                onClose={() => {
                    setFileModalOpen(false)
                    setSelectedQuote(null)
                }}
                quote={selectedQuote}
                onUpdate={onRefresh}
            />
        </div>
    )
}
