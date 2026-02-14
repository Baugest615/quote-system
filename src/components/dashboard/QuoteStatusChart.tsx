'use client'

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

interface QuoteStatusChartProps {
  data: Array<{ name: string; value: number; color: string }>
}

export function QuoteStatusChart({ data }: QuoteStatusChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
      <h3 className="text-base font-bold text-foreground mb-4">
        報價單狀態分布
      </h3>
      <div className="flex items-center gap-6">
        {/* 圓餅圖 */}
        <div className="w-40 h-40 sm:w-48 sm:h-48 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={3}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              {/* 中心數字 */}
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground text-2xl font-bold"
              >
                {total}
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground text-xs"
              >
                總報價單
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 圖例 */}
        <div className="flex flex-col gap-3 min-w-0">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-muted-foreground truncate">
                {item.name}
              </span>
              <span className="text-sm font-bold text-foreground ml-auto tabular-nums">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
