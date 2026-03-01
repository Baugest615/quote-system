'use client'

import { useState, useRef } from 'react'
import supabase from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Trash2, Eye, Download, AlertCircle, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { PaymentAttachment } from '@/lib/payments/types'

interface AttachmentUploaderProps {
    /** quotation_items.id — 用於建立 storage 路徑 */
    itemId: string
    /** 當前已上傳的附件 */
    currentAttachments: PaymentAttachment[]
    /** 附件變更後回呼（含 DB 寫入結果） */
    onUpdate: (attachments: PaymentAttachment[]) => void
    /** 是否為唯讀模式 */
    readOnly?: boolean
}

const MAX_FILES = 5
const MAX_TOTAL_SIZE = 5 * 1024 * 1024 // 5MB

/** 將中文檔名轉為安全的 ASCII 路徑，保留原始檔名供顯示 */
function createSafeFileName(originalName: string): string {
    const timestamp = Date.now()
    const extension = originalName.split('.').pop()?.toLowerCase() || 'file'
    const safeName = originalName
        .replace(/\.[^/.]+$/, '')
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 20)
    return `${timestamp}_${safeName || 'file'}.${extension}`
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const FILE_TYPE_ICONS: Record<string, string> = {
    image: '🖼️', document: '📄', spreadsheet: '📊', file: '📎',
}

function getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return 'document'
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet'
    return 'file'
}

export function AttachmentUploader({
    itemId,
    currentAttachments,
    onUpdate,
    readOnly = false,
}: AttachmentUploaderProps) {
    const confirm = useConfirm()
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [attachments, setAttachments] = useState<PaymentAttachment[]>(currentAttachments || [])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const totalSize = attachments.reduce((s, a) => s + a.size, 0)

    // ── Upload ──
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        setError(null)
        if (!file) return

        if (file.size > MAX_TOTAL_SIZE) {
            setError('單一檔案大小不可超過 5MB')
            if (fileInputRef.current) fileInputRef.current.value = ''
            return
        }
        if (totalSize + file.size > MAX_TOTAL_SIZE) {
            setError(`總檔案大小將超過 5MB（${formatFileSize(totalSize + file.size)}）`)
            if (fileInputRef.current) fileInputRef.current.value = ''
            return
        }

        setUploading(true)
        try {
            let updated = [...attachments]

            // 超過上限時刪除最舊
            if (updated.length >= MAX_FILES) {
                updated.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
                const oldest = updated[0]
                await supabase.storage.from('attachments').remove([oldest.path])
                updated = updated.slice(1)
            }

            const safeName = createSafeFileName(file.name)
            const uploadPath = `quotation-items/${itemId}/${safeName}`

            const { error: uploadErr } = await supabase.storage
                .from('attachments')
                .upload(uploadPath, file, { cacheControl: '3600', upsert: true })
            if (uploadErr) throw uploadErr

            const { data: urlData } = supabase.storage
                .from('attachments')
                .getPublicUrl(uploadPath)

            const newAttachment: PaymentAttachment = {
                name: file.name,
                url: urlData.publicUrl,
                path: uploadPath,
                uploadedAt: new Date().toISOString(),
                size: file.size,
            }

            const final = [...updated, newAttachment]
            setAttachments(final)
            await persistAttachments(final)
            toast.success('檔案已上傳')
        } catch (err) {
            setError('上傳失敗: ' + (err instanceof Error ? err.message : String(err)))
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // ── Delete ──
    const handleDelete = async (attachment: PaymentAttachment) => {
        const ok = await confirm({
            title: '刪除附件',
            description: `確定要刪除「${attachment.name}」嗎？`,
            confirmLabel: '刪除',
            variant: 'destructive',
        })
        if (!ok) return

        try {
            await supabase.storage.from('attachments').remove([attachment.path])
            const final = attachments.filter(a => a.path !== attachment.path)
            setAttachments(final)
            await persistAttachments(final)
            toast.success('附件已刪除')
        } catch (err) {
            setError('刪除失敗: ' + (err instanceof Error ? err.message : String(err)))
        }
    }

    // ── Preview / Download ──
    const openSignedUrl = async (attachment: PaymentAttachment, download: boolean) => {
        try {
            const { data, error: urlErr } = await supabase.storage
                .from('attachments')
                .createSignedUrl(attachment.path, 60)
            if (urlErr) throw urlErr
            if (data?.signedUrl) {
                if (download) {
                    const link = document.createElement('a')
                    link.href = data.signedUrl
                    link.download = attachment.name
                    link.target = '_blank'
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                } else {
                    window.open(data.signedUrl, '_blank')
                }
            }
        } catch (err) {
            toast.error('無法取得連結: ' + (err instanceof Error ? err.message : String(err)))
        }
    }

    // ── Persist to DB ──
    const persistAttachments = async (list: PaymentAttachment[]) => {
        const { error: dbErr } = await supabase
            .from('quotation_items')
            .update({ attachments: list as unknown as Record<string, unknown>[] })
            .eq('id', itemId)
        if (dbErr) {
            console.warn('附件 DB 寫入失敗:', dbErr.message)
        }
        onUpdate(list)
    }

    return (
        <div className="space-y-3">
            {/* 進度條 */}
            <div className="bg-info/10 border border-info/30 rounded-md p-2">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-info">已上傳：{attachments.length}/{MAX_FILES}</span>
                    <span className="text-info">{formatFileSize(totalSize)}/5MB</span>
                </div>
                <div className="mt-1.5 bg-info/20 rounded-full h-1.5">
                    <div
                        className="bg-info h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min((totalSize / MAX_TOTAL_SIZE) * 100, 100)}%` }}
                    />
                </div>
            </div>

            {/* 已上傳列表 */}
            {attachments.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {attachments.map((att) => {
                        const type = getFileType(att.name)
                        return (
                            <div key={att.path} className="flex items-center justify-between bg-secondary p-2 rounded border text-xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span>{FILE_TYPE_ICONS[type]}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium" title={att.name}>{att.name}</p>
                                        <p className="text-muted-foreground">{formatFileSize(att.size)}</p>
                                    </div>
                                </div>
                                <div className="flex gap-0.5 ml-2 shrink-0">
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-info" onClick={() => openSignedUrl(att, false)} title="預覽">
                                        <Eye className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-success" onClick={() => openSignedUrl(att, true)} title="下載">
                                        <Download className="h-3 w-3" />
                                    </Button>
                                    {!readOnly && (
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelete(att)} title="刪除">
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="text-center py-4 text-muted-foreground text-xs">
                    <AlertCircle className="mx-auto h-5 w-5 mb-1" />
                    <p>尚未上傳附件</p>
                </div>
            )}

            {/* 上傳按鈕 */}
            {!readOnly && (
                <div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleUpload}
                        disabled={uploading || totalSize >= MAX_TOTAL_SIZE}
                        className="block w-full text-xs text-muted-foreground
                            file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0
                            file:text-xs file:font-medium file:bg-primary/10 file:text-primary
                            hover:file:bg-primary/20 disabled:opacity-50"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.zip,.rar"
                    />
                    {uploading && (
                        <p className="mt-1 text-xs text-primary flex items-center gap-1">
                            <span className="animate-spin inline-block h-3 w-3 border-b-2 border-primary rounded-full" />
                            上傳中...
                        </p>
                    )}
                    {error && (
                        <p className="mt-1 text-xs text-destructive">{error}</p>
                    )}
                </div>
            )}
        </div>
    )
}
