'use client'

import { useState, useEffect, useCallback, ReactNode } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// 【修正】從 'table' (小寫) 引入元件
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { ClientModal } from '@/components/clients/ClientModal'
import { Edit, Trash2, Plus, Search } from 'lucide-react'

type Client = Database['public']['Tables']['clients']['Row']

// 【修正】自訂 Column 定義，不再依賴 TableProps
interface ColumnDef<T> {
  header: string;
  accessor: keyof T;
  render?: (row: T) => ReactNode;
}

export function ClientsTable() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchClients = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('clients').select('*')

    if (searchTerm) {
      query = query.ilike('name', `%${searchTerm}%`)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching clients:', error)
      toast.error('Failed to fetch clients')
    } else {
      setClients((data as Client[]) || [])
    }
    setLoading(false)
  }, [searchTerm])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const handleOpenModal = (client: Client | null = null) => {
    setSelectedClient(client)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedClient(null)
  }

  const handleSaveClient = async (
    formData: any, // 保持寬鬆以接收來自 Modal 的資料
    id?: string
  ) => {
    const dataToSave = {
      ...formData,
      phone: formData.phone || null,
      invoice_title: formData.invoice_title || null,
      tin: formData.tin || null,
      bank_info: formData.bank_info ?? null,
    };

    if (id) {
      const { error } = await supabase.from('clients').update(dataToSave).eq('id', id)
      if (error) {
        toast.error(`Failed to update client: ${error.message}`)
      } else {
        toast.success('Client updated successfully!')
      }
    } else {
      const { error } = await supabase.from('clients').insert(dataToSave)
      if (error) {
        toast.error(`Failed to create client: ${error.message}`)
      } else {
        toast.success('Client created successfully!')
      }
    }

    fetchClients()
    handleCloseModal()
  }

  const handleDeleteClient = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) {
        toast.error('Failed to delete client')
      } else {
        toast.success('Client deleted successfully')
        fetchClients()
      }
    }
  }

  const columns: ColumnDef<Client>[] = [
    { header: 'Name', accessor: 'name' },
    { header: 'Contact Person', accessor: 'contact_person' },
    { header: 'Phone', accessor: 'phone' },
    {
      header: 'Actions',
      accessor: 'id',
      render: (client: Client) => (
        <div className="flex space-x-2">
          <Button variant="ghost" size="sm" onClick={() => handleOpenModal(client)}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDeleteClient(client.id)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Input
          placeholder="Search clients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => handleOpenModal()}>
          <Plus className="mr-2 h-4 w-4" /> Add Client
        </Button>
      </div>
      
      {/* 【修正】使用 shadcn/ui 的標準方式來渲染表格 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.header}>{column.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : clients.length > 0 ? (
              clients.map((client) => (
                <TableRow key={client.id}>
                  {columns.map((column) => (
                    <TableCell key={column.accessor as string}>
                      {column.render ? column.render(client) : (client[column.accessor] as ReactNode) || 'N/A'}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              // 【修正】處理空狀態 (EmptyState)
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <h3 className="font-semibold">No Clients</h3>
                  <p className="text-sm text-muted-foreground">Get started by adding a new client.</p>
                  <Button className="mt-4" onClick={() => handleOpenModal()}>
                    <Plus className="mr-2 h-4 w-4" /> Add Client
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
