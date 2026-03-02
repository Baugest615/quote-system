"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface CaseTrendChartProps {
  data: Array<{ month: string; newCases: number; signedCases: number }>;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p
          key={p.dataKey}
          className="text-sm font-bold"
          style={{ color: p.color }}
        >
          {p.dataKey === "newCases" ? "新建" : "簽約"}：{p.value} 件
        </p>
      ))}
    </div>
  );
}

export function CaseTrendChart({ data }: CaseTrendChartProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
      <h3 className="text-base font-bold text-foreground mb-4">案件趨勢</h3>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="newCasesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
              <linearGradient
                id="signedCasesGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={28}
              formatter={(value: string) => (
                <span className="text-xs text-muted-foreground">
                  {value === "newCases" ? "新建案件" : "簽約案件"}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="newCases"
              stroke="#0ea5e9"
              strokeWidth={2}
              fill="url(#newCasesGradient)"
              dot={{ r: 3, fill: "#0ea5e9", strokeWidth: 0 }}
              activeDot={{
                r: 5,
                fill: "#0ea5e9",
                stroke: "#0284c7",
                strokeWidth: 2,
              }}
            />
            <Area
              type="monotone"
              dataKey="signedCases"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#signedCasesGradient)"
              dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
              activeDot={{
                r: 5,
                fill: "#10b981",
                stroke: "#0d9488",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
