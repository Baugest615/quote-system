'use client'

import { useMemo, useCallback } from 'react'
import { useExpenseTypes, useAccountingSubjects } from './useReferenceData'
import {
  EXPENSE_TYPES, ACCOUNTING_SUBJECTS, EXPENSE_TYPE_DEFAULT_SUBJECTS,
} from '@/types/custom.types'

/**
 * 從 DB 字典表衍生支出種類/會計科目資料，提供與原硬編碼常量相同介面。
 * DB 資料尚未載入時 fallback 至 custom.types.ts 的常量。
 */
export function useExpenseDefaults() {
  const { data: expenseTypesData, isLoading: loadingTypes } = useExpenseTypes()
  const { data: accountingSubjectsData, isLoading: loadingSubjects } = useAccountingSubjects()

  // 支出種類名稱陣列（取代 EXPENSE_TYPES 常量）
  const expenseTypeNames = useMemo<string[]>(() => {
    if (expenseTypesData && expenseTypesData.length > 0) {
      return expenseTypesData.map(t => t.name)
    }
    return [...EXPENSE_TYPES]
  }, [expenseTypesData])

  // 會計科目名稱陣列（取代 ACCOUNTING_SUBJECTS 常量）
  const accountingSubjectNames = useMemo<string[]>(() => {
    if (accountingSubjectsData && accountingSubjectsData.length > 0) {
      return accountingSubjectsData.map(s => s.name)
    }
    return [...ACCOUNTING_SUBJECTS]
  }, [accountingSubjectsData])

  // 支出→科目映射（取代 EXPENSE_TYPE_DEFAULT_SUBJECTS）
  const defaultSubjectsMap = useMemo<Record<string, string>>(() => {
    if (expenseTypesData && expenseTypesData.length > 0) {
      const map: Record<string, string> = {}
      expenseTypesData.forEach(t => {
        if (t.default_subject) map[t.name] = t.default_subject
      })
      return map
    }
    return { ...EXPENSE_TYPE_DEFAULT_SUBJECTS }
  }, [expenseTypesData])

  // bankType 推算預設值（取代 getDefaultExpenseByBankType）
  const getSmartDefaults = useCallback(
    (kols: { bank_info: unknown } | null | undefined): { expenseType: string; accountingSubject: string } => {
      if (!kols) {
        return {
          expenseType: '專案費用',
          accountingSubject: defaultSubjectsMap['專案費用'] || '廣告費用',
        }
      }
      const info = kols.bank_info as Record<string, unknown> | null | undefined
      if (info?.bankType === 'company') {
        return {
          expenseType: '外包服務',
          accountingSubject: defaultSubjectsMap['外包服務'] || '外包費用',
        }
      }
      return {
        expenseType: '勞務報酬',
        accountingSubject: defaultSubjectsMap['勞務報酬'] || '勞務成本',
      }
    },
    [defaultSubjectsMap]
  )

  return {
    expenseTypeNames,
    accountingSubjectNames,
    defaultSubjectsMap,
    getSmartDefaults,
    isLoading: loadingTypes || loadingSubjects,
  }
}
