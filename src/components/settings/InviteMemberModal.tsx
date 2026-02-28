'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { FormModal } from '@/components/ui/FormModal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserRole } from '@/types/custom.types'
import { Crown, Settings, User, UserPlus } from 'lucide-react'

interface InviteMemberModalProps {
  isOpen: boolean
  onClose: () => void
}

const ROLE_OPTIONS: { value: UserRole; label: string; icon: typeof Crown }[] = [
  { value: 'Admin', label: '管理員', icon: Crown },
  { value: 'Editor', label: '編輯者', icon: Settings },
  { value: 'Member', label: '成員', icon: User },
]

export default function InviteMemberModal({ isOpen, onClose }: InviteMemberModalProps) {
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('Member')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10))

  const resetForm = () => {
    setEmail('')
    setName('')
    setRole('Member')
    setPosition('')
    setDepartment('')
    setHireDate(new Date().toISOString().slice(0, 10))
  }

  const inviteMutation = useMutation({
    mutationFn: async (payload: {
      email: string
      role: UserRole
      name: string
      position?: string
      department?: string
      hire_date: string
    }) => {
      const res = await fetch('/api/auth/invite-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '邀請失敗')
      }
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userManagement })
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedEmployees })
      queryClient.invalidateQueries({ queryKey: queryKeys.employees })
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles })

      if (data.warning) {
        toast.warning(data.warning)
      } else {
        toast.success('邀請已送出，新成員將收到設定密碼信件')
      }
      resetForm()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedEmail = email.trim()
    const trimmedName = name.trim()

    if (!trimmedEmail || !trimmedName || !hireDate) {
      toast.error('請填寫 Email、姓名和到職日')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      toast.error('Email 格式不正確')
      return
    }

    inviteMutation.mutate({
      email: trimmedEmail,
      role,
      name: trimmedName,
      position: position.trim() || undefined,
      department: department.trim() || undefined,
      hire_date: hireDate,
    })
  }

  const handleClose = () => {
    if (!inviteMutation.isPending) {
      resetForm()
      onClose()
    }
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={handleClose}
      title="邀請新成員"
      onSubmit={handleSubmit}
      isSubmitting={inviteMutation.isPending}
      submitLabel="送出邀請"
      maxWidth="max-w-lg"
    >
      {/* Email */}
      <div>
        <Label htmlFor="invite-email" className="text-xs font-medium text-muted-foreground">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={inviteMutation.isPending}
          className="mt-1"
          autoFocus
        />
      </div>

      {/* 姓名 */}
      <div>
        <Label htmlFor="invite-name" className="text-xs font-medium text-muted-foreground">
          姓名 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="invite-name"
          type="text"
          placeholder="輸入員工姓名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={inviteMutation.isPending}
          className="mt-1"
        />
      </div>

      {/* 角色選擇 */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground">角色</Label>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {ROLE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              disabled={inviteMutation.isPending}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                role === value
                  ? value === 'Admin'
                    ? 'border-yellow-500 bg-yellow-500/10 text-yellow-500'
                    : value === 'Editor'
                    ? 'border-info bg-info/10 text-info'
                    : 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 職位 + 部門 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="invite-position" className="text-xs font-medium text-muted-foreground">
            職位
          </Label>
          <Input
            id="invite-position"
            type="text"
            placeholder="例：專案經理"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={inviteMutation.isPending}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="invite-department" className="text-xs font-medium text-muted-foreground">
            部門
          </Label>
          <Input
            id="invite-department"
            type="text"
            placeholder="例：行銷部"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={inviteMutation.isPending}
            className="mt-1"
          />
        </div>
      </div>

      {/* 到職日 */}
      <div>
        <Label htmlFor="invite-hire-date" className="text-xs font-medium text-muted-foreground">
          到職日 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="invite-hire-date"
          type="date"
          value={hireDate}
          onChange={(e) => setHireDate(e.target.value)}
          disabled={inviteMutation.isPending}
          className="mt-1"
        />
      </div>

      {/* 說明提示 */}
      <div className="rounded-lg bg-info/5 border border-info/20 p-3">
        <p className="text-xs text-info flex items-start gap-2">
          <UserPlus className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            送出後系統將自動建立帳號、員工檔案並綁定。
            新成員會收到一封邀請信，點擊連結設定密碼後即可登入。
          </span>
        </p>
      </div>
    </FormModal>
  )
}
