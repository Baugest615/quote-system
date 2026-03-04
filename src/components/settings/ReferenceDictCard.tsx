'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, PlusCircle, Edit, Trash2, Save, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  useServiceTypes,
  useQuoteCategories,
  useKolTypes,
  useExpenseTypes,
  useAccountingSubjects,
  useCreateReferenceItem,
  useUpdateReferenceItem,
  useDeleteReferenceItem,
  type DictTableName,
} from '@/hooks/useReferenceData'

interface DictItem {
  id: string
  name: string
  default_subject?: string | null
}

const DICT_SECTIONS: { key: DictTableName; title: string }[] = [
  { key: 'service_types', title: 'KOL 服務類型' },
  { key: 'quote_categories', title: '報價單項目類別' },
  { key: 'kol_types', title: 'KOL 類型' },
  { key: 'expense_types', title: '支出種類' },
  { key: 'accounting_subjects', title: '會計科目' },
]

export default function ReferenceDictCard() {
  const confirm = useConfirm()
  const { data: serviceTypes = [] } = useServiceTypes()
  const { data: quoteCategories = [] } = useQuoteCategories()
  const { data: kolTypes = [] } = useKolTypes()
  const { data: expenseTypes = [] } = useExpenseTypes()
  const { data: accountingSubjects = [] } = useAccountingSubjects()

  const dataMap: Record<DictTableName, DictItem[]> = {
    service_types: serviceTypes,
    quote_categories: quoteCategories,
    kol_types: kolTypes,
    expense_types: expenseTypes,
    accounting_subjects: accountingSubjects,
  }

  // 會計科目名稱列表（供支出種類的 default_subject 下拉選用）
  const subjectNames = accountingSubjects.map(s => s.name)

  const [openSection, setOpenSection] = useState<DictTableName | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState('')
  const [editingDefaultSubject, setEditingDefaultSubject] = useState<string | null>(null)
  const [newItemNames, setNewItemNames] = useState<Record<string, string>>({})
  const [newItemDefaultSubjects, setNewItemDefaultSubjects] = useState<Record<string, string>>({})

  // CRUD mutations（hooks 須在最上層無條件呼叫）
  const createServiceType = useCreateReferenceItem('service_types')
  const createQuoteCategory = useCreateReferenceItem('quote_categories')
  const createKolType = useCreateReferenceItem('kol_types')
  const createExpenseType = useCreateReferenceItem('expense_types')
  const createAccountingSubject = useCreateReferenceItem('accounting_subjects')

  const updateServiceType = useUpdateReferenceItem('service_types')
  const updateQuoteCategory = useUpdateReferenceItem('quote_categories')
  const updateKolType = useUpdateReferenceItem('kol_types')
  const updateExpenseType = useUpdateReferenceItem('expense_types')
  const updateAccountingSubject = useUpdateReferenceItem('accounting_subjects')

  const deleteServiceType = useDeleteReferenceItem('service_types')
  const deleteQuoteCategory = useDeleteReferenceItem('quote_categories')
  const deleteKolType = useDeleteReferenceItem('kol_types')
  const deleteExpenseType = useDeleteReferenceItem('expense_types')
  const deleteAccountingSubject = useDeleteReferenceItem('accounting_subjects')

  const mutations: Record<DictTableName, {
    create: typeof createServiceType
    update: typeof updateServiceType
    delete: typeof deleteServiceType
  }> = {
    service_types: { create: createServiceType, update: updateServiceType, delete: deleteServiceType },
    quote_categories: { create: createQuoteCategory, update: updateQuoteCategory, delete: deleteQuoteCategory },
    kol_types: { create: createKolType, update: updateKolType, delete: deleteKolType },
    expense_types: { create: createExpenseType, update: updateExpenseType, delete: deleteExpenseType },
    accounting_subjects: { create: createAccountingSubject, update: updateAccountingSubject, delete: deleteAccountingSubject },
  }

  const toggleSection = (key: DictTableName) => {
    setOpenSection(prev => prev === key ? null : key)
    setEditingItemId(null)
    setEditingItemName('')
    setEditingDefaultSubject(null)
  }

  const handleEdit = (item: DictItem) => {
    setEditingItemId(item.id)
    setEditingItemName(item.name)
    setEditingDefaultSubject(item.default_subject ?? null)
  }

  const handleCancelEdit = () => {
    setEditingItemId(null)
    setEditingItemName('')
    setEditingDefaultSubject(null)
  }

  const handleUpdate = async (tableName: DictTableName, id: string) => {
    if (editingItemName.trim()) {
      const payload: { id: string; name: string; default_subject?: string | null } = {
        id, name: editingItemName.trim(),
      }
      if (tableName === 'expense_types') {
        payload.default_subject = editingDefaultSubject || null
      }
      await mutations[tableName].update.mutateAsync(payload)
      handleCancelEdit()
    }
  }

  const handleDelete = async (tableName: DictTableName, id: string) => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除這個項目嗎？',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (ok) {
      await mutations[tableName].delete.mutateAsync(id)
    }
  }

  const handleAdd = async (tableName: DictTableName) => {
    const name = newItemNames[tableName]?.trim()
    if (name) {
      const payload: { name: string; default_subject?: string | null } = { name }
      if (tableName === 'expense_types') {
        payload.default_subject = newItemDefaultSubjects[tableName] || null
      }
      await mutations[tableName].create.mutateAsync(payload)
      setNewItemNames(prev => ({ ...prev, [tableName]: '' }))
      setNewItemDefaultSubjects(prev => ({ ...prev, [tableName]: '' }))
    }
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">資料字典管理</h2>
      </div>

      <div className="space-y-1">
        {DICT_SECTIONS.map(({ key, title }) => {
          const items = dataMap[key]
          const isOpen = openSection === key
          const hasDefaultSubject = key === 'expense_types'

          return (
            <div key={key}>
              {/* 分類標題 */}
              <button
                onClick={() => toggleSection(key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
              >
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-180"
                )} />
                <span className="flex-1 text-left">{title}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
              </button>

              {/* 展開的項目列表 */}
              <div className={cn(
                "overflow-hidden transition-all duration-200",
                isOpen ? "max-h-[600px] mt-1" : "max-h-0"
              )}>
                <div className="ml-6 pl-4 border-l-2 border-border pb-2 overflow-y-auto max-h-[500px]">
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 group">
                        {editingItemId === item.id ? (
                          <>
                            <Input
                              value={editingItemName}
                              onChange={(e) => setEditingItemName(e.target.value)}
                              className="h-7 text-sm flex-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdate(key, item.id)
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                              autoFocus
                            />
                            {hasDefaultSubject && (
                              <select
                                value={editingDefaultSubject || ''}
                                onChange={(e) => setEditingDefaultSubject(e.target.value || null)}
                                className="h-7 text-xs bg-muted border border-border rounded px-1.5"
                              >
                                <option value="">無預設科目</option>
                                {subjectNames.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleUpdate(key, item.id)} aria-label="儲存">
                              <Save className="h-3.5 w-3.5 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleCancelEdit} aria-label="取消">
                              <span className="text-xs">取消</span>
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-foreground/80 flex-1">
                              {item.name}
                              {hasDefaultSubject && item.default_subject && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  → {item.default_subject}
                                </span>
                              )}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleEdit(item)}
                              aria-label="編輯"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                              onClick={() => handleDelete(key, item.id)}
                              aria-label="刪除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 新增項目 */}
                  <div className={cn(
                    "flex items-center gap-2 px-2 pt-2 mt-1 border-t border-border/50",
                    hasDefaultSubject && "flex-wrap"
                  )}>
                    <Input
                      placeholder="新增項目名稱..."
                      value={newItemNames[key] || ''}
                      onChange={(e) => setNewItemNames(prev => ({ ...prev, [key]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdd(key)}
                      className="h-7 text-sm flex-1"
                    />
                    {hasDefaultSubject && (
                      <select
                        value={newItemDefaultSubjects[key] || ''}
                        onChange={(e) => setNewItemDefaultSubjects(prev => ({ ...prev, [key]: e.target.value }))}
                        className="h-7 text-xs bg-muted border border-border rounded px-1.5"
                      >
                        <option value="">預設科目（選填）</option>
                        {subjectNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs flex-shrink-0"
                      onClick={() => handleAdd(key)}
                      disabled={!newItemNames[key]?.trim()}
                    >
                      <PlusCircle className="h-3.5 w-3.5 mr-1" />
                      新增
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
