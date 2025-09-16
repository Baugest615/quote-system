// src/components/quotes/QuoteContactsSelector.tsx - 修正 import 錯誤版本
'use client'

import { useState, useEffect } from 'react'
import { Controller } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Database } from '@/types/database.types'
import { Building2, User, Star, Mail, Phone } from 'lucide-react'
import supabase from '@/lib/supabase/client' // 新增缺少的 import

type Client = Database['public']['Tables']['clients']['Row']

// 聯絡人介面定義
interface Contact {
  name: string
  email?: string
  phone?: string
  position?: string
  is_primary?: boolean
}

// 擴展客戶類型
type ClientWithContacts = Client & {
  parsedContacts: Contact[]
}

interface QuoteContactsSelectorProps {
  clients: ClientWithContacts[]
  selectedClientId: string | null
  selectedContact: Contact | null
  onClientChange: (clientId: string) => void
  onContactChange: (contact: Contact | null) => void
  control: any
  errors: any
}

export function QuoteContactsSelector({
  clients,
  selectedClientId,
  selectedContact,
  onClientChange,
  onContactChange,
  control,
  errors
}: QuoteContactsSelectorProps) {
  const [clientContacts, setClientContacts] = useState<Contact[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientWithContacts | null>(null)

  // 當選擇的客戶改變時，載入該客戶的聯絡人
  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId)
      if (client) {
        setSelectedClient(client)
        setClientContacts(client.parsedContacts)
        
        // 自動選擇主要聯絡人
        const primaryContact = client.parsedContacts.find(c => c.is_primary)
        const contactToSelect = primaryContact || client.parsedContacts[0] || null
        
        onContactChange(contactToSelect)
      } else {
        setSelectedClient(null)
        setClientContacts([])
        onContactChange(null)
      }
    } else {
      setSelectedClient(null)
      setClientContacts([])
      onContactChange(null)
    }
  }, [selectedClientId, clients, onContactChange])

  return (
    <div className="space-y-6">
      {/* 客戶與聯絡人選擇區塊 */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Building2 className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 flex-1">
            客戶與聯絡人資訊
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 選擇客戶 */}
          <div>
            <label htmlFor="client-select" className="block text-sm font-medium text-gray-700 mb-1">
              選擇客戶 (必填)
            </label>
            <Controller
              control={control}
              name="client_id"
              render={({ field: { onChange, value } }) => (
                <select
                  id="client-select"
                  value={value || ''}
                  onChange={(e) => {
                    const clientId = e.target.value
                    onChange(clientId)
                    onClientChange(clientId)
                  }}
                  className="form-input w-full"
                  aria-label="選擇客戶"
                >
                  <option value="">-- 選擇客戶 --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                      {client.parsedContacts.length > 0 && (
                        ` (${client.parsedContacts.length}位聯絡人)`
                      )}
                    </option>
                  ))}
                </select>
              )}
            />
            {errors.client_id && (
              <p className="text-red-500 text-xs mt-1">{errors.client_id.message}</p>
            )}
          </div>

          {/* 選擇聯絡人 */}
          <div>
            <label htmlFor="contact-select" className="block text-sm font-medium text-gray-700 mb-1">
              選擇聯絡窗口 {clientContacts.length > 0 && '(必填)'}
            </label>
            <Controller
              control={control}
              name="selected_contact"
              render={({ field: { onChange } }) => (
                <select
                  id="contact-select"
                  value={selectedContact ? JSON.stringify(selectedContact) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      try {
                        const contact = JSON.parse(e.target.value)
                        onChange(contact)
                        onContactChange(contact)
                      } catch (error) {
                        console.error('解析聯絡人資料失敗:', error)
                      }
                    } else {
                      onChange(null)
                      onContactChange(null)
                    }
                  }}
                  className="form-input w-full"
                  disabled={clientContacts.length === 0}
                  aria-label="選擇聯絡窗口"
                >
                  <option value="">-- 選擇聯絡窗口 --</option>
                  {clientContacts.map((contact, index) => (
                    <option key={index} value={JSON.stringify(contact)}>
                      {contact.name}
                      {contact.is_primary && ' ⭐'}
                      {contact.position && ` - ${contact.position}`}
                    </option>
                  ))}
                </select>
              )}
            />
            
            {clientContacts.length === 0 && selectedClientId && (
              <p className="text-amber-600 text-xs mt-1">
                此客戶尚未設定聯絡人，請先編輯客戶資料新增聯絡窗口
              </p>
            )}
            
            {errors.selected_contact && (
              <p className="text-red-500 text-xs mt-1">{errors.selected_contact.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* 顯示選中的聯絡人詳細資訊 */}
      {selectedContact && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-3">
            <User className="h-5 w-5 text-indigo-600" />
            <h4 className="font-medium text-gray-700">選中的聯絡人資訊</h4>
            {selectedContact.is_primary && (
              <div className="flex items-center space-x-1 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                <Star className="h-3 w-3 fill-current" />
                <span>主要聯絡人</span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人姓名</label>
              <Input 
                value={selectedContact.name} 
                readOnly 
                className="bg-white border-gray-200" 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">職稱</label>
              <Input 
                value={selectedContact.position || '未設定'} 
                readOnly 
                className="bg-white border-gray-200" 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label>
              <div className="flex items-center">
                <Input 
                  value={selectedContact.email || '未設定'} 
                  readOnly 
                  className="bg-white border-gray-200 flex-1" 
                />
                {selectedContact.email && (
                  <a 
                    href={`mailto:${selectedContact.email}`}
                    className="ml-2 p-2 text-indigo-600 hover:text-indigo-700"
                    title="發送郵件"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
              <div className="flex items-center">
                <Input 
                  value={selectedContact.phone || '未設定'} 
                  readOnly 
                  className="bg-white border-gray-200 flex-1" 
                />
                {selectedContact.phone && (
                  <a 
                    href={`tel:${selectedContact.phone}`}
                    className="ml-2 p-2 text-indigo-600 hover:text-indigo-700"
                    title="撥打電話"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 顯示客戶公司資訊 */}
      {selectedClient && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-700 mb-3">客戶公司資訊</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">統一編號</label>
              <Input 
                value={selectedClient.tin || '未設定'} 
                readOnly 
                className="bg-white border-gray-200" 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">發票抬頭</label>
              <Input 
                value={selectedClient.invoice_title || '未設定'} 
                readOnly 
                className="bg-white border-gray-200" 
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">公司地址</label>
              <Input 
                value={selectedClient.address || '未設定'} 
                readOnly 
                className="bg-white border-gray-200" 
              />
            </div>
          </div>
        </div>
      )}

      {/* 顯示該客戶的所有聯絡人（如果有多個） */}
      {clientContacts.length > 1 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-700 mb-3">
            {selectedClient?.name} 的所有聯絡人 ({clientContacts.length}位)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clientContacts.map((contact, index) => (
              <div 
                key={index}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedContact && selectedContact.name === contact.name
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => onContactChange(contact)}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-medium text-sm">{contact.name}</span>
                  {contact.is_primary && (
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  )}
                </div>
                {contact.position && (
                  <div className="text-xs text-gray-600 mb-1">{contact.position}</div>
                )}
                <div className="text-xs text-gray-500 space-y-1">
                  {contact.email && (
                    <div className="flex items-center space-x-1">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center space-x-1">
                      <Phone className="h-3 w-3" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Hook for fetching clients with parsed contacts
export function useClientsWithContacts() {
  const [clients, setClients] = useState<ClientWithContacts[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchClientsWithContacts() {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .order('name')

        if (error) throw error

        const clientsWithContacts = (data || []).map((client: Client) => {
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
          } as ClientWithContacts
        })

        setClients(clientsWithContacts)
      } catch (error) {
        console.error('載入客戶資料失敗:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchClientsWithContacts()
  }, [])

  return { clients, loading }
}