"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Home, Search } from "lucide-react";
import { EMPLOYEE_STAGES, STAGE_LABELS, STAGE_PILL_CLASSES, type EmployeeStage } from "@/lib/employeeStages";
import type { EmployeeOverviewRow } from "@/lib/employeeQueries";
import { deleteEmployeeRecord } from "@/lib/employeeRecordActions";
import RowActionMenu from "@/app/components/RowActionMenu";
import Pagination from "@/app/components/Pagination";
import { SortableDateHeader, nextDateSortState, applyDateSort, type DateSortState } from "@/app/components/SortableHeader";
import OverdueDot from "@/app/components/OverdueDot";

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
   *  conversation) — not merged into one sentence. */
  probationReminderNames?: string[];
}

export default function EmployeeOverviewView({ rows, counts, userName, overdueTaskCounts, probationReminderNames }: Props) {
  const router = useRouter();
  // Independent from the summary blocks above — those are navigation links
  // into a stage's Branch/Department drill-down, not a filter for this table.
  //
  // Draft vs applied, per explicit decision (see conversation): every field
  // (search/status/year/month) only updates its own draft state as the user
  // types/selects — none of them touch the table until Search is clicked or
  // Enter is pressed in the search box (applyFilters below copies every
  // draft into its applied counterpart in one go, so all 4 fields commit
  // together, never some live and some not). `filtered` below reads only
  // the applied state, never the drafts.
  const [statusFilterDraft, setStatusFilterDraft] = useState<EmployeeStage | "">("");
  const [searchDraft, setSearchDraft] = useState("");
  const [yearDraft, setYearDraft] = useState("");
  const [monthDraft, setMonthDraft] = useState("");

  const [statusFilter, setStatusFilter] = useState<EmployeeStage | "">("");
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [dateSort, setDateSort] = useState<DateSortState>("default");

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.date?.slice(0, 4)).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      // A row can genuinely belong to more than one stage at once (see
      // extraStages — e.g. a real Probation-stage Full-Time row whose
      // pipeline also qualifies it for Onboarding), shown as one row with
      // multiple badges rather than duplicated — so the Status filter must
      // match on either, not just the row's own primary stage.
      if (statusFilter && r.stage !== statusFilter && !r.extraStages?.includes(statusFilter)) return false;
      if (q && !r.fullName.toLowerCase().includes(q)) return false;
      if (year && r.date?.slice(0, 4) !== year) return false;
      if (month && r.date?.slice(5, 7) !== month) return false;
      return true;
    });
    return applyDateSort(result, dateSort, (r) => r.date, Boolean(year) || Boolean(month));
  }, [rows, statusFilter, search, year, month, dateSort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function applyFilters() {
    setStatusFilter(statusFilterDraft);
    setSearch(searchDraft);
    setYear(yearDraft);
    setMonth(monthDraft);
    setPage(1);
  }

  function resetFilters() {
    setStatusFilterDraft("");
    setSearchDraft("");
    setYearDraft("");
    setMonthDraft("");
    setStatusFilter("");
    setSearch("");
    setYear("");
    setMonth("");
    setPage(1);
  }

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

        <section aria-labelledby="employees-summary-heading" className="mb-8">
          <h2 id="employees-summary-heading" className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
            Employees
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {EMPLOYEE_STAGES.map((stage) => (
              <Link
                key={stage}
                href={`/employee-folder/${stage}`}
                className="relative text-left bg-white dark:bg-slate-900 rounded-[27px] border-2 border-slate-200 dark:border-slate-800 p-5 min-h-[143px] flex flex-col justify-end gap-2.5 transition-all hover:border-slate-400 hover:shadow-md"
              >
                <span className="self-start flex items-center gap-1.5">
                  <span className={`inline-block px-3.5 py-1 rounded-full text-[13px] font-medium ${STAGE_PILL_CLASSES[stage]}`}>
                    {STAGE_LABELS[stage]}
                  </span>
                  {stage === "probation" && probationReminderNames && probationReminderNames.length > 0 && (
                    <OverdueDot
                      count={probationReminderNames.length}
                      label={probationReminderNames.map((name) => `${name}还有三天就结束probation`).join("\n")}
                    />
                  )}
                </span>
                <span className="text-4xl font-medium text-slate-900/70 dark:text-slate-100/70">{counts[stage]}</span>
                <ChevronRight className="absolute top-3.5 right-4 w-5 h-5 text-slate-400" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="employees-list-heading">
          <h2 id="employees-list-heading" className="text-lg font-semibold text-slate-600 dark:text-slate-300 mb-4">
            Employee Records
          </h2>

          {/* Below sm: exactly 2 rows — search+status on row 1, year+month+
              Search+Reset on row 2 (each row its own flex-nowrap group, sized
              so neither needs to wrap or scroll down to 375px). sm:contents
              on each row wrapper removes it from the layout at sm+ (a wrapper
              with no padding/background of its own to lose), so every child
              rejoins the single flex-wrap row that was already here —
              desktop is byte-for-byte unchanged. */}
          <div
            className="flex flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 bg-white dark:bg-slate-900 rounded-[12px] shadow-[0_2px_6px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.10)] p-4 sm:p-5 mb-6"
            style={{ border: "0.5px solid var(--border-neutral)" }}
          >
            <div className="flex flex-nowrap items-center gap-2 sm:contents">
              <div className="relative flex-1 min-w-0 sm:flex-1 sm:min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyFilters();
                    }
                  }}
                  className="w-full h-11 pl-9 pr-3 rounded-lg border-2 border-slate-200 dark:border-slate-500 dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-100 truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <select
                value={statusFilterDraft}
                onChange={(e) => setStatusFilterDraft(e.target.value as EmployeeStage | "")}
                className="shrink-0 w-[100px] sm:w-auto h-11 px-2 sm:px-3 rounded-lg border-2 border-slate-200 dark:border-slate-500 dark:bg-slate-950 text-xs sm:text-sm text-slate-700 dark:text-slate-100 truncate sm:min-w-[120px]"
              >
                <option value="">status</option>
                {EMPLOYEE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-nowrap items-center gap-2 sm:contents">
              <select
                value={yearDraft}
                onChange={(e) => setYearDraft(e.target.value)}
                className="shrink-0 w-[68px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-slate-200 dark:border-slate-500 dark:bg-slate-950 text-xs sm:text-sm text-slate-700 dark:text-slate-100 truncate sm:min-w-[110px]"
              >
                <option value="">year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                value={monthDraft}
                onChange={(e) => setMonthDraft(e.target.value)}
                className="shrink-0 w-[74px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-slate-200 dark:border-slate-500 dark:bg-slate-950 text-xs sm:text-sm text-slate-700 dark:text-slate-100 truncate sm:min-w-[130px]"
              >
                <option value="">month</option>
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={applyFilters}
                className="shrink-0 h-11 px-3 sm:px-6 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-semibold text-xs sm:text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
              >
                Search
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="shrink-0 h-11 px-3 sm:px-4 rounded-lg border-2 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-medium text-xs sm:text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Horizontal scroll below the min-width preserves the full column
              structure on mobile instead of squishing it — the whole table,
              including Name, swipes left/right together as one unit
              (deliberately no sticky column). */}
          <div
            className="bg-white dark:bg-slate-900 rounded-[12px] shadow-[0_2px_6px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.10)] overflow-x-auto"
            style={{ border: "0.5px solid var(--border-neutral)" }}
          >
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 bg-[#a4e2f480] dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-slate-100">
                <span>Name</span>
                <span>Branch/ Department</span>
                <SortableDateHeader state={dateSort} onToggle={() => setDateSort(nextDateSortState)} />
                <span>Status</span>
                <span />
              </div>

              {pageRows.length === 0 ? (
                <div className="px-8 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No employees match these filters.</div>
              ) : (
                pageRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 items-center border-b border-black/10 dark:border-white/10 last:border-b-0"
                  >
                    <Link href={`/employee-record/${row.id}`} className="flex items-center gap-1.5 min-w-0">
                      <span className="text-lg font-medium text-slate-900 dark:text-slate-100 hover:underline min-w-0 truncate">{row.fullName}</span>
                      <OverdueDot count={overdueTaskCounts?.[row.id]} />
                    </Link>
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
                      {row.departmentName ?? row.branchName ?? "—"}
                    </span>
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{row.date ?? "—"}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[row.stage]}`}>
                        {STAGE_LABELS[row.stage]}
                      </span>
                      {row.extraStages?.map((s) => (
                        <span key={s} className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[s]}`}>
                          {STAGE_LABELS[s]}
                        </span>
                      ))}
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
                  </div>
                ))
              )}
            </div>
          </div>

          {filtered.length > 0 && (
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
        </section>
      </div>
    </div>
  );
}

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];
