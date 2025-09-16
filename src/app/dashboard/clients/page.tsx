// src/app/dashboard/clients/page.tsx - 針對JSONB contacts的優化版本
'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClientModal } from '@/components/clients/ClientModal'
import { PlusCircle, Edit, Trash2, Search, Users, Mail, Phone, Star } from 'lucide-react'
import { toast } from 'sonner'

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
  const [clients, setClients] = useState<ClientWithContacts[]>([])
  const [filteredClients, setFilteredClients] = useState<ClientWithContacts[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // 解析JSONB contacts並排序
      const clientsWithContacts = (data || []).map(client => {
        let parsedContacts: Contact[] = []
        
        try {
          if (client.contacts) {
            if (typeof client.contacts === 'string') {
              parsedContacts = JSON.parse(client.contacts)
            } else if (Array.isArray(client.contacts)) {
              parsedContacts = client.contacts as Contact[]
            }
          }
        } catch (error) {
          console.error(`解析客戶 ${client.name} 的聯絡人資料失敗:`, error)
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

        return {
          ...client,
          parsedContacts
        }
      })

      setClients(clientsWithContacts)
      setFilteredClients(clientsWithContacts)
    } catch (error) {
      console.error('載入客戶資料失敗:', error)
      toast.error('載入客戶資料失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // 搜尋功能 - 包含聯絡人搜尋
  useEffect(() => {
    const filtered = clients.filter((client) => {
      const searchLower = searchTerm.toLowerCase()
      
      // 搜尋公司名稱
      if (client.name.toLowerCase().includes(searchLower)) return true
      
      // 搜尋所有聯絡人的姓名和電子郵件
      return client.parsedContacts.some(contact => 
        (contact.name && contact.name.toLowerCase().includes(searchLower)) ||
        (contact.email && contact.email.toLowerCase().includes(searchLower)) ||
        (contact.position && contact.position.toLowerCase().includes(searchLower))
      )
    })
    setFilteredClients(filtered)
  }, [clients, searchTerm])

  const handleOpenModal = (client?: Client) => {
    setSelectedClient(client || null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClient(null)
  }

  const handleSaveClient = async (formData: any, id?: string) => {
    try {
      const dataToSave = {
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address,
        tin: formData.tin || null,
        invoice_title: formData.invoice_title || null,
        bank_info: formData.bank_info || null,
        contacts: formData.contacts || [], // 儲存JSONB陣列
        // 為了向後相容性，同時更新單一聯絡人欄位
        contact_person: formData.contact_person || null,
        email: formData.email || null,
      }

      if (id) {
        const { error } = await supabase
          .from('clients')
          .update(dataToSave)
          .eq('id', id)
        
        if (error) throw error
        toast.success('客戶資料更新成功！')
      } else {
        const { error } = await supabase
          .from('clients')
          .insert(dataToSave)
        
        if (error) throw error
        toast.success('客戶新增成功！')
      }

      await fetchClients()
    } catch (error: any) {
      console.error('儲存客戶失敗:', error)
      toast.error(`儲存失敗: ${error.message}`)
    }
  }

  const handleDeleteClient = async (id: string) => {
    if (window.confirm('確定要刪除這位客戶嗎？此操作無法復原，同時會刪除所有相關聯絡人資料。')) {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', id)
        if (error) throw error
        
        toast.success('客戶已刪除')
        await fetchClients()
      } catch (error: any) {
        console.error('刪除客戶失敗:', error)
        toast.error(`刪除失敗: ${error.message}`)
      }
    }
  }

  const getPrimaryContact = (contacts: Contact[]) => {
    return contacts.find(contact => contact.is_primary) || contacts[0]
  }

  const getContactCount = (contacts: Contact[]) => {
    return contacts.length
  }

  if (loading) return <div>讀取中...</div>

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">客戶管理</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="搜尋公司名稱、聯絡人或電子郵件..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button onClick={() => handleOpenModal()}>
            <PlusCircle className="mr-2 h-4 w-4" /> 新增客戶
          </Button>
        </div>
      </div>

      {/* 統計資訊 */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-500">總客戶數</div>
          <div className="text-xl font-semibold">{clients.length}</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-500">搜尋結果</div>
          <div className="text-xl font-semibold">{filteredClients.length}</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-500">總聯絡人數</div>
          <div className="text-xl font-semibold">
            {clients.reduce((sum, client) => sum + client.parsedContacts.length, 0)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium text-sm">公司資訊</th>
              <th className="p-4 font-medium text-sm">統一編號</th>
              <th className="p-4 font-medium text-sm">主要聯絡人</th>
              <th className="p-4 font-medium text-sm">聯絡方式</th>
              <th className="p-4 font-medium text-sm text-center">聯絡人數</th>
              <th className="p-4 font-medium text-sm text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => {
              const primaryContact = getPrimaryContact(client.parsedContacts)
              const contactCount = getContactCount(client.parsedContacts)
              
              return (
                <tr key={client.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <div>
                      <div className="text-sm font-semibold text-indigo-700">{client.name}</div>
                      <div className="text-xs text-gray-500">{client.address}</div>
                    </div>
                  </td>
                  
                  <td className="p-4 text-sm">{client.tin || '-'}</td>
                  
                  <td className="p-4">
                    {primaryContact ? (
                      <div>
                        <div className="flex items-center space-x-1">
                          <span className="text-sm font-medium">{primaryContact.name}</span>
                          {primaryContact.is_primary && (
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          )}
                        </div>
                        {primaryContact.position && (
                          <div className="text-xs text-gray-500">{primaryContact.position}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">無聯絡人</span>
                    )}
                  </td>
                  
                  <td className="p-4">
                    {primaryContact ? (
                      <div className="space-y-1">
                        {primaryContact.email && (
                          <div className="flex items-center text-xs text-gray-600">
                            <Mail className="h-3 w-3 mr-1" />
                            <a 
                              href={`mailto:${primaryContact.email}`}
                              className="hover:text-indigo-600 truncate max-w-[150px]"
                              title={primaryContact.email}
                            >
                              {primaryContact.email}
                            </a>
                          </div>
                        )}
                        {primaryContact.phone && (
                          <div className="flex items-center text-xs text-gray-600">
                            <Phone className="h-3 w-3 mr-1" />
                            <a 
                              href={`tel:${primaryContact.phone}`}
                              className="hover:text-indigo-600"
                            >
                              {primaryContact.phone}
                            </a>
                          </div>
                        )}
                        {!primaryContact.email && !primaryContact.phone && (
                          <span className="text-xs text-gray-400">無聯絡方式</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{contactCount}</span>
                      {contactCount > 1 && (
                        <span className="text-xs text-blue-600 bg-blue-100 px-1 rounded">
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
                        className="text-indigo-600 hover:text-indigo-700"
                        title="編輯客戶資料"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClient(client.id)}
                        className="text-red-600 hover:text-red-700"
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
        
        {filteredClients.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? (
              <div>
                <p>找不到符合條件的客戶</p>
                <p className="text-sm mt-1">嘗試搜尋公司名稱、聯絡人姓名或電子郵件</p>
              </div>
            ) : (
              <div>
                <p>尚未新增任何客戶</p>
                <p className="text-sm mt-1">點擊上方「新增客戶」開始建立客戶資料</p>
              </div>
            )}
          </div>
        )}

        {/* 顯示所有聯絡人的詳細資訊（可選，展開式） */}
        {searchTerm && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
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
                    <div key={`${client.id}-${contact.name}`} className="bg-white p-3 rounded border">
                      <div className="flex items-center space-x-1 mb-1">
                        <span className="font-medium text-sm">{contact.name}</span>
                        {contact.is_primary && (
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
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