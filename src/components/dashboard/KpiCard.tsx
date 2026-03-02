'use client'

import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface KpiCardProps {
  title: string
  subtitle?: string
  value: string
  icon: React.ElementType
  accentColor: string
  accentBg: string
  sparklineData: number[]
  sparklineColor: string
}

export function KpiCard({
  title,
  subtitle,
  value,
  icon: Icon,
  accentColor,
  accentBg,
  sparklineData,
  sparklineColor,
}: KpiCardProps) {
  const chartData = sparklineData.map((v, i) => ({ v, i }))

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 hover:border-emerald-500/30 transition-all duration-300">
      <div className="flex items-center justify-between gap-3">
        {/* 左側：icon + 數值 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`${accentBg} rounded-lg p-2.5 flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${accentColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground font-medium truncate">
              {title}
              {subtitle && <span className="text-[10px] ml-1 opacity-60">{subtitle}</span>}
            </p>
            <p className="text-xl sm:text-2xl font-bold text-foreground font-mono tracking-tight">
              {value}
            </p>
          </div>
        </div>

        {/* 右側：Sparkline（手機版隱藏） */}
        <div className="hidden sm:block w-20 h-10 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={sparklineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparklineColor}
                strokeWidth={2}
                fill={`url(#gradient-${title})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
