"use client";

import { useState } from "react";
import { STAGE_LABELS, type EmployeeStage } from "@/lib/employeeStages";
import type { EmployeeOverviewRow } from "@/lib/employeeQueries";
import type { NoClaimIncentivePayload } from "@/task-manager/ui/types";
import { NoClaimIncentiveModal } from "@/task-manager/ui/no-claim-incentive-modal";
import EmployeeStageCards from "@/app/components/EmployeeStageCards";
import EmployeeRecordsTable from "@/app/components/EmployeeRecordsTable";
import DashboardPreviewListCard from "@/app/components/DashboardPreviewListCard";

// Small colored-bullet treatment for the Employee Records preview rows' own
// stage indicator — a lighter-weight version of STAGE_PILL_CLASSES' full pill
// badge (that badge is sized for a table row, not a 3-row compact card).
const STAGE_DOT_TEXT_CLASS: Record<EmployeeStage, string> = {
  pre: "text-purple-600 dark:text-purple-300",
  probation: "text-blue-600 dark:text-blue-300",
  onboarding: "text-emerald-600 dark:text-emerald-300",
  active: "text-lime-700 dark:text-lime-400",
  exit: "text-red-600 dark:text-red-300",
};

const NOT_CLICKED_ACCENT = "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200";
const EMPLOYEE_RECORDS_ACCENT = "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";

interface NotClickedPreviewPerson {
  userId: string;
  name: string;
  groupName: string;
  openCount: number;
}

interface Props {
  counts: Record<EmployeeStage, number>;
  probationReminderNames?: { name: string; endDate: string }[];
  /** Already scope-filtered — see getEmployeeOverviewData() — reused as-is
   *  for both the Employee Records preview (first 3) and the full modal. */
  employeeRows: EmployeeOverviewRow[];
  overdueTaskCounts?: Record<number, number>;
  /** First 3 people (across every group) from the same scope-filtered "No
   *  Claim/Incentive" payload the modal below fetches fresh — see
   *  getScopedNoClaimIncentiveList. */
  notClickedPreview: NotClickedPreviewPerson[];
  /** Total people count across every group in that same payload (2026-08-26,
   *  see conversation) — shown on the card's own badge instead of just the
   *  preview length, which is capped at 3. */
  notClickedTotal: number;
  /** Server action — scoped per getScopedNoClaimIncentiveList, NOT the
   *  CEO/Finance-gated getNoClaimIncentiveList the Task Manager page's own
   *  ⋮ menu uses. */
  notClickedFetchList: (month: string) => Promise<NoClaimIncentivePayload>;
  /** Set from the viewer's own scope (department/branch NAME, read off
   *  employeeRows itself) when not full-access — locks the Employee Records
   *  modal's advanced filters to match. Both omitted for full-access
   *  viewers, same unrestricted behavior as /employee-folder. */
  lockedBranch?: string;
  lockedDepartment?: string;
}

// The /home dashboard's new "Employee Overview" section (2026-08-26, see
// conversation) — the same 5 stage cards as /employee-folder (via the shared
// EmployeeStageCards component) plus two new compact preview cards, each
// opening a modal with the full existing view instead of navigating away.
// Hidden entirely for ownUserId-scoped (plain staff) viewers — the caller
// (src/app/home/page.tsx) doesn't render this component at all in that case,
// rather than this component deciding it internally.
export default function EmployeeOverviewSection({
  counts,
  probationReminderNames,
  employeeRows,
  overdueTaskCounts,
  notClickedPreview,
  notClickedTotal,
  notClickedFetchList,
  lockedBranch,
  lockedDepartment,
}: Props) {
  const [notClickedOpen, setNotClickedOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);

  const recordsPreview = employeeRows.slice(0, 3);
  const scopeLabel = lockedDepartment ?? lockedBranch;

  return (
    <div className="mb-8">
      <EmployeeStageCards counts={counts} probationReminderNames={probationReminderNames} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardPreviewListCard
          title="Not Clicked Task"
          badgeText={`${notClickedTotal} total`}
          accentClass={NOT_CLICKED_ACCENT}
          rows={notClickedPreview.map((p) => ({
            id: p.userId,
            name: p.name,
            subLabel: p.groupName,
            trailing: (
              <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                {p.openCount} pending/overdue
              </span>
            ),
          }))}
          emptyText="Everyone has clicked their task."
          viewAllLabel="View all"
          onViewAll={() => setNotClickedOpen(true)}
        />

        <DashboardPreviewListCard
          title="Employees"
          badgeText={`${recordsPreview.length} shown`}
          accentClass={EMPLOYEE_RECORDS_ACCENT}
          rows={recordsPreview.map((r) => ({
            id: r.id,
            name: r.fullName,
            subLabel: r.departmentName ?? r.branchName ?? "—",
            trailing: (
              <span className={`shrink-0 text-xs font-medium ${STAGE_DOT_TEXT_CLASS[r.stage]}`}>
                • {STAGE_LABELS[r.stage]}
              </span>
            ),
          }))}
          emptyText="No employees in view."
          viewAllLabel="View all employees"
          onViewAll={() => setRecordsOpen(true)}
        />
      </div>

      <NoClaimIncentiveModal
        open={notClickedOpen}
        onClose={() => setNotClickedOpen(false)}
        fetchList={notClickedFetchList}
        title="Not Clicked Task"
        description="Everyone with pending or overdue tasks due that day, by Department/Branch."
        granularity="day"
      />

      {recordsOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRecordsOpen(false);
          }}
        >
          <div className="relative flex w-full max-w-5xl max-h-[calc(100vh-32px)] flex-col box-border bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-2xl shadow-[0_12px_32px_0_#00000026] overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4">
              <h3 className="text-lg font-semibold text-[#4b4949d6] dark:text-slate-100">
                Employee Records{scopeLabel ? ` · ${scopeLabel}` : ""}
              </h3>
              <button
                type="button"
                onClick={() => setRecordsOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[#4b4949a3] hover:bg-[#f0f4fa] hover:text-[#4b4949] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 sm:px-7 pb-6">
              <EmployeeRecordsTable
                rows={employeeRows}
                overdueTaskCounts={overdueTaskCounts}
                lockedBranch={lockedBranch}
                lockedDepartment={lockedDepartment}
                hideHeading
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
