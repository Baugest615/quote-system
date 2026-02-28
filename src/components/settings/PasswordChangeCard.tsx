'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, Eye, EyeOff } from 'lucide-react'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function PasswordChangeCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error('新密碼與確認密碼不一致')
      return
    }
    if (newPassword.length < 6) {
      toast.error('密碼長度至少 6 個字元')
      return
    }

    setLoading(true)
    try {
      // 取得目前使用者 email
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        toast.error('無法取得使用者資訊')
        return
      }

      // 驗證目前密碼
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (signInError) {
        toast.error('目前密碼不正確')
        return
      }

      // 更新密碼
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (updateError) {
        toast.error('密碼更新失敗：' + updateError.message)
        return
      }

      toast.success('密碼已成功更新')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('密碼更新時發生錯誤')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">帳號安全</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">目前密碼</label>
          <div className="relative">
            <Input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="請輸入目前密碼"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">新密碼</label>
          <div className="relative">
            <Input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 6 個字元"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">確認新密碼</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次輸入新密碼"
            required
            minLength={6}
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-destructive mt-1">密碼不一致</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
        >
          {loading ? '更新中...' : '更新密碼'}
        </Button>
      </form>
    </div>
  )
}
