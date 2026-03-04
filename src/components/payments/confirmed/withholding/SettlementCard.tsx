import { CheckCircle2, Clock, DollarSign, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SettlementCardProps {
    label: string
    total: number
    settled: number
    outstanding: number
    onSettle: () => void
}

export function SettlementCard({ label, total, settled, outstanding, onSettle }: SettlementCardProps) {
    const isFullySettled = total > 0 && outstanding <= 0
    const hasOutstanding = outstanding > 0

    return (
        <div className={`rounded-lg p-4 border ${isFullySettled ? 'bg-success/5 border-success/25' : hasOutstanding ? 'bg-warning/5 border-warning/25' : 'bg-secondary/50 border-border'}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-medium text-sm">
                    {isFullySettled ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : hasOutstanding ? (
                        <Clock className="h-4 w-4 text-warning" />
                    ) : (
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    )}
                    {label}
                </div>
                {hasOutstanding && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSettle}>
                        <Plus className="h-3 w-3 mr-1" />
                        標記已繳
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                    <div className="text-xs text-muted-foreground">應繳</div>
                    <div className="font-bold">NT$ {total.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground">已繳</div>
                    <div className="font-bold text-success">NT$ {settled.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground">待繳</div>
                    <div className={`font-bold ${hasOutstanding ? 'text-warning' : 'text-muted-foreground'}`}>
                        NT$ {Math.max(0, outstanding).toLocaleString()}
                    </div>
                </div>
            </div>
        </div>
    )
}
