'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import supabase from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { parseKolBankInfo, type KolBankInfo } from '@/types/schemas'
import type { Json } from '@/types/database.types'

interface BankInfoEditModalProps {
    isOpen: boolean
    onClose: () => void
    kolId: string
    kolName: string
    currentBankInfo: Json
    onSaved: (kolId: string, updatedBankInfo: KolBankInfo) => void
}

interface BankInfoFormData {
    bankType: 'individual' | 'company'
    companyAccountName: string
    personalAccountName: string
    bankName: string
    branchName: string
    accountNumber: string
}

export function BankInfoEditModal({
    isOpen,
    onClose,
    kolId,
    kolName,
    currentBankInfo,
    onSaved
}: BankInfoEditModalProps) {
    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { isSubmitting }
    } = useForm<BankInfoFormData>()

    const watchBankType = watch('bankType')

    useEffect(() => {
        if (isOpen) {
            const parsed = parseKolBankInfo(currentBankInfo)
            reset({
                bankType: parsed.bankType || 'individual',
                companyAccountName: parsed.companyAccountName || '',
                personalAccountName: parsed.personalAccountName || '',
                bankName: parsed.bankName || '',
                branchName: parsed.branchName || '',
                accountNumber: parsed.accountNumber || '',
            })
        }
    }, [isOpen, currentBankInfo, reset])

    const onSubmit = async (data: BankInfoFormData) => {
        try {
            const bankInfo: KolBankInfo = {
                bankType: data.bankType,
                bankName: data.bankName,
                branchName: data.branchName,
                accountNumber: data.accountNumber,
                companyAccountName: data.bankType === 'company' ? data.companyAccountName : '',
                personalAccountName: data.bankType === 'individual' ? data.personalAccountName : '',
            }

            const { error } = await supabase
                .from('kols')
                .update({ bank_info: bankInfo as unknown as Json })
                .eq('id', kolId)

            if (error) throw error

            toast.success('銀行帳號資訊已更新')
            onSaved(kolId, bankInfo)
            onClose()
        } catch (error: unknown) {
            toast.error('儲存失敗: ' + (error instanceof Error ? error.message : String(error)))
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`編輯銀行帳號 — ${kolName}`}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                    <Label className="text-sm font-medium text-foreground/70">帳戶類型</Label>
                    <div className="mt-2 flex space-x-4">
                        <label className="inline-flex items-center">
                            <input
                                type="radio"
                                {...register('bankType')}
                                value="individual"
                                className="form-radio"
                            />
                            <span className="ml-2 text-sm">勞報</span>
                        </label>
                        <label className="inline-flex items-center">
                            <input
                                type="radio"
                                {...register('bankType')}
                                value="company"
                                className="form-radio"
                            />
                            <span className="ml-2 text-sm">公司行號</span>
                        </label>
                    </div>
                </div>

                {watchBankType === 'company' && (
                    <div>
                        <Label>公司匯款戶名</Label>
                        <Input {...register('companyAccountName')} className="mt-1" placeholder="公司全名" />
                    </div>
                )}
                {watchBankType === 'individual' && (
                    <div>
                        <Label>個人匯款戶名</Label>
                        <Input {...register('personalAccountName')} className="mt-1" placeholder="帳戶姓名" />
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>銀行名稱</Label>
                        <Input {...register('bankName')} className="mt-1" placeholder="例如: 國泰世華銀行" />
                    </div>
                    <div>
                        <Label>分行名稱</Label>
                        <Input {...register('branchName')} className="mt-1" placeholder="例如: 文山分行" />
                    </div>
                </div>
                <div>
                    <Label>帳戶帳號</Label>
                    <Input {...register('accountNumber')} className="mt-1" />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-border">
                    <Button type="button" variant="outline" onClick={onClose}>取消</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? '儲存中...' : '儲存'}
                    </Button>
                </div>
            </form>
        </Modal>
    )
}
