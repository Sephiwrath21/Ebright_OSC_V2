"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Home, User } from "lucide-react";
import { EMPLOYEE_STAGES, type EmployeeStage } from "@/lib/employeeStages";
import type { EmployeeOverviewRow } from "@/lib/employeeQueries";
import { visibleSectionsForStage, applyFinanceRestriction } from "@/lib/employeeVisibleSections";
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
  /** CEO's own user_id (2026-08-28, see conversation) — only ever set for a
   *  CEO account (fresh DB lookup, not session.user.role — see
   *  employee-folder/page.tsx's own comment on why). Renders a "view my own
   *  profile" shortcut icon; null/undefined for every other role, since a
   *  plain staff login already redirects straight to their own record
   *  before this page ever renders, and every other role has no equivalent
   *  "jump to myself" need while browsing everyone else. */
  ceoOwnUserId?: number | null;
  /** Renders the "Own Department"/"Show All" toggle when true — only ever
   *  set for finance@ebright.my (2026-09-09, see conversation — new
   *  feature). Every other role gets undefined/false and this component
   *  behaves exactly as before: full rows, cards + table, no toggle. */
  isFinanceAccount?: boolean;
  /** Finance's own active employment's department_code, looked up
   *  server-side (Finance's row scope is fullAccess, so there's no
   *  scope.departmentCode to reuse — see employee-folder/page.tsx's own
   *  comment). Seeds the "Own Department" filter default. null if Finance's
   *  own account somehow has no active employment/department — the "Own
   *  Department" view then shows zero rows rather than guessing. */
  financeOwnDepartmentCode?: string | null;
}

// Finance-only row visibility for "Show All" mode (2026-09-09, see
// conversation) — only list employees Finance could actually open and see
// something for (Payroll/Tax Info, or Offboarding's Financial Settlement),
// not everyone company-wide. Pure and cheap: reuses the exact same
// visibleSectionsForStage/applyFinanceRestriction pair Phase 2 already
// built for the individual record page, applied to the row's own raw
// `stage` (not the override-adjusted "effective" stage the individual page
// separately computes — a close approximation, not exact, accepted per
// explicit decision since the individual page still enforces the real
// check regardless of what's listed here).
function financeCanSeeRow(row: EmployeeOverviewRow): boolean {
  const stageMap = visibleSectionsForStage(row.stage, row.resolvedPositionType === "Full Time");
  const restricted = applyFinanceRestriction(stageMap);
  return Object.keys(restricted).length > 0;
}

// Client-side stage counts for the summary cards, recomputed from whatever
// rows are actually visible (2026-09-09, see conversation) — needed because
// the server-computed `counts` prop is always company-wide for Finance
// (getEmployeeOverviewData() has no idea about this toggle), which would
// otherwise show a card total that doesn't match what the table below it
// actually lists. Same extraStages dual-listing rule
// EmployeeRecordsTable.tsx's own Status filter already uses, so a
// dual-listed row counts toward both its stages here too — same convention,
// not a new one. Approximate relative to the server's own countEmployeeStages
// (which additionally folds in some not-yet-portal-account candidates the
// row list itself doesn't carry) — acceptable for this secondary,
// Finance-only view; the primary company-wide cards (every other role) are
// untouched, still the exact server-computed counts.
function countVisibleStages(rows: EmployeeOverviewRow[]): Record<EmployeeStage, number> {
  const result = {} as Record<EmployeeStage, number>;
  for (const stage of EMPLOYEE_STAGES) {
    result[stage] = rows.filter((r) => r.stage === stage || r.extraStages?.includes(stage)).length;
  }
  return result;
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
export default function EmployeeOverviewView({
  rows,
  counts,
  userName,
  overdueTaskCounts,
  probationReminderNames,
  ceoOwnUserId,
  isFinanceAccount,
  financeOwnDepartmentCode,
}: Props) {
  // Defaults to "Own Department" — false (2026-09-09, see conversation —
  // explicit decision: Finance must actively switch to see company-wide
  // employees, not the other way around). Plain client state, no URL param
  // — this page has no existing URL-driven filter convention to extend
  // (EmployeeRecordsTable's own search/status/year/month/branch/department
  // filters are all local useState too), and this toggle only ever exists
  // for one specific account.
  const [showAll, setShowAll] = useState(false);

  // Only Finance's rows are ever narrowed here — every other role gets
  // `rows`/`counts` completely unchanged (isFinanceAccount is falsy, both
  // branches below short-circuit to the original values on their very
  // first check).
  const visibleRows = useMemo(() => {
    if (!isFinanceAccount) return rows;
    if (showAll) return rows.filter(financeCanSeeRow);
    return rows.filter((r) => r.departmentCode === financeOwnDepartmentCode);
  }, [rows, isFinanceAccount, showAll, financeOwnDepartmentCode]);

  // Recomputed from visibleRows whenever Finance's toggle actually narrows
  // the row set (both states, since "Own Department" is a new restriction
  // too, not just "Show All") — the company-wide server-provided `counts`
  // would otherwise mismatch the table below it. Every other role keeps the
  // exact original `counts` prop, untouched.
  const visibleCounts = useMemo(() => {
    if (!isFinanceAccount) return counts;
    return countVisibleStages(visibleRows);
  }, [isFinanceAccount, counts, visibleRows]);

  // "Show All" hides the stage cards entirely, matching the simplified
  // layout requested (search bar + table only) — per explicit decision,
  // the cards make less sense next to a filtered "only what I can actually
  // open" company-wide list than they do for a real department roster.
  const hideCards = Boolean(isFinanceAccount) && showAll;

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

          {ceoOwnUserId != null && (
            <Link
              href={`/employee-record/${ceoOwnUserId}`}
              title="View my own profile"
              aria-label="View my own profile"
              className="ml-auto flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <User className="w-4 h-4" aria-hidden="true" />
            </Link>
          )}
        </nav>

        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-lg">Welcome{userName ? `, ${userName}` : ","}</p>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Employee Overview
            </h1>
          </div>

          {/* Finance-only toggle (2026-09-09, see conversation) — same pill-
              capsule pattern already used elsewhere in this app (e.g.
              EmployeeNamelistView's List/Grid toggle) for visual
              consistency. Never rendered for any other role. */}
          {isFinanceAccount && (
            <div
              role="group"
              aria-label="Employee list scope"
              className="flex items-center gap-1 rounded-full bg-[#eef3fb] dark:bg-slate-800 p-1"
            >
              <button
                type="button"
                onClick={() => setShowAll(false)}
                aria-pressed={!showAll}
                className={`min-h-9 rounded-full px-4 text-sm font-medium transition-colors ${
                  !showAll
                    ? "bg-[#a9d3f7bd] dark:bg-slate-600 text-[#004386c9] dark:text-slate-100"
                    : "text-black/65 dark:text-slate-400 hover:bg-[#dde8f7] dark:hover:bg-slate-700"
                }`}
              >
                Own Department
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                aria-pressed={showAll}
                className={`min-h-9 rounded-full px-4 text-sm font-medium transition-colors ${
                  showAll
                    ? "bg-[#a9d3f7bd] dark:bg-slate-600 text-[#004386c9] dark:text-slate-100"
                    : "text-black/65 dark:text-slate-400 hover:bg-[#dde8f7] dark:hover:bg-slate-700"
                }`}
              >
                Show All
              </button>
            </div>
          )}
        </header>

        {!hideCards && <EmployeeStageCards counts={visibleCounts} probationReminderNames={probationReminderNames} />}
        <EmployeeRecordsTable rows={visibleRows} overdueTaskCounts={overdueTaskCounts} />
      </div>
    </div>
  );
}
