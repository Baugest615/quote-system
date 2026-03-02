"use client";

import Link from "next/link";
import { FileText, ChevronRight, Receipt, ClipboardCheck } from "lucide-react";

interface ActionItemsProps {
  pendingSignature: number;
  pendingProjectReview: number;
  pendingExpenseReview: number;
}

const items = [
  {
    key: "pendingSignature" as const,
    label: "筆報價待簽約",
    href: "/dashboard/quotes?status=待簽約",
    icon: FileText,
    activeColor: "text-amber-400 bg-amber-500/15",
  },
  {
    key: "pendingProjectReview" as const,
    label: "筆專案請款待審核",
    href: "/dashboard/quotes",
    icon: ClipboardCheck,
    activeColor: "text-sky-400 bg-sky-500/15",
  },
  {
    key: "pendingExpenseReview" as const,
    label: "筆個人報帳待審核",
    href: "/dashboard/expense-claims",
    icon: Receipt,
    activeColor: "text-violet-400 bg-violet-500/15",
  },
];

export function ActionItems({
  pendingSignature,
  pendingProjectReview,
  pendingExpenseReview,
}: ActionItemsProps) {
  const counts = {
    pendingSignature,
    pendingProjectReview,
    pendingExpenseReview,
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
      <h3 className="text-base font-bold text-foreground mb-4">待辦事項</h3>
      <div className="space-y-2">
        {items.map((item) => {
          const count = counts[item.key];
          const isZero = count === 0;
          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
                isZero
                  ? "opacity-40 pointer-events-none"
                  : "hover:bg-muted/50 cursor-pointer"
              }`}
            >
              <div
                className={`rounded-lg p-2 flex-shrink-0 ${
                  isZero ? "bg-muted text-muted-foreground" : item.activeColor
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm text-foreground flex-1">
                <span className="font-bold tabular-nums">{count}</span>{" "}
                {item.label}
              </span>
              {!isZero && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
