// 分組管理 Hook
// 統一的分組邏輯，支援專案分組、展開/收合等

import { useState, useMemo, useCallback } from 'react'
import { groupItemsByProject, toggleGroupExpansion, expandAllGroups, collapseAllGroups } from '@/lib/payments/grouping'
import type { ProjectGroup } from '@/lib/payments/types'

export interface UsePaymentGroupingReturn<T> {
    projectGroups: ProjectGroup<T>[]
    expandedProjects: Set<string>
    toggleProject: (projectId: string) => void
    expandAll: () => void
    collapseAll: () => void
    isAllExpanded: boolean
    isAllCollapsed: boolean
}

/**
 * 分組管理 Hook
 * @param items 項目列表
 * @returns 分組狀態和操作函數
 */
export function usePaymentGrouping<T extends {
    quotation_id: string | null
    quotations: {
        project_name: string
        clients: { name: string } | null
    } | null
    cost_amount_input?: number
    price?: number
    quantity?: number
    rejection_reason?: string | null
    attachments?: any[]
    invoice_number_input?: string | null
}>(items: T[]): UsePaymentGroupingReturn<T> {
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

    // 計算分組
    const projectGroups = useMemo(() => {
        const groups = groupItemsByProject(items)

        // 初始化展開狀態（第一次載入時展開所有）
        // if (expandedProjects.size === 0 && groups.length > 0) {
        //     setExpandedProjects(new Set(groups.map(g => g.projectId)))
        // }

        // 更新分組的展開狀態
        return groups.map(group => ({
            ...group,
            isExpanded: expandedProjects.has(group.projectId)
        }))
    }, [items, expandedProjects])

    // 切換專案展開狀態
    const toggleProject = useCallback((projectId: string) => {
        setExpandedProjects(prev => {
            const newSet = new Set(prev)
            if (newSet.has(projectId)) {
                newSet.delete(projectId)
            } else {
                newSet.add(projectId)
            }
            return newSet
        })
    }, [])

    // 展開所有專案
    const expandAll = useCallback(() => {
        setExpandedProjects(new Set(projectGroups.map(g => g.projectId)))
    }, [projectGroups])

    // 收合所有專案
    const collapseAll = useCallback(() => {
        setExpandedProjects(new Set())
    }, [])

    // 檢查是否全部展開
    const isAllExpanded = useMemo(() => {
        return projectGroups.length > 0 &&
            expandedProjects.size === projectGroups.length
    }, [projectGroups, expandedProjects])

    // 檢查是否全部收合
    const isAllCollapsed = useMemo(() => {
        return expandedProjects.size === 0
    }, [expandedProjects])

    return {
        projectGroups,
        expandedProjects,
        toggleProject,
        expandAll,
        collapseAll,
        isAllExpanded,
        isAllCollapsed
    }
}
