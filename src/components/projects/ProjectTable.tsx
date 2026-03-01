'use client'

import { useState, useCallback, useEffect, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { FilePlus, Pencil, Trash2, ChevronRight, MessageSquare } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectNotesPanel } from './ProjectNotesPanel'
import { useProjectNotesCounts } from '@/hooks/useProjectNotes'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import type { Project, ProjectStatus } from '@/types/custom.types'

type ProjectWithQuotation = Project & { quotations?: { quote_number: string | null } | null }
import { cn } from '@/lib/utils'

type ProjectSortKey = 'client_name' | 'project_name' | 'project_type' | 'budget_with_tax'

interface ProjectTableProps {
  projects: ProjectWithQuotation[]
  activeTab: ProjectStatus
  onEdit: (project: ProjectWithQuotation) => void
  onDelete: (project: ProjectWithQuotation) => void
  onStatusChange: (projectId: string, newStatus: ProjectStatus) => void
  isAdmin: boolean
  currentUserId?: string
}

const TYPE_COLORS: Record<string, string> = {
  '專案': 'bg-blue-500/15 text-blue-400',
  '經紀': 'bg-purple-500/15 text-purple-400',
}

const STATUS_OPTIONS_MAP: Record<string, ProjectStatus[]> = {
  '執行中': ['執行中', '結案中'],
  '結案中': ['執行中', '結案中'],
}

function formatBudget(amount: number): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('zh-TW').format(amount)
}

export function ProjectTable({
  projects,
  activeTab,
  onEdit,
  onDelete,
  onStatusChange,
  isAdmin,
  currentUserId,
}: ProjectTableProps) {
  const router = useRouter()
  const { data: notesCounts = {} } = useProjectNotesCounts()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { sortState, toggleSort } = useTableSort<ProjectSortKey>()

  const sortedProjects = useMemo(() => {
    if (!sortState.key || !sortState.direction) return projects
    const key = sortState.key
    const dir = sortState.direction === 'asc' ? 1 : -1
    return [...projects].sort((a, b) => {
      const aVal = a[key as keyof Project]
      const bVal = b[key as keyof Project]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
      return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
    })
  }, [projects, sortState.key, sortState.direction])

  // 切換 tab 時收合展開列
  useEffect(() => {
    setExpandedId(null)
  }, [activeTab])

  const toggleExpand = useCallback((projectId: string) => {
    setExpandedId((prev) => (prev === projectId ? null : projectId))
  }, [])

  const handleCreateQuotation = (project: Project) => {
    const params = new URLSearchParams({ projectId: project.id })
    router.push(`/dashboard/quotes/new?${params.toString()}`)
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        type="no-data"
        title={`目前沒有「${activeTab}」的專案`}
        description={activeTab === '洽談中' ? '點擊右上方「新增洽談」開始追蹤新專案' : undefined}
      />
    )
  }

  const showStatusColumn = activeTab === '執行中' || activeTab === '結案中'
  const isReadonly = activeTab === '關案'
  // 基礎欄位 4 + 展開箭頭 1 + 進度欄(條件) + 操作欄(條件)
  const colCount = 5 + (showStatusColumn ? 1 : 0) + (isReadonly ? 0 : 1)

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/50">
            <TableHead className="w-8" />
            <TableHead className="w-[170px]">
              <SortableHeader label="廠商名稱" sortKey="client_name" sortState={sortState} onToggleSort={toggleSort} />
            </TableHead>
            <TableHead className="min-w-[200px]">
              <SortableHeader label="專案名稱" sortKey="project_name" sortState={sortState} onToggleSort={toggleSort} />
            </TableHead>
            <TableHead className="w-[70px] text-center">
              <SortableHeader label="類型" sortKey="project_type" sortState={sortState} onToggleSort={toggleSort} />
            </TableHead>
            <TableHead className="w-[110px] text-right">
              <SortableHeader label="預算（含稅）" sortKey="budget_with_tax" sortState={sortState} onToggleSort={toggleSort} className="justify-end" />
            </TableHead>
            {showStatusColumn && (
              <TableHead className="w-[110px]">目前進度</TableHead>
            )}
            {!isReadonly && <TableHead className="w-[90px] text-right">操作</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProjects.map((project) => {
            const isExpanded = expandedId === project.id
            const notesCount = notesCounts[project.id] || 0

            return (
              <Fragment key={project.id}>
                {/* 資料行 */}
                <TableRow
                  data-state={isExpanded ? 'expanded' : undefined}
                  className={cn(
                    'group cursor-pointer transition-colors',
                    isExpanded && 'bg-secondary/30'
                  )}
                  onClick={() => toggleExpand(project.id)}
                >
                  {/* 展開指示箭頭 */}
                  <TableCell className="w-8 px-2">
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 text-muted-foreground/40 transition-transform duration-200',
                        isExpanded && 'rotate-90'
                      )}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-sm">{project.client_name}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>
                        {project.quotations?.quote_number && <span className="text-xs font-mono text-muted-foreground mr-1.5">{project.quotations.quote_number}</span>}
                        {project.project_name}
                      </span>
                      {notesCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground/50">
                          <MessageSquare className="h-3 w-3" />
                          <span className="text-xs tabular-nums">{notesCount}</span>
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      TYPE_COLORS[project.project_type] || 'bg-muted text-muted-foreground'
                    )}>
                      {project.project_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatBudget(project.budget_with_tax)}
                  </TableCell>
                  {showStatusColumn && (
                    <TableCell>
                      <select
                        value={project.status}
                        onChange={(e) => {
                          e.stopPropagation()
                          onStatusChange(project.id, e.target.value as ProjectStatus)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {(STATUS_OPTIONS_MAP[activeTab] || []).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </TableCell>
                  )}
                  {!isReadonly && (
                    <TableCell className="text-right">
                      <div
                        className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {activeTab === '洽談中' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-primary hover:text-primary"
                            onClick={() => handleCreateQuotation(project)}
                            title="新增報價單"
                          >
                            <FilePlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onEdit(project)}
                          title="編輯"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => onDelete(project)}
                            title="刪除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>

                {/* 展開的備註行 */}
                {isExpanded && (
                  <tr>
                    <td colSpan={colCount} className="p-0 border-b border-border">
                      <ProjectNotesPanel
                        projectId={project.id}
                        isAdmin={isAdmin}
                        currentUserId={currentUserId}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
