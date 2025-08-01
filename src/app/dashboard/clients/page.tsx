'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClientModal } from '@/components/clients/ClientModal'
import { PlusCircle, Edit, Trash2, Search } from 'lucide-react'

type Client = Database['public']['Tables']['clients']['Row']

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching clients:', error)
      alert('讀取客戶資料失敗')
    } else {
      setClients(data)
      setFilteredClients(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = clients.filter(client => 
      client.name.toLowerCase().includes(lowercasedFilter) ||
      (client.contact_person && client.contact_person.toLowerCase().includes(lowercasedFilter))
    );
    setFilteredClients(filteredData);
  }, [searchTerm, clients]);

  const handleOpenModal = (client: Client | null = null) => {
    setSelectedClient(client)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClient(null)
  }

  const handleSaveClient = async (
    clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>,
    id?: string
  ) => {
    if (id) {
      const { error } = await supabase.from('clients').update(clientData).eq('id', id)
      if (error) alert('更新客戶失敗: ' + error.message)
    } else {
      const { error } = await supabase.from('clients').insert([clientData])
      if (error) alert('新增客戶失敗: ' + error.message)
    }
    await fetchClients()
    handleCloseModal()
  }
  
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
                placeholder="搜尋客戶名稱或聯絡人..."
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