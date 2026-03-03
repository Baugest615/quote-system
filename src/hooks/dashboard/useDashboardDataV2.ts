"use client";

import { useQuery } from "@tanstack/react-query";
import supabase from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

// ---- 型別定義 ----

export interface ActivityTimelineItem {
  id: string;
  type:
    | "project_created"
    | "project_status_change"
    | "quote_signed"
    | "quote_created";
  title: string;
  subtitle: string;
  timestamp: string;
  status?: string;
}

export interface DashboardDataV2 {
  kpiCards: {
    activeProjects: number;
    newProjectsThisMonth: number;
    signedThisMonth: number;
    pendingActions: number;
  };
  sparklines: {
    activeProjects: number[];
    newProjects: number[];
    signed: number[];
    pendingActions: number[];
  };
  projectPipeline: {
    洽談中: number;
    執行中: number;
    結案中: number;
    關案: number;
  };
  quoteStatusDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  caseTrend: Array<{ month: string; newCases: number; signedCases: number }>;
  activityTimeline: ActivityTimelineItem[];
  actionItems: {
    pendingSignature: number;
    pendingProjectReview: number;
    pendingExpenseReview: number;
  };
  monthLabels: string[];
}

// ---- 工具函式 ----

function getMonthBuckets(count: number): { start: Date; label: string }[] {
  const buckets: { start: Date; label: string }[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ start: d, label: `${d.getMonth() + 1}月` });
  }
  return buckets;
}

function getMonthIndex(dateStr: string, buckets: { start: Date }[]): number {
  const d = new Date(dateStr);
  return buckets.findIndex(
    (b) =>
      b.start.getFullYear() === d.getFullYear() &&
      b.start.getMonth() === d.getMonth(),
  );
}

// ---- 狀態配色 ----

const QUOTE_STATUS_COLORS: Record<string, string> = {
  草稿: "#64748b",
  待簽約: "#f59e0b",
  已簽約: "#10b981",
  已歸檔: "#6366f1",
};

// ---- 資料取得 ----

async function fetchDashboardDataV2(): Promise<DashboardDataV2> {
  const buckets = getMonthBuckets(6);
  const sixMonthsAgo = buckets[0].start.toISOString();
  const thisMonthStart = buckets[5].start.toISOString();

  const [
    projectsRes,
    quotationsRes,
    pendingProjectReviewRes,
    pendingExpenseReviewRes,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, project_name, client_name, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("quotations")
      .select("id, project_name, status, created_at, updated_at, clients(name)")
      .gte("created_at", sixMonthsAgo)
      .order("updated_at", { ascending: false }),
    // 專案請款待審核：已提交但未核准也未退件
    supabase
      .from("quotation_items")
      .select("id", { count: "exact", head: true })
      .not("requested_at", "is", null)
      .is("approved_at", null)
      .is("rejected_at", null),
    // 個人報帳待審核
    supabase
      .from("expense_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
  ]);

  if (projectsRes.error) throw projectsRes.error;
  if (quotationsRes.error) throw quotationsRes.error;
  if (pendingProjectReviewRes.error) throw pendingProjectReviewRes.error;
  if (pendingExpenseReviewRes.error) throw pendingExpenseReviewRes.error;

  const projects = projectsRes.data ?? [];
  const quotations = quotationsRes.data ?? [];
  const pendingProjectReview = pendingProjectReviewRes.count ?? 0;
  const pendingExpenseReview = pendingExpenseReviewRes.count ?? 0;

  // ---- 專案 Pipeline（全量統計）----
  const pipeline = { 洽談中: 0, 執行中: 0, 結案中: 0, 關案: 0 };
  for (const p of projects) {
    if (p.status && p.status in pipeline) {
      pipeline[p.status as keyof typeof pipeline]++;
    }
  }

  // ---- KPI ----
  const activeProjects = pipeline["執行中"];

  const newProjectsThisMonth = projects.filter(
    (p) => p.created_at && p.created_at >= thisMonthStart,
  ).length;

  const signedThisMonth = quotations.filter(
    (q) =>
      q.status === "已簽約" && q.updated_at && q.updated_at >= thisMonthStart,
  ).length;

  const pendingSignature = quotations.filter(
    (q) => q.status === "待簽約",
  ).length;
  const pendingActions =
    pendingSignature + pendingProjectReview + pendingExpenseReview;

  // ---- Sparklines（月份分組）----
  const monthlyNewProjects = new Array(6).fill(0);
  const monthlyActiveProjects = new Array(6).fill(0);
  for (const p of projects) {
    if (!p.created_at) continue;
    const idx = getMonthIndex(p.created_at, buckets);
    if (idx >= 0) {
      monthlyNewProjects[idx]++;
      if (
        p.status === "執行中" ||
        p.status === "洽談中" ||
        p.status === "結案中"
      ) {
        monthlyActiveProjects[idx]++;
      }
    }
  }

  const monthlySigned = new Array(6).fill(0);
  const monthlyNewQuotes = new Array(6).fill(0);
  for (const q of quotations) {
    if (q.created_at) {
      const createdIdx = getMonthIndex(q.created_at, buckets);
      if (createdIdx >= 0) monthlyNewQuotes[createdIdx]++;
    }
    if (q.status === "已簽約" && q.updated_at) {
      const signedIdx = getMonthIndex(q.updated_at, buckets);
      if (signedIdx >= 0) monthlySigned[signedIdx]++;
    }
  }

  // 待處理 sparkline：月別待簽約數量作為趨勢參考
  const monthlyPending = new Array(6).fill(0);
  for (const q of quotations) {
    if (q.status === "待簽約" && q.created_at) {
      const idx = getMonthIndex(q.created_at, buckets);
      if (idx >= 0) monthlyPending[idx]++;
    }
  }

  // ---- 報價單狀態分布 ----
  const statusCounts: Record<string, number> = {};
  for (const q of quotations) {
    const s = q.status ?? "草稿";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  const quoteStatusDistribution = Object.entries(statusCounts).map(
    ([name, value]) => ({
      name,
      value,
      color: QUOTE_STATUS_COLORS[name] || "#94a3b8",
    }),
  );

  // ---- 案件趨勢（新建 vs 簽約）----
  const caseTrend = buckets.map((b, i) => ({
    month: b.label,
    newCases: monthlyNewQuotes[i],
    signedCases: monthlySigned[i],
  }));

  // ---- 活動時間軸 ----
  const timelineItems: ActivityTimelineItem[] = [];

  for (const p of projects.slice(0, 8)) {
    if (!p.created_at) continue;
    const created = new Date(p.created_at).getTime();
    const updated = new Date(p.updated_at ?? p.created_at).getTime();
    const isNew = updated - created < 60_000;

    timelineItems.push({
      id: `p-${p.id}`,
      type: isNew ? "project_created" : "project_status_change",
      title: p.project_name,
      subtitle: `${p.client_name} · ${p.status}`,
      timestamp: p.updated_at ?? p.created_at,
      status: p.status ?? undefined,
    });
  }

  for (const q of quotations.slice(0, 8)) {
    if (!q.created_at) continue;
    const clientName =
      (q.clients as unknown as { name: string } | null)?.name ?? "未指定客戶";
    timelineItems.push({
      id: `q-${q.id}`,
      type: q.status === "已簽約" ? "quote_signed" : "quote_created",
      title: q.project_name,
      subtitle: `${clientName} · ${q.status ?? "草稿"}`,
      timestamp: q.updated_at ?? q.created_at,
      status: q.status ?? undefined,
    });
  }

  timelineItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return {
    kpiCards: {
      activeProjects,
      newProjectsThisMonth,
      signedThisMonth,
      pendingActions,
    },
    sparklines: {
      activeProjects: monthlyActiveProjects,
      newProjects: monthlyNewProjects,
      signed: monthlySigned,
      pendingActions: monthlyPending,
    },
    projectPipeline: pipeline,
    quoteStatusDistribution,
    caseTrend,
    activityTimeline: timelineItems.slice(0, 10),
    actionItems: {
      pendingSignature,
      pendingProjectReview,
      pendingExpenseReview,
    },
    monthLabels: buckets.map((b) => b.label),
  };
}

// ---- Hook ----

export function useDashboardDataV2() {
  return useQuery({
    queryKey: [...queryKeys.dashboardStats],
    queryFn: fetchDashboardDataV2,
    staleTime: 5 * 60 * 1000,
  });
}
