import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, type PaymentStatus } from '@/types/custom.types'

export function AccountingPaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_STATUS_COLORS[status]}`}>
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  )
}
