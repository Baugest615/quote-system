// src/types/schemas.ts
// Zod schemas for JSONB fields runtime validation

import { z } from 'zod'

// ===== KOL 銀行資訊 =====
export const kolBankInfoSchema = z.object({
  bankType: z.enum(['individual', 'company']).optional(),
  companyAccountName: z.string().optional(),
  personalAccountName: z.string().optional(),
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  accountNumber: z.string().optional(),
})

export type KolBankInfo = z.infer<typeof kolBankInfoSchema>

// ===== 客戶銀行資訊 =====
export const clientBankInfoSchema = z.object({
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  accountNumber: z.string().optional(),
})

export type ClientBankInfo = z.infer<typeof clientBankInfoSchema>

// 通用銀行資訊（相容 KOL 和客戶）
export type BankInfo = KolBankInfo | ClientBankInfo

// 安全解析 KOL bank_info
export function parseKolBankInfo(raw: unknown): KolBankInfo {
  const result = kolBankInfoSchema.safeParse(raw)
  return result.success ? result.data : {}
}

// ===== 社群連結 (KOL) =====
export const socialLinksSchema = z.object({
  instagram: z.string().default(''),
  youtube: z.string().default(''),
  facebook: z.string().default(''),
  tiktok: z.string().default(''),
  threads: z.string().default(''),
  other: z.string().default(''),
})

export type SocialLinks = z.infer<typeof socialLinksSchema>

export function parseSocialLinks(raw: unknown): SocialLinks {
  const result = socialLinksSchema.safeParse(raw)
  return result.success ? result.data : {
    instagram: '',
    youtube: '',
    facebook: '',
    tiktok: '',
    threads: '',
    other: '',
  }
}

// ===== 聯絡人 =====
export const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().default(''),
  phone: z.string().default(''),
  company: z.string().default(''),
  role: z.string().default(''),
})

export type ContactInfo = z.infer<typeof contactSchema>

export function parseContacts(raw: unknown): ContactInfo[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(item => contactSchema.safeParse(item))
    .filter(result => result.success)
    .map(result => result.data)
}

// ===== 檔案附件 =====
export const fileAttachmentSchema = z.object({
  name: z.string(),
  url: z.string(),
  path: z.string(),
  uploadedAt: z.string(),
  size: z.number(),
  type: z.string().optional(),
})

export type FileAttachmentData = z.infer<typeof fileAttachmentSchema>

export function parseAttachments(raw: unknown): FileAttachmentData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(item => fileAttachmentSchema.safeParse(item))
    .filter(result => result.success)
    .map(result => result.data)
}

// ===== 騎縫章設定 =====
export const sealStampConfigSchema = z.object({
  enabled: z.boolean().default(false),
  image: z.string().default(''),
  position: z.enum(['center', 'right', 'left']).default('center'),
  size: z.number().default(80),
  opacity: z.number().min(0).max(1).default(0.8),
})

export type SealStampConfig = z.infer<typeof sealStampConfigSchema>

// ===== 通用錯誤訊息取得 =====
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '發生未知錯誤'
}
