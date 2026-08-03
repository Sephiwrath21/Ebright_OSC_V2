"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Home, Search } from "lucide-react";
import { positionGroup, POSITION_GROUPS, type PositionGroup } from "@/lib/employeeStages";
import RowActionMenu from "@/app/components/RowActionMenu";
import Pagination from "@/app/components/Pagination";
import { SortableDateHeader, nextDateSortState, applyDateSort, type DateSortState } from "@/app/components/SortableHeader";
import type { BranchOpt, DepartmentOpt, EmployeeOverviewRow } from "@/lib/employeeQueries";

// Keyed by resignation.exit_type's exact stored value (same 4 options the
// Resignation tab's own Exit Type dropdown offers) — the badge shown here is
// literally whatever was saved on that profile page, not a separate signal.
const EXIT_TYPE_META: Record<string, { label: string; classes: string }> = {
  Resignation: { label: "Resignation", classes: "bg-[#90aeee7d] text-[#390ff2]" },
  "End of Contract": { label: "End of Contract", classes: "bg-[#67eab37d] text-[#307348]" },
  "Internship Completed": { label: "Internship Completed", classes: "bg-[#d8a1fa7d] text-[#621096]" },
  "Termination/Dismissal": { label: "Termination/Dismissal", classes: "bg-[#f38e8e6b] text-[#961010]" },
};

const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" }, { value: "03", label: "March" },
  { value: "04", label: "April" }, { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" }, { value: "09", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

interface LocationContext {
  groupBy: "branch" | "department";
  code: string;
  name: string;
}

interface Props {
  rows: EmployeeOverviewRow[];
  exitTypeByUserId?: Record<number, string>;
  /** resignation.last_working_date per user — the "Last Date" column's
   *  primary source. Falls back to the row's own `date` (employment.end_date)
   *  for exits with no resignation row, e.g. end-of-contract. */
  lastWorkingDateByUserId?: Record<number, string>;
  /** Only true for HR/Superadmin's combined, all-locations Exit list — adds
   *  the Branch/Department column + filter dropdown. A department/branch-
   *  scoped account's own list omits both, since every row would repeat the
   *  exact same value. */
  showLocation: boolean;
  /** Full canonical branch/department lists (not just the ones present among
   *  `rows`) — the filter dropdowns should offer every real branch/department
   *  so a location with zero current exits is still selectable. Only needed
   *  (and only passed) when showLocation is true. */
  branches?: BranchOpt[];
  departments?: DepartmentOpt[];
  /** A scoped account's own department/branch — drives the breadcrumb's
   *  trailing segment and each profile link's locGroup/locCode query, same as
   *  EmployeeNamelistView. Omitted entirely for the combined, all-locations
   *  view (no single location to attribute the visit to). */
  locationContext?: LocationContext;
}

// List-only Exit namelist — Exit has no Block/Grid view (unlike Active/
// Onboarding's EmployeeNamelistView): the reference has no card layout for
// Exit, and HR/Superadmin's combined cross-location list wouldn't group
// sensibly into the Full Time/Part Time/Intern card sections anyway.
export default function ExitListView({
  rows,
  exitTypeByUserId,
  lastWorkingDateByUserId,
  showLocation,
  branches = [],
  departments = [],
  locationContext,
}: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PositionGroup | "">("");
  const [branchFilter, setBranchFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [exitTypeFilter, setExitTypeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dateSort, setDateSort] = useState<DateSortState>("default");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const profileQuery = locationContext
    ? `?locGroup=${locationContext.groupBy}&locCode=${encodeURIComponent(locationContext.code)}`
    : "";
  // Branch-reached namelists label Intern people "Protege" (js/position-
  // options.js) — same underlying INTERN position either way. The combined
  // cross-location view has no single groupBy to key off, so it just says
  // "Intern".
  const thirdGroupLabel = locationContext?.groupBy === "branch" ? "Protege" : "Intern";

  // Full canonical lists, not just what's present among today's exit rows —
  // every real branch/department should be selectable even with zero current
  // exits there. CEO is included in Department (explicit reversal of an
  // earlier HR-driven exclusion).
  const branchOptions = useMemo(() => branches.map((b) => b.name).sort((a, b) => a.localeCompare(b)), [branches]);
  const departmentOptions = useMemo(
    () => departments.map((d) => d.name).sort((a, b) => a.localeCompare(b)),
    [departments],
  );
  const years = useMemo(
    () => Array.from(new Set(rows.map((r) => r.date?.slice(0, 4)).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (q && !r.fullName.toLowerCase().includes(q) && !(r.position ?? "").toLowerCase().includes(q)) return false;
      if (typeFilter && positionGroup(r.position) !== typeFilter) return false;
      if (showLocation && branchFilter && r.branchName !== branchFilter) return false;
      if (showLocation && departmentFilter && r.departmentName !== departmentFilter) return false;
      if (exitTypeFilter && exitTypeByUserId?.[r.id] !== exitTypeFilter) return false;
      if (yearFilter && r.date?.slice(0, 4) !== yearFilter) return false;
      if (monthFilter && r.date?.slice(5, 7) !== monthFilter) return false;
      return true;
    });
    // Sorts by the column's actual displayed value — resignation.
    // last_working_date when known, else the row's own date (employment.end_date).
    // Default is nearest-first (most recent Last Date on top) rather than the
    // month-grouped default used elsewhere — Exit dates are overwhelmingly in
    // the past, so "current month onward" grouping isn't meaningful here.
    return applyDateSort(
      result,
      dateSort,
      (r) => lastWorkingDateByUserId?.[r.id] ?? r.date,
      Boolean(yearFilter) || Boolean(monthFilter),
      "nearest-first",
    );
  }, [
    rows,
    search,
    typeFilter,
    showLocation,
    branchFilter,
    departmentFilter,
    exitTypeFilter,
    yearFilter,
    monthFilter,
    exitTypeByUserId,
    dateSort,
    lastWorkingDateByUserId,
  ]);

  function resetFilters() {
    setSearch("");
    setTypeFilter("");
    setBranchFilter("");
    setDepartmentFilter("");
    setExitTypeFilter("");
    setYearFilter("");
    setMonthFilter("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visible = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const gridColsClass = showLocation
    ? "grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(150px,1fr)_60px]"
    : "grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(150px,1fr)_60px]";

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-10">
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
          {locationContext ? (
            <>
              <Link href={`/employee-folder/exit?by=${locationContext.groupBy}`} className="hover:text-slate-900 transition-colors">
                Exit
              </Link>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span className="text-slate-900 font-medium">{locationContext.name}</span>
            </>
          ) : (
            <span className="text-slate-900 font-medium">Exit</span>
          )}
        </nav>

        <div className="bg-white rounded-[20px] p-5 mb-3">
          <h2 className="text-base font-medium text-black/77 mb-3">Search Filter</h2>

          {/* Main row — always visible: Name search, Position, and (only for
              the combined cross-location view) separate Branch/Department
              dropdowns, since a scoped account's own list has just one of
              each already. Single row down to 375px: search shrinks
              proportionally (flex-1, min-w-0), the selects are shrink-0 with
              narrow fixed widths/padding on mobile, and overflow-x-auto is
              the fallback if the combined (up to 4-select) view still
              doesn't fit. sm+ reverts to the original flex-wrap layout and
              desktop sizing unchanged. */}
          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 sm:gap-4 overflow-x-auto sm:overflow-visible">
            <div className="relative flex-1 min-w-[90px] sm:min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="search by name"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full h-11 pl-9 pr-3 rounded-lg border-2 border-black/25 text-sm text-black/67 truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as PositionGroup | "");
                setPage(1);
              }}
              className="shrink-0 w-[92px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-black/25 text-xs sm:text-sm text-black/67 truncate sm:min-w-[130px]"
            >
              <option value="">All positions</option>
              {POSITION_GROUPS.map((g) => (
                <option key={g} value={g}>{g === "Intern" ? thirdGroupLabel : g}</option>
              ))}
            </select>
            {showLocation && (
              <>
                <select
                  value={branchFilter}
                  onChange={(e) => {
                    setBranchFilter(e.target.value);
                    setPage(1);
                  }}
                  className="shrink-0 w-[96px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-black/25 text-xs sm:text-sm text-black/67 truncate sm:min-w-[140px]"
                >
                  <option value="">All branches</option>
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <select
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value);
                    setPage(1);
                  }}
                  className="shrink-0 w-[104px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-black/25 text-xs sm:text-sm text-black/67 truncate sm:min-w-[160px]"
                >
                  <option value="">All departments</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Advanced filters — collapsible, holds the less-frequently-used
              Exit Type/Month/Year filters out of the main row. */}
          {advancedOpen && (
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <select
                value={exitTypeFilter}
                onChange={(e) => {
                  setExitTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="h-11 px-3 rounded-lg border-2 border-black/25 text-sm text-black/67 min-w-[150px]"
              >
                <option value="">All exit types</option>
                {Object.entries(EXIT_TYPE_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
              <select
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value);
                  setPage(1);
                }}
                className="h-11 px-3 rounded-lg border-2 border-black/25 text-sm text-black/67 min-w-[130px]"
              >
                <option value="">month</option>
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value);
                  setPage(1);
                }}
                className="h-11 px-3 rounded-lg border-2 border-black/25 text-sm text-black/67 min-w-[110px]"
              >
                <option value="">year</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#004386c9] hover:underline"
            >
              {advancedOpen ? "hide advanced filters" : "advanced filters"}
              <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="h-11 px-4 rounded-lg border-2 border-[#8ac4f3bd] text-sm font-medium text-[#004386c9] hover:bg-[#8ac4f320]"
              >
                Reset
              </button>
              <button
                type="button"
                className="h-11 px-6 rounded-lg bg-[#8ac4f3bd] text-sm font-bold text-[#004386c9] hover:bg-[#8ac4f3]"
              >
                search
              </button>
            </div>
          </div>
        </div>

        <h1 className="text-xl font-medium text-black mb-4">Exit</h1>

        {/* Widest table in Employee Folder (up to 6 columns) — horizontal
            scroll below each column's own minmax() floor keeps every column
            reachable by swipe on mobile. The whole table (including Name)
            scrolls together as one unit — deliberately no sticky column. */}
        <div className="bg-white rounded-[20px] overflow-x-auto">
          <div className={`grid ${gridColsClass} gap-4 px-8 py-4 bg-[#a4e2f480] text-[15px] font-medium text-black`}>
            <span>Name</span>
            <SortableDateHeader state={dateSort} onToggle={() => setDateSort(nextDateSortState)} label="Last Date" />
            <span>Position</span>
            {showLocation && <span>Branch/Department</span>}
            <span>Exit Type</span>
            <span />
          </div>

          {visible.length === 0 ? (
            <div className="px-8 py-10 text-center text-sm text-slate-500">No employees match these filters.</div>
          ) : (
            visible.map((row) => {
              const exitType = exitTypeByUserId?.[row.id];
              return (
                <div
                  key={row.id}
                  className={`grid ${gridColsClass} gap-4 px-8 h-14 items-center border-b border-black/10 last:border-b-0`}
                >
                  <Link
                    href={`/employee-folder/exit/employee/${row.id}${profileQuery}`}
                    className="text-base font-medium text-black hover:underline truncate min-w-0"
                  >
                    {row.fullName}
                  </Link>
                  <span className="text-[15px] text-black/67 truncate">
                    {lastWorkingDateByUserId?.[row.id] ?? row.date ?? "—"}
                  </span>
                  <span className="text-[15px] text-black/67 truncate">{row.position ?? "—"}</span>
                  {showLocation && (
                    <span className="text-[15px] text-black/67 truncate">
                      {row.departmentName ?? row.branchName ?? "—"}
                    </span>
                  )}
                  <span>
                    {exitType ? (
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${EXIT_TYPE_META[exitType]?.classes ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {EXIT_TYPE_META[exitType]?.label ?? exitType}
                      </span>
                    ) : (
                      "—"
                    )}
                  </span>
                  <div className="flex justify-center">
                    <RowActionMenu name={row.fullName} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {filteredRows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={[15, 50, 100]}
            totalCount={filteredRows.length}
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
