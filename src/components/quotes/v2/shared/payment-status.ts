import type { PaymentAttachment } from '@/lib/payments/types'

// ─── 請款狀態 ─────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'requested' | 'approved' | 'rejected'

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: '待請款', className: 'bg-muted text-muted-foreground' },
  requested: { label: '待審核', className: 'bg-warning/20 text-warning' },
  approved: { label: '已請款', className: 'bg-success/20 text-success' },
  rejected: { label: '被駁回', className: 'bg-destructive/20 text-destructive' },
}

export const INVOICE_REGEX = /^[A-Za-z]{2}-\d{8}$/

// ─── 通用型別約束 ─────────────────────────────────────────────

interface PaymentStatusFields {
  approved_at: string | null
  requested_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
}

export function getPaymentStatus(item: PaymentStatusFields): PaymentStatus {
  if (item.approved_at) return 'approved'
  if (item.requested_at) return 'requested'
  if (item.rejected_at && item.rejection_reason) return 'rejected'
  return 'pending'
}

interface VerificationFields {
  attachments: unknown
  invoice_number: string | null
}

export function isVerificationPassed(item: VerificationFields): boolean {
  const attachments = (item.attachments || []) as unknown as PaymentAttachment[]
  const hasAttachments = attachments.length > 0
  const invoiceNumber = item.invoice_number || ''
  const hasValidInvoice = INVOICE_REGEX.test(invoiceNumber)
  return hasAttachments || hasValidInvoice
}
