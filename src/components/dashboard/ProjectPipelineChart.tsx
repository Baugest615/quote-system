"use client";

import { cn } from "@/lib/utils";

interface ProjectPipelineChartProps {
  data: {
    洽談中: number;
    執行中: number;
    結案中: number;
    關案: number;
  };
}

const PIPELINE_STAGES = [
  {
    key: "洽談中" as const,
    color: "#f59e0b",
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-400",
  },
  {
    key: "執行中" as const,
    color: "#10b981",
    bgClass: "bg-emerald-500/15",
    textClass: "text-emerald-400",
  },
  {
    key: "結案中" as const,
    color: "#0ea5e9",
    bgClass: "bg-sky-500/15",
    textClass: "text-sky-400",
  },
  {
    key: "關案" as const,
    color: "#64748b",
    bgClass: "bg-slate-500/15",
    textClass: "text-slate-400",
  },
];

export function ProjectPipelineChart({ data }: ProjectPipelineChartProps) {
  const total = Object.values(data).reduce((sum, v) => sum + v, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-bold text-foreground">專案進度管道</h3>
        <span className="text-xs text-muted-foreground">
          共{" "}
          <span className="font-bold text-foreground tabular-nums">
            {total}
          </span>{" "}
          個專案
        </span>
      </div>

      {/* 水平堆疊長條 */}
      {total > 0 ? (
        <div className="flex w-full h-10 rounded-lg overflow-hidden mb-5">
          {PIPELINE_STAGES.map((stage) => {
            const count = data[stage.key];
            if (count === 0) return null;
            const pct = (count / total) * 100;
            // 非零段至少 8% 寬度，確保可見
            const minPct = Math.max(pct, 8);
            return (
              <div
                key={stage.key}
                className="flex items-center justify-center transition-all duration-300"
                style={{
                  width: `${minPct}%`,
                  backgroundColor: stage.color,
                  minWidth: "2rem",
                }}
              >
                <span className="text-xs font-bold text-white drop-shadow-sm">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex w-full h-10 rounded-lg bg-muted items-center justify-center mb-5">
          <span className="text-xs text-muted-foreground">尚無專案資料</span>
        </div>
      )}

      {/* 階段統計卡片 */}
      <div className="grid grid-cols-4 gap-2">
        {PIPELINE_STAGES.map((stage) => {
          const count = data[stage.key];
          return (
            <div
              key={stage.key}
              className={cn("rounded-lg p-2.5 text-center", stage.bgClass)}
            >
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  stage.textClass,
                )}
              >
                {count}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                {stage.key}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
