interface SpreadsheetLegendProps {
    allowInsert: boolean
}

export function SpreadsheetLegend({ allowInsert }: SpreadsheetLegendProps) {
    return (
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 px-1">
            {allowInsert && (
                <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-success/30 border border-success" />
                    新增列
                </span>
            )}
            <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-warning/30 border border-warning" />
                已修改
            </span>
            <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-destructive/30 border border-destructive" />
                待刪除
            </span>
            <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-destructive/20 border border-destructive" />
                驗證錯誤
            </span>
            <span className="ml-auto text-muted-foreground/60">支援從 Excel 直接貼上（Ctrl+V）| 點擊欄標題排序 | 點擊漏斗圖示篩選</span>
        </div>
    )
}
