"use client";

import {
  Briefcase,
  FileText,
  CheckCircle,
  Clock,
  UserPlus,
  Star,
  FolderKanban,
} from "lucide-react";
import Link from "next/link";

import dynamic from "next/dynamic";
import { useDashboardDataV2 } from "@/hooks/dashboard/useDashboardDataV2";
import { usePermission } from "@/lib/permissions";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ActionItems } from "@/components/dashboard/ActionItems";
import { ProjectPipelineChart } from "@/components/dashboard/ProjectPipelineChart";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";

const CaseTrendChart = dynamic(
  () =>
    import("@/components/dashboard/CaseTrendChart").then((m) => ({
      default: m.CaseTrendChart,
    })),
  {
    loading: () => (
      <div className="h-64 bg-muted/50 animate-pulse rounded-lg" />
    ),
    ssr: false,
  },
);
const QuoteStatusChart = dynamic(
  () =>
    import("@/components/dashboard/QuoteStatusChart").then((m) => ({
      default: m.QuoteStatusChart,
    })),
  {
    loading: () => (
      <div className="h-64 bg-muted/50 animate-pulse rounded-lg" />
    ),
    ssr: false,
  },
);

// 快速功能按鈕
function QuickAction({
  href,
  icon: Icon,
  text,
}: {
  href: string;
  icon: React.ElementType;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-all duration-200 group"
    >
      <Icon className="h-5 w-5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
      <span className="text-sm font-medium text-foreground">{text}</span>
    </Link>
  );
}

// 載入骨架
function DashboardSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl animate-pulse">
      <div>
        <div className="h-8 w-24 bg-muted rounded" />
        <div className="h-4 w-48 bg-muted rounded mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-5 h-20"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 h-72" />
        <div className="bg-card border border-border rounded-xl p-6 h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 h-72" />
        <div className="bg-card border border-border rounded-xl p-6 h-48" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 h-64 lg:col-span-2" />
        <div className="bg-card border border-border rounded-xl p-6 h-64" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { loading: permLoading } = usePermission();
  const { data, isLoading: dataLoading } = useDashboardDataV2();

  if (permLoading || dataLoading || !data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* 標題 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">總覽</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          公司專案與案件執行狀況
        </p>
      </div>

      {/* Section 1: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="執行中案件"
          value={`${data.kpiCards.activeProjects}`}
          icon={Briefcase}
          accentColor="text-emerald-400"
          accentBg="bg-emerald-500/15"
          sparklineData={data.sparklines.activeProjects}
          sparklineColor="#10b981"
        />
        <KpiCard
          title="本月新建"
          value={`${data.kpiCards.newProjectsThisMonth}`}
          icon={FileText}
          accentColor="text-sky-400"
          accentBg="bg-sky-500/15"
          sparklineData={data.sparklines.newProjects}
          sparklineColor="#0ea5e9"
        />
        <KpiCard
          title="本月簽約"
          value={`${data.kpiCards.signedThisMonth}`}
          icon={CheckCircle}
          accentColor="text-amber-400"
          accentBg="bg-amber-500/15"
          sparklineData={data.sparklines.signed}
          sparklineColor="#f59e0b"
        />
        <KpiCard
          title="待處理事項"
          value={`${data.kpiCards.pendingActions}`}
          icon={Clock}
          accentColor="text-rose-400"
          accentBg="bg-rose-500/15"
          sparklineData={data.sparklines.pendingActions}
          sparklineColor="#f43f5e"
        />
      </div>

      {/* Section 2: Pipeline + Quote Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProjectPipelineChart data={data.projectPipeline} />
        <QuoteStatusChart data={data.quoteStatusDistribution} />
      </div>

      {/* Section 3: Case Trend + Action Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CaseTrendChart data={data.caseTrend} />
        <ActionItems {...data.actionItems} />
      </div>

      {/* Section 4: Activity Timeline + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ActivityTimeline items={data.activityTimeline} />
        </div>
        <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
          <h3 className="text-base font-bold text-foreground mb-4">快速功能</h3>
          <div className="space-y-1">
            <QuickAction
              href="/dashboard/quotes/new"
              icon={FileText}
              text="建立新報價單"
            />
            <QuickAction
              href="/dashboard/projects"
              icon={FolderKanban}
              text="專案進度看板"
            />
            <QuickAction
              href="/dashboard/clients"
              icon={UserPlus}
              text="管理客戶"
            />
            <QuickAction href="/dashboard/kols" icon={Star} text="管理 KOL" />
          </div>
        </div>
      </div>
    </div>
  );
}
