'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, PlusCircle, Edit, Trash2, Save, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useServiceTypes,
  useQuoteCategories,
  useKolTypes,
  useCreateReferenceItem,
  useUpdateReferenceItem,
  useDeleteReferenceItem,
} from '@/hooks/useReferenceData'

interface DictItem {
  id: string
  name: string
}

type TableName = 'service_types' | 'quote_categories' | 'kol_types'

const DICT_SECTIONS: { key: TableName; title: string }[] = [
  { key: 'service_types', title: 'KOL 服務類型' },
  { key: 'quote_categories', title: '報價單項目類別' },
  { key: 'kol_types', title: 'KOL 類型' },
]

export default function ReferenceDictCard() {
  const { data: serviceTypes = [] } = useServiceTypes()
  const { data: quoteCategories = [] } = useQuoteCategories()
  const { data: kolTypes = [] } = useKolTypes()

  const dataMap: Record<TableName, DictItem[]> = {
    service_types: serviceTypes,
    quote_categories: quoteCategories,
    kol_types: kolTypes,
  }

  const [openSection, setOpenSection] = useState<TableName | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState('')
  const [newItemNames, setNewItemNames] = useState<Record<string, string>>({})

  // CRUD mutations（hooks 須在最上層無條件呼叫）
  const createServiceType = useCreateReferenceItem('service_types')
  const createQuoteCategory = useCreateReferenceItem('quote_categories')
  const createKolType = useCreateReferenceItem('kol_types')

  const updateServiceType = useUpdateReferenceItem('service_types')
  const updateQuoteCategory = useUpdateReferenceItem('quote_categories')
  const updateKolType = useUpdateReferenceItem('kol_types')

  const deleteServiceType = useDeleteReferenceItem('service_types')
  const deleteQuoteCategory = useDeleteReferenceItem('quote_categories')
  const deleteKolType = useDeleteReferenceItem('kol_types')

  const mutations: Record<TableName, {
    create: typeof createServiceType
    update: typeof updateServiceType
    delete: typeof deleteServiceType
  }> = {
    service_types: { create: createServiceType, update: updateServiceType, delete: deleteServiceType },
    quote_categories: { create: createQuoteCategory, update: updateQuoteCategory, delete: deleteQuoteCategory },
    kol_types: { create: createKolType, update: updateKolType, delete: deleteKolType },
  }

  const toggleSection = (key: TableName) => {
    setOpenSection(prev => prev === key ? null : key)
    setEditingItemId(null)
    setEditingItemName('')
  }

  const handleEdit = (item: DictItem) => {
    setEditingItemId(item.id)
    setEditingItemName(item.name)
  }

  const handleCancelEdit = () => {
    setEditingItemId(null)
    setEditingItemName('')
  }

  const handleUpdate = async (tableName: TableName, id: string) => {
    if (editingItemName.trim()) {
      await mutations[tableName].update.mutateAsync({ id, name: editingItemName.trim() })
      handleCancelEdit()
    }
  }

  const handleDelete = async (tableName: TableName, id: string) => {
    if (window.confirm('確定要刪除這個項目嗎？')) {
      await mutations[tableName].delete.mutateAsync(id)
    }
  }

  const handleAdd = async (tableName: TableName) => {
    const name = newItemNames[tableName]?.trim()
    if (name) {
      await mutations[tableName].create.mutateAsync({ name })
      setNewItemNames(prev => ({ ...prev, [tableName]: '' }))
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
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleUpdate(key, item.id)}>
                              <Save className="h-3.5 w-3.5 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleCancelEdit}>
                              <span className="text-xs">取消</span>
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-foreground/80 flex-1">{item.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                              onClick={() => handleDelete(key, item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 新增項目 */}
                  <div className="flex items-center gap-2 px-2 pt-2 mt-1 border-t border-border/50">
                    <Input
                      placeholder="新增項目名稱..."
                      value={newItemNames[key] || ''}
                      onChange={(e) => setNewItemNames(prev => ({ ...prev, [key]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdd(key)}
                      className="h-7 text-sm flex-1"
                    />
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
