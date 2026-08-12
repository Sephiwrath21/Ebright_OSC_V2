"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Home, Search } from "lucide-react";
import { STAGE_LABELS, STAGE_PILL_CLASSES, type EmployeeStage } from "@/lib/employeeStages";
import type { BranchOpt, DepartmentOpt, EmployeeOverviewRow } from "@/lib/employeeQueries";
import { deleteEmployeeRecord } from "@/lib/employeeRecordActions";
import Pagination from "@/app/components/Pagination";
import RowActionMenu from "@/app/components/RowActionMenu";
import { SortableDateHeader, nextDateSortState, applyDateSort, type DateSortState } from "@/app/components/SortableHeader";
import AddPreStageEmployeeModal from "@/app/components/AddPreStageEmployeeModal";
import OverdueDot from "@/app/components/OverdueDot";

const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" }, { value: "03", label: "March" },
  { value: "04", label: "April" }, { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" }, { value: "09", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

interface Props {
  stage: EmployeeStage;
  rows: EmployeeOverviewRow[];
  /** Only passed (and only rendered) for stage === "pre" — the "+ Add"
   *  button that creates a real employee (users/user_profile/employment). */
  branches?: BranchOpt[];
  departments?: DepartmentOpt[];
}

// Reference (pre.html / probation.html): a flat table, no Branch/Department
// drill-down — each row links straight into that stage's profile.
export default function StageFlatListView({ stage, rows, branches, departments }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [dateSort, setDateSort] = useState<DateSortState>("default");
  // Pre only — same shared Pagination control the Employee Records table
  // uses, added to the bottom of the name list per explicit request.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.date?.slice(0, 4)).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (q && !r.fullName.toLowerCase().includes(q)) return false;
      if (year && r.date?.slice(0, 4) !== year) return false;
      if (month && r.date?.slice(5, 7) !== month) return false;
      return true;
    });
    return applyDateSort(
      result,
      dateSort,
      (r) => r.date,
      Boolean(year) || Boolean(month),
      stage === "pre" ? "ascending" : "month-grouped",
    );
  }, [rows, search, year, month, dateSort, stage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = stage === "pre" ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/employee-folder" className="hover:text-slate-900 transition-colors">
            Employee Overview
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">{STAGE_LABELS[stage]}</span>
        </nav>

        {/* Single row down to 375px — search takes the remaining space
            (flex-1, min-w-0), year/month are shrink-0 with narrow fixed
            widths/padding on mobile, and overflow-x-auto is the fallback if
            it still doesn't fit (e.g. Pre's extra "+ Add" button). sm+
            reverts to the original flex-wrap layout and desktop sizing. */}
        <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 sm:gap-4 overflow-x-auto sm:overflow-visible bg-white rounded-2xl p-4 sm:p-5 mb-6">
          <div className="relative flex-1 min-w-[90px] sm:min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full h-11 pl-9 pr-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="shrink-0 w-[68px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-slate-200 text-xs sm:text-sm text-slate-700 truncate sm:min-w-[110px]"
          >
            <option value="">year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="shrink-0 w-[74px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-slate-200 text-xs sm:text-sm text-slate-700 truncate sm:min-w-[130px]"
          >
            <option value="">month</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {stage === "pre" && (
            <div className="shrink-0">
              <AddPreStageEmployeeModal branches={branches ?? []} departments={departments ?? []} />
            </div>
          )}
        </div>

        {/* Table scrolls horizontally as a unit below the min-width — the grid
            template can't be squeezed narrower than that, so on mobile the
            whole table (every column, including Name) swipes left/right
            together as one block instead of squishing into illegible
            slivers. Deliberately no sticky column — the whole row scrolls as
            a unit, per explicit request. */}
        <div className="bg-white rounded-[27px] overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 bg-[#a4e2f480] text-sm font-medium text-slate-900">
              <span>Name</span>
              <span>Branch/ Department</span>
              <SortableDateHeader state={dateSort} onToggle={() => setDateSort(nextDateSortState)} label={stage === "pre" ? "Start Date" : "Date"} />
              <span>{stage === "pre" ? "Position" : "Status"}</span>
              <span />
            </div>

            {visible.length === 0 ? (
              <div className="px-8 py-10 text-center text-sm text-slate-500">No employees match these filters.</div>
            ) : (
              visible.map((row) => (
                <Link
                  key={row.id}
                  href={`/employee-folder/${stage}/employee/${row.id}`}
                  className="relative grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 items-center border-b border-black/10 last:border-b-0 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-lg font-medium text-slate-900 hover:underline min-w-0 truncate">{row.fullName}</span>
                  <span className="text-sm font-medium text-slate-600 truncate">{row.departmentName ?? row.branchName ?? "—"}</span>
                  <span className="text-sm font-medium text-slate-600">{row.date ?? "—"}</span>
                  <span className="flex items-center gap-2">
                    {stage === "pre" ? (
                      row.resolvedPositionType ? (
                        <span
                          className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${
                            row.positionDiscrepancy ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-purple-700"
                          }`}
                          title={row.positionDiscrepancyDetail ?? undefined}
                        >
                          {row.resolvedPositionType}
                          {row.positionDiscrepancy ? " ⚠" : ""}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">—</span>
                      )
                    ) : row.probationStopped ? (
                      // Exception to the "always this page's own stage
                      // label" rule below — a Stopped decision (see
                      // computeStoppedProbationIds) is worth surfacing here
                      // even though the row stays on this Probation list;
                      // unlike the stage-label case, showing "Stop" isn't a
                      // contradiction, it's the one piece of row-specific
                      // status that's actually useful at a glance.
                      <span className="inline-block px-4 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                        Stop
                      </span>
                    ) : (
                      // Always this page's own stage label, deliberately NOT
                      // row.stage — for Full-Time employees, Probation and
                      // Onboarding run CONCURRENTLY (same person, both true
                      // at once) until probation is formally confirmed and
                      // they move to Active, so a dual-listed row's "real"
                      // stage elsewhere isn't a more correct answer here, just
                      // a different, equally-true one; showing it would read
                      // as a contradiction rather than information.
                      <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[stage]}`}>
                        {STAGE_LABELS[stage]}
                      </span>
                    )}
                    {row.readyForRealAccount && (
                      // Candidate-only (see computePreStartDatePassedRows) —
                      // signals HR that this person has crossed the
                      // threshold (3 days since start for Part Timer/Intern,
                      // status2/feedback2 confirmed for Full Time) and is
                      // ready for a real portal account to be created, without
                      // changing the stage label itself (they're still
                      // genuinely Onboarding/Probation until that happens).
                      <OverdueDot count={1} label="Ready — create their real account to move them to Active" />
                    )}
                  </span>
                  <div className="flex justify-center">
                    <RowActionMenu
                      name={row.fullName}
                      onDelete={async () => {
                        const result = await deleteEmployeeRecord(row.id);
                        if (result.ok) router.refresh();
                        return result;
                      }}
                    />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {stage === "pre" && filtered.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={[15, 50, 100]}
            totalCount={filtered.length}
            totalLabel="employees"
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            className="mt-4"
          />
        )}
      </div>
    </div>
  );
}
