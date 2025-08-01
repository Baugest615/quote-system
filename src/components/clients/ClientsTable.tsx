'use client'

import { useState, useEffect } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { ClientModal } from './ClientModal'
import { PlusCircle, Edit, Trash2 } from 'lucide-react'

type Client = Database['public']['Tables']['clients']['Row']

export default function ClientsTable() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const fetchClients = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching clients:', error)
      alert('讀取客戶資料失敗')
    } else {
      setClients(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchClients()
  }, [])

  const handleOpenModal = (client: Client | null = null) => {
    setSelectedClient(client)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClient(null)
  }

  const handleSaveClient = async (
    clientData: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'bank_info'>,
    id?: string
  ) => {
    if (id) {
      // Update
      const { error } = await supabase.from('clients').update(clientData).eq('id', id)
      if (error) {
        alert('更新客戶失敗: ' + error.message)
      }
    } else {
      // Create
      const { error } = await supabase.from('clients').insert([clientData])
      if (error) {
        alert('新增客戶失敗: ' + error.message)
      }
    }
    await fetchClients()
    handleCloseModal()
  }
  
  const handleDeleteClient = async (id: string) => {
    if (window.confirm('確定要刪除這位客戶嗎？此操作無法復原。')) {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) {
        alert('刪除客戶失敗: ' + error.message)
      } else {
        await fetchClients()
      }
    }
  }


  if (loading) {
    return <div>讀取中...</div>
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">客戶管理</h1>
        <Button onClick={() => handleOpenModal()}>
          <PlusCircle className="mr-2 h-4 w-4" /> 新增客戶
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium">公司名稱</th>
              <th className="p-4 font-medium">統一編號</th>
              <th className="p-4 font-medium">聯絡人</th>
              <th className="p-4 font-medium">電話</th>
              <th className="p-4 font-medium text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b hover:bg-gray-50">
                <td className="p-4">{client.name}</td>
                <td className="p-4">{client.tin}</td>
                <td className="p-4">{client.contact_person}</td>
                <td className="p-4">{client.phone}</td>
                <td className="p-4 text-center">
                   <Button variant="ghost" size="icon" onClick={() => handleOpenModal(client)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDeleteClient(client.id)}>
                    <Trash2 className="h-4 w-4" />
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