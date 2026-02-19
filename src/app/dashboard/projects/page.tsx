'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject, useAutoCloseProjects } from '@/hooks/useProjects'
import { usePermission } from '@/lib/permissions'
import { ProjectFormModal, type ProjectFormData } from '@/components/projects/ProjectFormModal'
import { ProjectTable } from '@/components/projects/ProjectTable'
import { SkeletonTable, SkeletonStatCards } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, MessageSquare, Flame, ClipboardList, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types/custom.types'

const TABS: { key: ProjectStatus; label: string; icon: typeof MessageSquare; color: string }[] = [
  { key: '洽談中', label: '洽談中', icon: MessageSquare, color: 'chart-5' },
  { key: '執行中', label: '執行中', icon: Flame, color: 'chart-1' },
  { key: '結案中', label: '結案中', icon: ClipboardList, color: 'chart-4' },
  { key: '關案', label: '關案', icon: CheckCircle2, color: 'chart-3' },
]

const TAB_COLORS: Record<string, string> = {
  'chart-5': 'bg-[hsl(var(--chart-5))]/15 text-[hsl(var(--chart-5))] border-[hsl(var(--chart-5))]/30',
  'chart-1': 'bg-[hsl(var(--chart-1))]/15 text-[hsl(var(--chart-1))] border-[hsl(var(--chart-1))]/30',
  'chart-4': 'bg-[hsl(var(--chart-4))]/15 text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4))]/30',
  'chart-3': 'bg-[hsl(var(--chart-3))]/15 text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3))]/30',
}

const TAB_ACTIVE_RING: Record<string, string> = {
  'chart-5': 'ring-[hsl(var(--chart-5))]/50',
  'chart-1': 'ring-[hsl(var(--chart-1))]/50',
  'chart-4': 'ring-[hsl(var(--chart-4))]/50',
  'chart-3': 'ring-[hsl(var(--chart-3))]/50',
}

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const autoClose = useAutoCloseProjects()
  const { userRole, userId } = usePermission()

  const [activeTab, setActiveTab] = useState<ProjectStatus>('洽談中')
  const [searchTerm, setSearchTerm] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // 頁面載入時執行自動關案檢查
  useEffect(() => {
    autoClose.mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 各狀態專案統計
  const statusCounts = useMemo(() => {
    if (!projects) return { '洽談中': 0, '執行中': 0, '結案中': 0, '關案': 0 }
    return {
      '洽談中': projects.filter((p) => p.status === '洽談中').length,
      '執行中': projects.filter((p) => p.status === '執行中').length,
      '結案中': projects.filter((p) => p.status === '結案中').length,
      '關案': projects.filter((p) => p.status === '關案').length,
    }
  }, [projects])

  // 篩選當前 Tab 的專案 + 搜尋
  const filteredProjects = useMemo(() => {
    if (!projects) return []
    let result = projects.filter((p) => p.status === activeTab)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (p) =>
          p.client_name.toLowerCase().includes(term) ||
          p.project_name.toLowerCase().includes(term) ||
          (p.notes && p.notes.toLowerCase().includes(term))
      )
    }
    return result
  }, [projects, activeTab, searchTerm])

  const handleCreate = useCallback(async (data: ProjectFormData) => {
    await createProject.mutateAsync(data)
    setIsFormOpen(false)
  }, [createProject])

  const handleUpdate = useCallback(async (data: ProjectFormData) => {
    if (!editingProject) return
    await updateProject.mutateAsync({ id: editingProject.id, data })
    setEditingProject(null)
    setIsFormOpen(false)
  }, [editingProject, updateProject])

  const handleDelete = useCallback(async (project: Project) => {
    if (!confirm(`確定要刪除「${project.project_name}」嗎？`)) return
    await deleteProject.mutateAsync(project.id)
  }, [deleteProject])

  const handleStatusChange = useCallback(async (projectId: string, newStatus: ProjectStatus) => {
    await updateProject.mutateAsync({ id: projectId, data: { status: newStatus } })
  }, [updateProject])

  const openCreateForm = () => {
    setEditingProject(null)
    setIsFormOpen(true)
  }

  const openEditForm = (project: Project) => {
    setEditingProject(project)
    setIsFormOpen(true)
  }

  const isAdmin = userRole === 'Admin'

  return (
    <div className="space-y-6">
      {/* 頁面標題與操作區 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">專案進度管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            追蹤專案從洽談到結案的完整流程
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜尋廠商或專案..."
              className="pl-9 w-[220px]"
            />
          </div>
          <Button onClick={openCreateForm}>
            <Plus className="h-4 w-4 mr-1.5" />
            新增洽談
          </Button>
        </div>
      </div>

      {/* KPI 統計卡片 */}
      {isLoading ? (
        <SkeletonStatCards count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const count = statusCounts[tab.key]
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-xl border transition-all text-left',
                  TAB_COLORS[tab.color],
                  isActive && `ring-2 ${TAB_ACTIVE_RING[tab.color]}`,
                  !isActive && 'opacity-60 hover:opacity-80'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <div>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs font-medium opacity-80">{tab.label}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 表格區域 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {activeTab}
            <span className="text-muted-foreground ml-2">
              ({filteredProjects.length})
            </span>
          </h2>
        </div>
        {isLoading ? (
          <div className="p-4">
            <SkeletonTable rows={5} columns={6} />
          </div>
        ) : (
          <ProjectTable
            projects={filteredProjects}
            activeTab={activeTab}
            onEdit={openEditForm}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            isAdmin={isAdmin}
            currentUserId={userId || undefined}
          />
        )}
      </div>

      {/* 表單 Modal */}
      <ProjectFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false)
          setEditingProject(null)
        }}
        onSubmit={editingProject ? handleUpdate : handleCreate}
        isSubmitting={createProject.isPending || updateProject.isPending}
        editingProject={editingProject}
      />
    </div>
  )
}
