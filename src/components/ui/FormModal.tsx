'use client'

import { type ReactNode, useEffect } from 'react'
import { Modal } from './modal'
import { Button } from './button'
import { Loader2 } from 'lucide-react'

interface FormModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  onSubmit: (e: React.FormEvent) => void
  isSubmitting?: boolean
  submitLabel?: string
  cancelLabel?: string
  maxWidth?: string
  children: ReactNode
}

/**
 * 通用表單彈窗，封裝 Modal + form 提交 + Loading 狀態 + 確認/取消按鈕
 */
export function FormModal({
  isOpen,
  onClose,
  title,
  onSubmit,
  isSubmitting = false,
  submitLabel = '儲存',
  cancelLabel = '取消',
  maxWidth,
  children,
}: FormModalProps) {
  // ESC 關閉由 Modal (Dialog) 內建處理

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth={maxWidth}>
      <form onSubmit={onSubmit}>
        <div className="space-y-4">
          {children}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
