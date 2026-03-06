'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkbenchFilters as FiltersType } from '@/hooks/payment-workbench/types'

interface WorkbenchFiltersProps {
  filters: FiltersType
  onFiltersChange: (filters: FiltersType) => void
  projectOptions: string[]
  monthOptions: string[]
  filteredTotal: number
  filteredCount: number
}

export function WorkbenchFilters({
  filters,
  onFiltersChange,
  projectOptions,
  monthOptions,
  filteredTotal,
  filteredCount,
}: WorkbenchFiltersProps) {
  const updateFilter = (key: keyof FiltersType, value: string) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 搜尋 */}
      <div className="relative flex-1 min-w-[200px] max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜尋匯款對象、KOL、專案、公司、發票..."
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* 專案篩選 */}
      <Select
        value={filters.project}
        onValueChange={(v) => updateFilter('project', v)}
      >
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="所有專案" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">所有專案</SelectItem>
          {projectOptions.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 月份篩選 */}
      <Select
        value={filters.month}
        onValueChange={(v) => updateFilter('month', v)}
      >
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="所有月份" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">所有月份</SelectItem>
          {monthOptions.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 篩選合計 */}
      <div className="ml-auto flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{filteredCount} 筆</span>
        <span className="font-semibold text-foreground">
          NT$ {filteredTotal.toLocaleString()}
        </span>
      </div>
    </div>
  )
}
