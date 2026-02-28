'use client'

import { useState, useEffect, useMemo } from 'react'
import { FormModal } from '@/components/ui/FormModal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AutocompleteWithCreate, type AutocompleteOption } from '@/components/ui/AutocompleteWithCreate'
import { useClients } from '@/hooks/useClients'
import type { Project, ProjectType } from '@/types/custom.types'

interface ProjectFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: ProjectFormData) => void
  isSubmitting?: boolean
  editingProject?: Project | null
}

export interface ProjectFormData {
  client_id: string | null
  client_name: string
  project_name: string
  project_type: ProjectType
  budget_with_tax: number
  notes: string | null
}

export function ProjectFormModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  editingProject,
}: ProjectFormModalProps) {
  const { data: clients = [] } = useClients()

  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('專案')
  const [budgetWithTax, setBudgetWithTax] = useState('')
  const [notes, setNotes] = useState('')

  // 編輯模式時填入現有資料
  useEffect(() => {
    if (editingProject) {
      setClientId(editingProject.client_id)
      setClientName(editingProject.client_name)
      setProjectName(editingProject.project_name)
      setProjectType(editingProject.project_type)
      setBudgetWithTax(editingProject.budget_with_tax?.toString() || '')
      setNotes(editingProject.notes || '')
    } else {
      resetForm()
    }
  }, [editingProject, isOpen])

  const resetForm = () => {
    setClientId(null)
    setClientName('')
    setProjectName('')
    setProjectType('專案')
    setBudgetWithTax('')
    setNotes('')
  }

  const clientOptions: AutocompleteOption[] = useMemo(
    () => clients.map((c) => ({
      label: c.name,
      value: c.id,
      description: c.tin || undefined,
    })),
    [clients]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientName.trim() || !projectName.trim()) return

    onSubmit({
      client_id: clientId,
      client_name: clientName.trim(),
      project_name: projectName.trim(),
      project_type: projectType,
      budget_with_tax: parseFloat(budgetWithTax) || 0,
      notes: notes.trim() || null,
    })
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingProject ? '編輯專案' : '新增洽談專案'}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={editingProject ? '更新' : '新增'}
    >
      {/* 廠商名稱 */}
      <div>
        <Label>廠商名稱 <span className="text-destructive">*</span></Label>
        <AutocompleteWithCreate
          selectedId={clientId}
          inputText={clientName}
          onSelect={(id, _data) => {
            setClientId(id)
            const client = clients.find((c) => c.id === id)
            if (client) setClientName(client.name)
          }}
          onCreateIntent={(text) => {
            setClientId(null)
            setClientName(text)
          }}
          onClear={() => {
            setClientId(null)
            setClientName('')
          }}
          options={clientOptions}
          placeholder="搜尋或輸入廠商名稱..."
          createLabel="新增廠商"
          className="mt-1"
        />
      </div>

      {/* 專案名稱 */}
      <div>
        <Label>專案名稱 <span className="text-destructive">*</span></Label>
        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="輸入專案名稱"
          className="mt-1"
        />
      </div>

      {/* 案件類型 */}
      <div>
        <Label>案件類型</Label>
        <div className="flex gap-3 mt-1">
          {(['專案', '經紀'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setProjectType(type)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                projectType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* 專案預算（含稅） */}
      <div>
        <Label>專案預算（含稅）</Label>
        <Input
          type="number"
          value={budgetWithTax}
          onChange={(e) => setBudgetWithTax(e.target.value)}
          placeholder="0"
          className="mt-1"
        />
      </div>

      {/* 備註 */}
      <div>
        <Label>備註</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="輸入需要注意的事項..."
          rows={3}
          className="mt-1"
        />
      </div>
    </FormModal>
  )
}
