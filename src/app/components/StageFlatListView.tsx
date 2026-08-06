"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Home, Search } from "lucide-react";
import { STAGE_LABELS, STAGE_PILL_CLASSES, type EmployeeStage } from "@/lib/employeeStages";
import type { BranchOpt, DepartmentOpt, EmployeeOverviewRow } from "@/lib/employeeQueries";
import { deletePreStageEmployee } from "@/lib/employeeRecordActions";
import { BOARD_STAGE_TO_OUR_STAGE } from "@/lib/boardStageMapping";
import Pagination from "@/app/components/Pagination";
import RowActionMenu from "@/app/components/RowActionMenu";
import { SortableDateHeader, nextDateSortState, applyDateSort, type DateSortState } from "@/app/components/SortableHeader";
import AddPreStageEmployeeModal from "@/app/components/AddPreStageEmployeeModal";

// Pre stage's Status column color-coding, keyed off the live board_stage
// text from career_applications — case-insensitive substring match since the
// real data isn't perfectly consistent (e.g. both "Rejected" and
// "Rejected (RJT)" show up as distinct raw values). "Interviewed" is matched
// specifically (not just "interview") so it doesn't also catch
// "Interview Date (ID)", a different stage the spec didn't call out.
function boardStagePillClass(boardStage: string): string {
  const v = boardStage.toLowerCase();
  if (v.includes("reject")) return "bg-red-100 text-red-700";
  if (v.includes("agreement")) return "bg-green-100 text-green-700";
  if (v.includes("interviewed")) return "bg-orange-100 text-orange-700";
  if (v.includes("buffer resume") || v.includes("health declaration")) return "bg-pink-100 text-pink-700";
  return "bg-purple-100 text-purple-700";
}

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

// Status filter's sentinel for "has no board_stage at all" — distinct from
// "" (the "All" option's value), since both need to be independently
// selectable.
const NO_STATUS_VALUE = "__none__";

// Reference (pre.html / probation.html): a flat table, no Branch/Department
// drill-down — each row links straight into that stage's profile.
export default function StageFlatListView({ stage, rows, branches, departments }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [dateSort, setDateSort] = useState<DateSortState>("default");
  // Pre only — same shared Pagination control the Employee Records table
  // uses, added to the bottom of the name list per explicit request.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.date?.slice(0, 4)).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  // Pre's Status filter options — distinct board_stage values actually
  // present on the current Pre rows, excluding anything that's a key in
  // BOARD_STAGE_TO_OUR_STAGE (Trial, Training Day 1/2/3, Probation): those
  // all resolve to Onboarding per the sync's routing, so they're not
  // meaningful filter targets for people who are staying in Pre.
  const statusOptions = useMemo(() => {
    if (stage !== "pre") return [];
    const excluded = new Set(Object.keys(BOARD_STAGE_TO_OUR_STAGE).map((s) => s.toLowerCase()));
    const set = new Set(
      rows
        .map((r) => r.boardStage)
        .filter((v): v is string => Boolean(v) && !excluded.has((v as string).toLowerCase())),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, stage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (q && !r.fullName.toLowerCase().includes(q)) return false;
      if (stage === "pre") {
        if (status === NO_STATUS_VALUE && r.boardStage) return false;
        if (status && status !== NO_STATUS_VALUE && r.boardStage !== status) return false;
      } else {
        if (year && r.date?.slice(0, 4) !== year) return false;
        if (month && r.date?.slice(5, 7) !== month) return false;
      }
      return true;
    });
    return applyDateSort(
      result,
      dateSort,
      (r) => r.date,
      Boolean(year) || Boolean(month),
      stage === "pre" ? "ascending" : "month-grouped",
    );
  }, [rows, search, year, month, status, dateSort, stage]);

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
          {stage === "pre" ? (
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="shrink-0 w-[110px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-slate-200 text-xs sm:text-sm text-slate-700 truncate sm:min-w-[160px]"
            >
              <option value="">All statuses</option>
              <option value={NO_STATUS_VALUE}>No status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <>
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
            </>
          )}
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
            {/* Pre drops the Date column — Status shows the live
                career_applications board_stage instead of a fixed "Pre"
                pill, so the date column would be redundant with nothing to
                sort by that's actually shown. Every other stage (Probation)
                keeps the original 5-column layout unchanged. */}
            <div className={`grid ${stage === "pre" ? "grid-cols-[2fr_1fr_1fr_60px]" : "grid-cols-[2fr_1fr_1fr_1fr_60px]"} gap-4 px-8 py-4 bg-[#a4e2f480] text-sm font-medium text-slate-900`}>
              <span>Name</span>
              <span>Branch/ Department</span>
              {stage !== "pre" && <SortableDateHeader state={dateSort} onToggle={() => setDateSort(nextDateSortState)} />}
              <span>Status</span>
              <span />
            </div>

            {visible.length === 0 ? (
              <div className="px-8 py-10 text-center text-sm text-slate-500">No employees match these filters.</div>
            ) : (
              visible.map((row) => (
                <Link
                  key={row.id}
                  href={`/employee-folder/${stage}/employee/${row.id}`}
                  className={`relative grid ${stage === "pre" ? "grid-cols-[2fr_1fr_1fr_60px]" : "grid-cols-[2fr_1fr_1fr_1fr_60px]"} gap-4 px-8 py-4 items-center border-b border-black/10 last:border-b-0 hover:bg-slate-50 transition-colors`}
                >
                  <span className="text-lg font-medium text-slate-900 hover:underline min-w-0 truncate">{row.fullName}</span>
                  <span className="text-sm font-medium text-slate-600 truncate">{row.departmentName ?? row.branchName ?? "—"}</span>
                  {stage !== "pre" && <span className="text-sm font-medium text-slate-600">{row.date ?? "—"}</span>}
                  <span>
                    {stage === "pre" ? (
                      row.boardStage ? (
                        <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${boardStagePillClass(row.boardStage)}`}>
                          {row.boardStage}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">—</span>
                      )
                    ) : (
                      // row.stage (not the page's own `stage`) — a dual-listed
                      // row's REAL stage can differ from this page's stage
                      // (e.g. an Onboarding/Active person whose recruitment
                      // pipeline also flags them Probation, shown here too);
                      // the badge must say what they actually are, not a flat
                      // label matching whichever list happens to show them.
                      <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[row.stage]}`}>
                        {STAGE_LABELS[row.stage]}
                      </span>
                    )}
                  </span>
                  <div className="flex justify-center">
                    <RowActionMenu
                      name={row.fullName}
                      onDelete={async () => {
                        const result = await deletePreStageEmployee(row.id);
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
