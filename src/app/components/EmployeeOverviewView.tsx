"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import type { EmployeeStage } from "@/lib/employeeStages";
import type { EmployeeOverviewRow } from "@/lib/employeeQueries";
import EmployeeStageCards from "@/app/components/EmployeeStageCards";
import EmployeeRecordsTable from "@/app/components/EmployeeRecordsTable";

interface Props {
  rows: EmployeeOverviewRow[];
  counts: Record<EmployeeStage, number>;
  userName?: string | null;
  /** userId -> overdue Task Manager task count, for the red dot next to Name. */
  overdueTaskCounts?: Record<number, number>;
  /** Full-Time employees whose probation end date is within 3 days (or
   *  already passed) with no Confirm/Extend/Stop decision made yet — see
   *  probationDecision.ts's computeProbationReminderCandidates. Drives the
   *  red dot + tooltip on the Probation summary card, same signal as the
   *  NotificationBell's own Probation card. One name per line in the
   *  tooltip when 2+ people are flagged at once, per explicit decision (see
   *  conversation) — not merged into one sentence. endDate (2026-08-19) lets
   *  the tooltip compute the real day count via probationReminderText.ts
   *  instead of a hardcoded "3 days" — see that file's own comment. */
  probationReminderNames?: { name: string; endDate: string }[];
}

// The 5-card summary and the search/filter/table below it are extracted into
// EmployeeStageCards.tsx / EmployeeRecordsTable.tsx (2026-08-26, see
// conversation) so this file is just their shared breadcrumb/header shell.
// The "Not Clicked Task"/"Employees" preview section (EmployeeOverviewSection)
// briefly lived on this page too (2026-08-26) — pulled back out per explicit
// decision (see conversation): it's being placed somewhere else later, not
// here. This page is back to its original shape: stage cards, then directly
// the full Employee Records table. EmployeeOverviewSection/
// DashboardPreviewListCard/NoClaimIncentiveModal/getScopedNoClaimIncentiveList
// are all left in place, unused for now, for that later placement.
export default function EmployeeOverviewView({ rows, counts, userName, overdueTaskCounts, probationReminderNames }: Props) {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Employee Folder</span>
        </nav>

        <header className="mb-6">
          <p className="text-slate-500 dark:text-slate-400 text-lg">Welcome{userName ? `, ${userName}` : ","}</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Employee Overview
          </h1>
        </header>

        <EmployeeStageCards counts={counts} probationReminderNames={probationReminderNames} />
        <EmployeeRecordsTable rows={rows} overdueTaskCounts={overdueTaskCounts} />
      </div>
    </div>
  );
}
