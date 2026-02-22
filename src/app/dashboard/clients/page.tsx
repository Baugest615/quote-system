// src/app/dashboard/clients/page.tsx - React Query 快取版本
'use client'

import { useState, useMemo, useEffect } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClientModal, type ClientFormData } from '@/components/clients/ClientModal'
import { PlusCircle, Edit, Trash2, Search, Users, Mail, Phone, Star } from 'lucide-react'
import { toast } from 'sonner'
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useClients } from '@/hooks/useClients'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import Pagination from '@/components/ui/Pagination'

const PAGE_SIZE = 20

type Client = Database['public']['Tables']['clients']['Row']

// 聯絡人介面定義
interface Contact {
  name: string
  email?: string
  phone?: string
  position?: string
  is_primary?: boolean
}

// 擴展客戶類型，包含解析後的聯絡人陣列
type ClientWithContacts = Client & {
  parsedContacts: Contact[]
}

export default function ClientsPage() {
  const queryClient = useQueryClient()
  const { data: rawClients = [], isLoading: loading } = useClients()
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // 搜尋改變時重置到第一頁
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  // 解析 JSONB contacts 並排序（client-side 轉換，有快取時不會重複計算）
  const clients = useMemo(() => {
    return rawClients.map(client => {
      let parsedContacts: Contact[] = []

      try {
        if (client.contacts) {
          if (typeof client.contacts === 'string') {
            parsedContacts = JSON.parse(client.contacts)
          } else if (Array.isArray(client.contacts)) {
            parsedContacts = client.contacts as Contact[]
          }
        }
      } catch (err) {
        console.error(`解析客戶 ${client.name} 的聯絡人資料失敗:`, err)
        parsedContacts = []
      }

      // 如果沒有聯絡人但有舊的單一聯絡人資料，建立相容性聯絡人
      if (parsedContacts.length === 0 && client.contact_person) {
        parsedContacts = [{
          name: client.contact_person,
          email: client.email || undefined,
          phone: client.phone || undefined,
          position: undefined,
          is_primary: true,
        }]
      }

      // 排序：主要聯絡人在前
      parsedContacts.sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return (a.name || '').localeCompare(b.name || '')
      })

      return { ...client, parsedContacts }
    })
  }, [rawClients])

  // 搜尋過濾
  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients
    const searchLower = searchTerm.toLowerCase()
    return clients.filter((client) => {
      if (client.name.toLowerCase().includes(searchLower)) return true
      return client.parsedContacts.some(contact =>
        (contact.name && contact.name.toLowerCase().includes(searchLower)) ||
        (contact.email && contact.email.toLowerCase().includes(searchLower)) ||
        (contact.position && contact.position.toLowerCase().includes(searchLower))
      )
    })
  }, [clients, searchTerm])

  // 分頁
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE))
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const handleOpenModal = (client?: Client) => {
    setSelectedClient(client || null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClient(null)
  }

  // 儲存 mutation
  const saveMutation = useMutation({
    mutationFn: async ({ formData, id }: { formData: ClientFormData; id?: string }) => {
      const primaryContact = formData.contacts?.find(c => c.is_primary) || formData.contacts?.[0]
      const dataToSave = {
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address,
        tin: formData.tin || null,
        invoice_title: formData.invoice_title || null,
        bank_info: formData.bank_info || null,
        contacts: formData.contacts || [],
        contact_person: primaryContact?.name || null,
        email: primaryContact?.email || null,
      }

      if (id) {
        const { error } = await supabase.from('clients').update(dataToSave).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clients').insert(dataToSave)
        if (error) throw error
      }
      return id
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.clients] })
      toast.success(id ? '客戶資料更新成功！' : '客戶新增成功！')
    },
    onError: (error: Error) => {
      toast.error(`儲存失敗: ${error.message}`)
    },
  })

  const handleSaveClient = async (formData: ClientFormData, id?: string) => {
    await saveMutation.mutateAsync({ formData, id })
  }

  // 刪除 mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.clients] })
      toast.success('客戶已刪除')
    },
    onError: (error: Error) => {
      toast.error(`刪除失敗: ${error.message}`)
    },
  })

  const handleDeleteClient = async (id: string) => {
    if (window.confirm('確定要刪除這位客戶嗎？此操作無法復原，同時會刪除所有相關聯絡人資料。')) {
      await deleteMutation.mutateAsync(id)
    }
  }

  const getPrimaryContact = (contacts: Contact[]) => {
    return contacts.find(contact => contact.is_primary) || contacts[0]
  }

  const getContactCount = (contacts: Contact[]) => {
    return contacts.length
  }

  if (loading) return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6 space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatCards count={3} />
      <SkeletonTable rows={8} columns={5} />
    </div>
  )

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">客戶管理</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜尋公司名稱、聯絡人..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-secondary border-border"
            />
          </div>
          <Button onClick={() => handleOpenModal()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusCircle className="mr-2 h-4 w-4" /> 新增客戶
          </Button>
        </div>
      </div>

      {/* 統計資訊 */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-secondary p-4 rounded-lg">
          <div className="text-sm text-muted-foreground">總客戶數</div>
          <div className="text-xl font-semibold text-foreground">{clients.length}</div>
        </div>
        <div className="bg-secondary p-4 rounded-lg">
          <div className="text-sm text-muted-foreground">搜尋結果</div>
          <div className="text-xl font-semibold text-foreground">{filteredClients.length}</div>
        </div>
        <div className="bg-secondary p-4 rounded-lg">
          <div className="text-sm text-muted-foreground">總聯絡人數</div>
          <div className="text-xl font-semibold text-foreground">
            {clients.reduce((sum, client) => sum + client.parsedContacts.length, 0)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-4 font-medium text-sm text-muted-foreground">公司資訊</th>
              <th className="p-4 font-medium text-sm text-muted-foreground hidden md:table-cell">統一編號</th>
              <th className="p-4 font-medium text-sm text-muted-foreground hidden sm:table-cell">主要聯絡人</th>
              <th className="p-4 font-medium text-sm text-muted-foreground hidden lg:table-cell">聯絡方式</th>
              <th className="p-4 font-medium text-sm text-muted-foreground text-center hidden sm:table-cell">聯絡人數</th>
              <th className="p-4 font-medium text-sm text-muted-foreground text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedClients.map((client) => {
              const primaryContact = getPrimaryContact(client.parsedContacts)
              const contactCount = getContactCount(client.parsedContacts)

              return (
                <tr key={client.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="p-4">
                    <div>
                      <div className="text-sm font-semibold text-primary">{client.name}</div>
                      <div className="text-xs text-muted-foreground">{client.address}</div>
                    </div>
                  </td>

                  <td className="p-4 text-sm hidden md:table-cell">{client.tin || '-'}</td>

                  <td className="p-4 hidden sm:table-cell">
                    {primaryContact ? (
                      <div>
                        <div className="flex items-center space-x-1">
                          <span className="text-sm font-medium">{primaryContact.name}</span>
                          {primaryContact.is_primary && (
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          )}
                        </div>
                        {primaryContact.position && (
                          <div className="text-xs text-muted-foreground">{primaryContact.position}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">無聯絡人</span>
                    )}
                  </td>

                  <td className="p-4 hidden lg:table-cell">
                    {primaryContact ? (
                      <div className="space-y-1">
                        {primaryContact.email && (
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 mr-1" />
                            <a
                              href={`mailto:${primaryContact.email}`}
                              className="hover:text-primary truncate max-w-[150px]"
                              title={primaryContact.email}
                            >
                              {primaryContact.email}
                            </a>
                          </div>
                        )}
                        {primaryContact.phone && (
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 mr-1" />
                            <a
                              href={`tel:${primaryContact.phone}`}
                              className="hover:text-primary"
                            >
                              {primaryContact.phone}
                            </a>
                          </div>
                        )}
                        {!primaryContact.email && !primaryContact.phone && (
                          <span className="text-xs text-muted-foreground">無聯絡方式</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </td>

                  <td className="p-4 text-center hidden sm:table-cell">
                    <div className="flex items-center justify-center space-x-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-foreground/80">{contactCount}</span>
                      {contactCount > 1 && (
                        <span className="text-xs text-primary bg-primary/10 px-1 rounded">
                          多窗口
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 text-center">
                    <div className="flex justify-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenModal(client)}
                        className="text-primary hover:text-primary/80 border-border"
                        title="編輯客戶資料"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClient(client.id)}
                        className="text-destructive hover:text-destructive/80 border-border"
                        title="刪除客戶"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredClients.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />

        {filteredClients.length === 0 && !loading && (
          searchTerm ? (
            <EmptyState
              type="no-results"
              title="找不到符合條件的客戶"
              description="嘗試搜尋公司名稱、聯絡人姓名或電子郵件"
            />
          ) : (
            <EmptyState
              type="no-data"
              icon={Users}
              title="尚未新增任何客戶"
              description="點擊上方「新增客戶」開始建立客戶資料"
              action={{ label: '新增客戶', onClick: () => handleOpenModal() }}
            />
          )
        )}

        {/* 顯示所有聯絡人的詳細資訊（可選，展開式） */}
        {searchTerm && (
          <div className="mt-6 bg-secondary rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground/70 mb-3">
              搜尋結果中的所有聯絡人：
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredClients.flatMap(client =>
                client.parsedContacts
                  .filter(contact =>
                    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (contact.position && contact.position.toLowerCase().includes(searchTerm.toLowerCase()))
                  )
                  .map(contact => (
                    <div key={`${client.id}-${contact.name}`} className="bg-card p-3 rounded border border-border">
                      <div className="flex items-center space-x-1 mb-1">
                        <span className="font-medium text-sm">{contact.name}</span>
                        {contact.is_primary && (
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <div className="font-medium">{client.name}</div>
                        {contact.position && <div>{contact.position}</div>}
                        {contact.email && <div>{contact.email}</div>}
                        {contact.phone && <div>{contact.phone}</div>}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      <ClientModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveClient}
        client={selectedClient}
      />
    </div>
  )
}