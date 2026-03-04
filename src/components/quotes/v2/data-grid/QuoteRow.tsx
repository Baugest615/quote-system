import React from 'react'
import { ChevronRight, ChevronDown, Trash2, ExternalLink, CheckCircle, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditableCell } from '../EditableCell'
import { QuotationItemsList } from '../QuotationItemsList'
import { cn } from '@/lib/utils'
import type { QuotationWithClient } from '@/app/dashboard/quotes/page'
import { getQuoteTotal, getKolNames, getServices } from './helpers'

interface QuoteRowProps {
    quote: QuotationWithClient
    isExpanded: boolean
    onToggleRow: (id: string) => void
    canEdit: boolean
    clientOptions: { label: string; value: string }[]
    statusOptions: { value: string; label: string; color: string }[]
    onUpdate: (id: string, field: keyof QuotationWithClient, value: any) => void
    onDelete: (id: string) => void
    onOpenFileModal: (quote: QuotationWithClient) => void
    onViewDetail: (id: string) => void
    onRefresh: () => void
    hasAttachment: (attachments: any) => boolean
}

export const QuoteRow = React.memo(function QuoteRow({
    quote, isExpanded, onToggleRow, canEdit, clientOptions, statusOptions,
    onUpdate, onDelete, onOpenFileModal, onViewDetail, onRefresh, hasAttachment,
}: QuoteRowProps) {
    const total = getQuoteTotal(quote)
    const hasFile = hasAttachment(quote.attachments)

    return (
        <div className="border-b last:border-b-0">
            {/* 主行 */}
            <div className={cn("flex items-center hover:bg-accent/50 transition-colors group", isExpanded && "bg-accent/30")}>
                {/* 展開按鈕 */}
                <div className="w-10 p-3 flex justify-center flex-shrink-0 cursor-pointer" onClick={() => onToggleRow(quote.id)}>
                    {isExpanded ?
                        <ChevronDown className="h-4 w-4 text-muted-foreground" /> :
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground" />
                    }
                </div>

                {/* 編號 */}
                <div className="w-28 p-3 flex-shrink-0 text-sm font-mono text-muted-foreground" title={quote.quote_number || quote.id}>
                    {quote.quote_number || quote.id.slice(0, 8)}
                </div>

                {/* 日期 */}
                <div className="w-28 p-3 flex-shrink-0 text-sm text-muted-foreground">
                    {new Date(quote.created_at || '').toLocaleDateString('zh-TW')}
                </div>

                {/* 專案名稱 */}
                <div className="w-[280px] flex-1 p-2">
                    {canEdit ? (
                        <EditableCell value={quote.project_name} onChange={(val) => onUpdate(quote.id, 'project_name', val)} className="font-medium text-foreground" />
                    ) : (
                        <div className="font-medium text-foreground px-2 min-h-[2rem] flex items-center text-sm truncate">{quote.project_name}</div>
                    )}
                </div>

                {/* 客戶 */}
                <div className="w-56 p-2 flex-shrink-0">
                    {canEdit ? (
                        <EditableCell value={quote.client_id} type="select" options={clientOptions} onChange={(val) => onUpdate(quote.id, 'client_id', val)} />
                    ) : (
                        <div className="text-sm text-foreground px-2 min-h-[2rem] flex items-center truncate">
                            {clientOptions.find(c => c.value === quote.client_id)?.label || '-'}
                        </div>
                    )}
                </div>

                {/* KOL/服務 摘要 */}
                <div className="w-40 p-3 flex-shrink-0 text-xs text-muted-foreground truncate" title={getKolNames(quote)}>
                    {getKolNames(quote) || '—'}
                </div>

                {/* 執行內容 摘要 */}
                <div className="w-40 p-3 flex-shrink-0 text-xs text-muted-foreground truncate" title={getServices(quote)}>
                    {getServices(quote) || '—'}
                </div>

                {/* 預算 */}
                <div className="w-36 p-3 flex-shrink-0 text-right font-mono font-medium text-foreground/70">
                    {total.toLocaleString()}
                </div>

                {/* 狀態 */}
                <div className="w-24 p-2 flex-shrink-0">
                    {canEdit ? (
                        <EditableCell value={quote.status} type="select" options={statusOptions} onChange={(val) => onUpdate(quote.id, 'status', val)} className="text-xs" />
                    ) : (
                        <div className="text-xs text-foreground px-2 min-h-[2rem] flex items-center">{quote.status}</div>
                    )}
                </div>

                {/* 操作 */}
                <div className="w-28 p-2 flex-shrink-0 flex justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className={cn("h-8 w-8 p-0", hasFile ? "text-success" : "text-muted-foreground")}
                        onClick={(e) => { e.stopPropagation(); onOpenFileModal(quote) }}
                        title={hasFile ? "已上傳 (點擊管理)" : "上傳檔案"}
                        aria-label={hasFile ? "已上傳 (點擊管理)" : "上傳檔案"}>
                        {hasFile ? <CheckCircle className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                        onClick={() => onViewDetail(quote.id)} title="檢視詳情" aria-label="檢視詳情">
                        <ExternalLink className="h-4 w-4 text-info" />
                    </Button>
                    {canEdit && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={() => onDelete(quote.id)} title="刪除" aria-label="刪除">
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    )}
                </div>
            </div>

            {/* 展開內容 */}
            {isExpanded && (
                <div className="bg-muted/20 border-t border-border/50 p-4 pl-14 shadow-inner overflow-x-auto">
                    <QuotationItemsList quotationId={quote.id} onUpdate={onRefresh} readOnly={!canEdit} quotationStatus={quote.status ?? undefined} />
                </div>
            )}
        </div>
    )
})
