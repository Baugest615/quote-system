'use client'

import { ImageIcon, FileText, Paperclip, FileSpreadsheet } from 'lucide-react'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PaymentAttachment } from '@/lib/payments/types'

interface AttachmentChipsProps {
  attachments: PaymentAttachment[]
  /** 最多顯示幾個（超出顯示 +N），預設 2 */
  maxVisible?: number
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
    return <ImageIcon className="w-3 h-3 flex-shrink-0" />
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext))
    return <FileText className="w-3 h-3 flex-shrink-0" />
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return <FileSpreadsheet className="w-3 h-3 flex-shrink-0" />
  return <Paperclip className="w-3 h-3 flex-shrink-0" />
}

function truncateName(name: string, max = 16): string {
  if (name.length <= max) return name
  const ext = name.split('.').pop() || ''
  const base = name.slice(0, name.length - ext.length - 1)
  const keep = max - ext.length - 4 // 4 = "..." + "."
  if (keep <= 0) return name.slice(0, max - 3) + '...'
  return base.slice(0, keep) + '...' + ext
}

async function openPreview(attachment: PaymentAttachment) {
  try {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(attachment.path, 60)
    if (error) throw error
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
  } catch (err) {
    toast.error('無法取得連結: ' + (err instanceof Error ? err.message : String(err)))
  }
}

export function AttachmentChips({ attachments, maxVisible = 2 }: AttachmentChipsProps) {
  if (!attachments || attachments.length === 0) return null

  const visible = attachments.slice(0, maxVisible)
  const remaining = attachments.length - maxVisible

  return (
    <span className="inline-flex items-center gap-1.5">
      {visible.map((att) => (
        <button
          key={att.path}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openPreview(att)
          }}
          title={att.name}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted hover:bg-muted-foreground/20 transition-colors text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {getFileIcon(att.name)}
          <span className="truncate max-w-[10rem]">{truncateName(att.name)}</span>
        </button>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-muted-foreground">+{remaining}</span>
      )}
    </span>
  )
}
