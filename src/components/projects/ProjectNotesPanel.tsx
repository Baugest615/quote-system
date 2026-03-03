'use client'

import { useState } from 'react'
import { useProjectNotes, useCreateProjectNote, useDeleteProjectNote } from '@/hooks/useProjectNotes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Trash2, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface ProjectNotesPanelProps {
  projectId: string
  isAdmin: boolean
  currentUserId?: string
}

function formatNoteDate(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

function getAuthorDisplayName(email: string): string {
  if (!email || email === '未知使用者') return '未知使用者'
  // 取 @ 前的部分作為顯示名稱
  return email.split('@')[0]
}

export function ProjectNotesPanel({ projectId, isAdmin, currentUserId }: ProjectNotesPanelProps) {
  const confirm = useConfirm()
  const { data: notes = [], isLoading } = useProjectNotes(projectId)
  const createNote = useCreateProjectNote()
  const deleteNote = useDeleteProjectNote()
  const [newContent, setNewContent] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newContent.trim()
    if (!trimmed) return
    await createNote.mutateAsync({ projectId, content: trimmed })
    setNewContent('')
  }

  const handleDelete = async (noteId: string) => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除這則備註嗎？',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteNote.mutateAsync({ noteId, projectId })
  }

  return (
    <div className="px-6 py-4 bg-secondary/30 border-t border-border">
      {/* 標題 */}
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          備註 ({notes.length})
        </span>
      </div>

      {/* 備註列表 */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          載入中...
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 py-1">尚無備註</p>
      ) : (
        <div className="space-y-2 mb-3 max-h-[200px] overflow-y-auto">
          {notes.map((note) => {
            const canDelete = isAdmin || note.created_by === currentUserId
            return (
              <div
                key={note.id}
                className={cn(
                  'group/note flex items-start gap-3 rounded-lg px-3 py-2',
                  'bg-card/50 border border-border/50'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground/80">
                      {getAuthorDisplayName(note.author_email)}
                    </span>
                    <span className="text-xs text-muted-foreground/50">
                      {formatNoteDate(note.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                    {note.content}
                  </p>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover/note:opacity-100 transition-opacity text-destructive hover:text-destructive flex-shrink-0 mt-0.5"
                    onClick={() => handleDelete(note.id)}
                    disabled={deleteNote.isPending}
                    aria-label="刪除備註"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 新增備註輸入 */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="輸入備註..."
          className="h-8 text-sm bg-card/50"
          disabled={createNote.isPending}
        />
        <Button
          type="submit"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          disabled={!newContent.trim() || createNote.isPending}
          aria-label="送出備註"
        >
          {createNote.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </form>
    </div>
  )
}
