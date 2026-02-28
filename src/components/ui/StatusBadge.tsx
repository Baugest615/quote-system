'use client'

import React from 'react'
import {
  Clock,
  CheckCircle,
  XCircle,
  Receipt,
  AlertCircle,
  FileCheck,
  FileText,
  Archive,
  Edit3,
  UserCheck,
  UserX,
  UserMinus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

// 通用狀態色彩對照 — 全部使用 CSS 變數
const STATUS_COLORS = {
  draft: 'bg-muted text-muted-foreground border-border',
  pending: 'bg-warning/15 text-warning border-warning/25',
  signed: 'bg-success/15 text-success border-success/25',
  archived: 'bg-info/15 text-info border-info/25',
  approved: 'bg-success/15 text-success border-success/25',
  rejected: 'bg-destructive/15 text-destructive border-destructive/25',
  confirmed: 'bg-info/15 text-info border-info/25',
  ready: 'bg-success/15 text-success border-success/25',
  incomplete: 'bg-warning/15 text-warning border-warning/25',
  active: 'bg-success/15 text-success border-success/25',
  inactive: 'bg-muted text-muted-foreground border-border',
  leave: 'bg-warning/15 text-warning border-warning/25',
} as const

// 報價單狀態（中文）
const QUOTATION_STATUS_MAP: Record<string, { key: keyof typeof STATUS_COLORS; label: string; icon: LucideIcon }> = {
  '草稿': { key: 'draft', label: '草稿', icon: Edit3 },
  '待簽約': { key: 'pending', label: '待簽約', icon: Clock },
  '已簽約': { key: 'signed', label: '已簽約', icon: CheckCircle },
  '已歸檔': { key: 'archived', label: '已歸檔', icon: Archive },
}

// 請款狀態
const PAYMENT_STATUS_MAP: Record<string, { key: keyof typeof STATUS_COLORS; label: string; icon: LucideIcon }> = {
  'pending': { key: 'pending', label: '待審核', icon: Clock },
  'approved': { key: 'approved', label: '已核准', icon: CheckCircle },
  'rejected': { key: 'rejected', label: '已駁回', icon: XCircle },
  'confirmed': { key: 'confirmed', label: '已確認', icon: Receipt },
  'ready': { key: 'ready', label: '已備妥', icon: FileCheck },
  'incomplete': { key: 'incomplete', label: '待補件', icon: AlertCircle },
}

// 員工狀態
const EMPLOYEE_STATUS_MAP: Record<string, { key: keyof typeof STATUS_COLORS; label: string; icon: LucideIcon }> = {
  '在職': { key: 'active', label: '在職', icon: UserCheck },
  '離職': { key: 'inactive', label: '離職', icon: UserX },
  '留停': { key: 'leave', label: '留停', icon: UserMinus },
}

type StatusVariant = 'quotation' | 'payment' | 'employee' | 'custom'

const VARIANT_MAP: Record<Exclude<StatusVariant, 'custom'>, Record<string, { key: keyof typeof STATUS_COLORS; label: string; icon: LucideIcon }>> = {
  quotation: QUOTATION_STATUS_MAP,
  payment: PAYMENT_STATUS_MAP,
  employee: EMPLOYEE_STATUS_MAP,
}

export interface StatusBadgeProps {
  status: string
  variant?: StatusVariant
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  customColor?: keyof typeof STATUS_COLORS
  customIcon?: LucideIcon
  customLabel?: string
  className?: string
}

const SIZE_CONFIG = {
  sm: { container: 'px-2 py-0.5 text-xs', icon: 'h-3 w-3' },
  md: { container: 'px-2.5 py-1 text-sm', icon: 'h-3.5 w-3.5' },
  lg: { container: 'px-3 py-1.5 text-base', icon: 'h-4 w-4' },
} as const

export function StatusBadge({
  status,
  variant = 'quotation',
  size = 'md',
  showIcon = true,
  customColor,
  customIcon,
  customLabel,
  className,
}: StatusBadgeProps) {
  let colorClass: string
  let label: string
  let Icon: LucideIcon

  if (variant === 'custom') {
    colorClass = STATUS_COLORS[customColor || 'draft']
    label = customLabel || status
    Icon = customIcon || FileText
  } else {
    const map = VARIANT_MAP[variant]
    const config = map[status]
    if (config) {
      colorClass = STATUS_COLORS[config.key]
      label = config.label
      Icon = config.icon
    } else {
      colorClass = STATUS_COLORS.draft
      label = status
      Icon = FileText
    }
  }

  const sizeConfig = SIZE_CONFIG[size]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
        colorClass,
        sizeConfig.container,
        className,
      )}
    >
      {showIcon && <Icon className={cn(sizeConfig.icon, 'mr-1 flex-shrink-0')} />}
      {label}
    </span>
  )
}

export { STATUS_COLORS }
