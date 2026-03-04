import React from 'react'

interface SummaryCardProps {
    label: string
    value: number
    icon: React.ReactNode
    color: string
    isCount?: boolean
}

export function SummaryCard({ label, value, icon, color, isCount }: SummaryCardProps) {
    return (
        <div className="bg-secondary/50 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                {icon}
                {label}
            </div>
            <div className={`text-lg font-bold ${color}`}>
                {isCount ? value : `NT$ ${value.toLocaleString()}`}
            </div>
        </div>
    )
}
