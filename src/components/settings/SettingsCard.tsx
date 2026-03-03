'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusCircle, Edit, Trash2, Save } from 'lucide-react'

interface Item {
  id: string
  name: string
}

interface SettingsCardProps {
  title: string
  items: Item[]
  onAddItem: (name: string) => Promise<void>
  onUpdateItem: (id: string, name: string) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
}

export default function SettingsCard({ title, items, onAddItem, onUpdateItem, onDeleteItem }: SettingsCardProps) {
  const [newItemName, setNewItemName] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState('')

  const handleAddItem = async () => {
    if (newItemName.trim()) {
      await onAddItem(newItemName.trim())
      setNewItemName('')
    }
  }

  const handleEdit = (item: Item) => {
    setEditingItemId(item.id)
    setEditingItemName(item.name)
  }

  const handleCancelEdit = () => {
    setEditingItemId(null)
    setEditingItemName('')
  }
  
  const handleUpdateItem = async (id: string) => {
    if (editingItemName.trim()) {
      await onUpdateItem(id, editingItemName.trim())
      handleCancelEdit()
    }
  }

  return (
    <div className="bg-card rounded-lg shadow-none border border-border p-6">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <div className="space-y-2 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-2 rounded hover:bg-secondary">
            {editingItemId === item.id ? (
              <Input
                value={editingItemName}
                onChange={(e) => setEditingItemName(e.target.value)}
                className="flex-grow"
              />
            ) : (
              <span className="text-foreground/70">{item.name}</span>
            )}
            <div className="space-x-1">
              {editingItemId === item.id ? (
                <>
                  <Button variant="ghost" size="icon" onClick={() => handleUpdateItem(item.id)} aria-label="儲存">
                    <Save className="h-4 w-4 text-success" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleCancelEdit} aria-label="取消編輯">
                    <span className="text-sm">取消</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(item)} aria-label="編輯">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDeleteItem(item.id)} aria-label="刪除">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex space-x-2 border-t pt-4">
        <Input
          placeholder="新增項目名稱..."
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
        />
        <Button onClick={handleAddItem}>
          <PlusCircle className="mr-2 h-4 w-4" /> 新增
        </Button>
      </div>
    </div>
  )
}