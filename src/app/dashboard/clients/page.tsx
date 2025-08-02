'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClientModal } from '@/components/clients/ClientModal'
import { PlusCircle, Edit, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'

type Client = Database['public']['Tables']['clients']['Row']

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching clients:', error)
      toast.error('載入客戶資料失敗')
    } else {
      setClients(data || [])
      setFilteredClients(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  useEffect(() => {
    const filtered = clients.filter((client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.contact_person && client.contact_person.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) // 🆕 新增 email 搜尋
    )
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

  // 🆕 更新 handleSaveClient 函式，處理 email 欄位
  const handleSaveClient = async (
    formData: {
      name: string;
      contact_person: string;
      address: string;
      tin?: string | null | undefined;
      invoice_title?: string | null | undefined;
      phone?: string | null | undefined;
      email?: string | null | undefined;  // 🆕 修正：使用 optional 型別以符合 ClientModal
      bank_info?: {
        bankName: string | null;
        branchName: string | null;
        accountNumber: string | null;
      } | null | undefined;
    },
    id?: string
  ) => {
    const dataToSave = {
      ...formData,
      phone: formData.phone || null,
      email: formData.email || null,  // 🆕 新增 email 處理
      invoice_title: formData.invoice_title || null,
      tin: formData.tin || null,
      bank_info: formData.bank_info ?? null,
    };

    if (id) {
      // 更新客戶
      const { error } = await supabase
        .from('clients')
        .update(dataToSave)
        .eq('id', id);
      if (error) {
        toast.error(`Failed to update client: ${error.message}`);
      } else {
        toast.success('Client updated successfully!');
      }
    } else {
      // 新增客戶
      const { error } = await supabase
        .from('clients')
        .insert(dataToSave);
      if (error) {
        toast.error(`Failed to create client: ${error.message}`);
      } else {
        toast.success('Client created successfully!');
      }
    }

    fetchClients();
    handleCloseModal();
  };
  
  const handleDeleteClient = async (id: string) => {
    if (window.confirm('確定要刪除這位客戶嗎？此操作無法復原。')) {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) alert('刪除客戶失敗: ' + error.message)
      else await fetchClients()
    }
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
                placeholder="搜尋客戶名稱、聯絡人或電子郵件..."
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
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium text-sm">公司名稱</th>
              <th className="p-4 font-medium text-sm">統一編號</th>
              <th className="p-4 font-medium text-sm">聯絡人</th>
              <th className="p-4 font-medium text-sm">電話</th>
              <th className="p-4 font-medium text-sm">電子郵件</th>  {/* 🆕 新增電子郵件欄位標題 */}
              <th className="p-4 font-medium text-sm text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.id} className="border-b hover:bg-gray-50">
                <td className="p-4 text-sm font-semibold text-indigo-700">{client.name}</td>
                <td className="p-4 text-sm">{client.tin}</td>
                <td className="p-4 text-sm">{client.contact_person}</td>
                <td className="p-4 text-sm">{client.phone}</td>
                {/* 🆕 新增電子郵件欄位顯示 */}
                <td className="p-4 text-sm">
                  {client.email ? (
                    <a 
                      href={`mailto:${client.email}`} 
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                      title="點擊發送郵件"
                    >
                      {client.email}
                    </a>
                  ) : (
                    <span className="text-gray-400">未設定</span>
                  )}
                </td>
                <td className="p-4 text-center space-x-1">
                   <Button variant="outline" size="sm" onClick={() => handleOpenModal(client)}>
                    <Edit className="mr-1 h-3 w-3" /> 編輯
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteClient(client.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> 刪除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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