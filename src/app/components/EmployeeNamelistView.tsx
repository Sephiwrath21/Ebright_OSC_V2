"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Home, LayoutGrid, List, Search } from "lucide-react";
import { initialsFromName } from "@/lib/text";
import RowActionMenu from "@/app/components/RowActionMenu";
import Pagination from "@/app/components/Pagination";
import {
  STAGE_LABELS,
  STAGE_AVATAR_CLASSES,
  positionGroup,
  POSITION_GROUPS,
  type EmployeeStage,
  type PositionGroup,
} from "@/lib/employeeStages";
import type { EmployeeOverviewRow, RealExitType } from "@/lib/employeeQueries";

const CARD_CAP = 6;

const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" }, { value: "03", label: "March" },
  { value: "04", label: "April" }, { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" }, { value: "09", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

// Only resignation/eoc are ever populated (see listExitTypesByUserId) — the
// other two are kept here since the reference defines colors for all four.
const EXIT_TYPE_META: Record<string, { label: string; classes: string }> = {
  resignation: { label: "Resignation", classes: "bg-[#90aeee7d] text-[#390ff2]" },
  eoc: { label: "End of Contract", classes: "bg-[#67eab37d] text-[#307348]" },
  "internship-completed": { label: "Internship Completed", classes: "bg-[#d8a1fa7d] text-[#621096]" },
  termination: { label: "Termination/Dismissal", classes: "bg-[#f38e8e6b] text-[#961010]" },
};

interface Props {
  stage: EmployeeStage;
  groupBy: "branch" | "department";
  locationCode: string;
  locationName: string;
  rows: EmployeeOverviewRow[];
  /** Real offboarding_case-derived exit type — only ever passed for stage="exit". */
  exitTypeByUserId?: Record<number, RealExitType>;
}

export default function EmployeeNamelistView({ stage, groupBy, locationCode, locationName, rows, exitTypeByUserId }: Props) {
  const isExit = stage === "exit";
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PositionGroup | "">("");
  const [exitTypeFilter, setExitTypeFilter] = useState("");
  const [openGroup, setOpenGroup] = useState<PositionGroup | null>(null);

  // Fixed link-back context for the profile breadcrumb — the URL's own
  // groupBy/locationCode (which branch/dept list this employee was actually
  // reached from).
  const profileQuery = `?locGroup=${groupBy}&locCode=${encodeURIComponent(locationCode)}`;

  // 3rd bucket's label follows the page's own groupBy (how this namelist was
  // reached) — Branch-scoped positions include Protege, Dept-scoped include
  // Intern (js/position-options.js); same underlying INTERN-position people
  // either way, since no distinct "Protege" position value exists in real
  // data. No local override toggle anymore — one namelist, one fixed label.
  const thirdGroupLabel = groupBy === "branch" ? "Protege" : "Intern";
  const groupLabel = (g: PositionGroup) => (g === "Intern" ? thirdGroupLabel : g);

  const matchesFilters = (row: EmployeeOverviewRow) => {
    const q = search.trim().toLowerCase();
    if (q && !row.fullName.toLowerCase().includes(q) && !(row.position ?? "").toLowerCase().includes(q)) return false;
    if (typeFilter && positionGroup(row.position) !== typeFilter) return false;
    if (isExit && exitTypeFilter && exitTypeByUserId?.[row.id] !== exitTypeFilter) return false;
    return true;
  };

  const filteredRows = useMemo(() => rows.filter(matchesFilters), [rows, search, typeFilter, exitTypeFilter]);

  const grouped = useMemo(() => {
    const out: Record<PositionGroup, EmployeeOverviewRow[]> = {
      "Full Time": [],
      "Part Time": [],
      Intern: [],
    };
    for (const r of filteredRows) out[positionGroup(r.position)].push(r);
    return out;
  }, [filteredRows]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 pt-4 pb-10">
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
          <Link href={`/employee-folder/${stage}?by=${groupBy}`} className="hover:text-slate-900 transition-colors">
            {STAGE_LABELS[stage]}
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">{locationName}</span>
        </nav>

        {/* search-bar: search input + type filter (+ exit type filter) + search button */}
        <div className="flex flex-wrap items-center gap-4 bg-white rounded-[20px] p-5 mb-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border-2 border-black/25 text-sm text-black/67 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as PositionGroup | "")}
            className="h-10 px-3 rounded-lg border-2 border-black/25 text-sm text-black/67 min-w-[130px]"
          >
            <option value="">All types</option>
            {POSITION_GROUPS.map((g) => (
              <option key={g} value={g}>{groupLabel(g)}</option>
            ))}
          </select>
          {isExit && (
            <select
              value={exitTypeFilter}
              onChange={(e) => setExitTypeFilter(e.target.value)}
              className="h-10 px-3 rounded-lg border-2 border-black/25 text-sm text-black/67 min-w-[150px]"
            >
              <option value="">All exit types</option>
              {Object.entries(EXIT_TYPE_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="h-10 px-6 rounded-lg bg-[#8ac4f3bd] text-sm font-bold text-[#004386c9] hover:bg-[#8ac4f3]"
          >
            search
          </button>
        </div>

        {/* view-toggle-row: list/grid view */}
        <div className="flex justify-end items-center gap-3 mb-3">
          <div className="inline-flex gap-1 bg-[#eef3fb] rounded-full p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              aria-label="List view"
              className={`flex items-center justify-center w-9 h-8 rounded-full transition-colors ${
                viewMode === "list" ? "bg-[#a9d3f7bd] text-[#004386c9]" : "text-black/65 hover:bg-[#dde8f7]"
              }`}
            >
              <List className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label="Grid view"
              className={`flex items-center justify-center w-9 h-8 rounded-full transition-colors ${
                viewMode === "grid" ? "bg-[#a9d3f7bd] text-[#004386c9]" : "text-black/65 hover:bg-[#dde8f7]"
              }`}
            >
              <LayoutGrid className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>

        <h1 className="text-xl font-medium text-black mb-4">{STAGE_LABELS[stage]}</h1>

        {viewMode === "grid" ? (
          <div className="bg-white rounded-[20px] px-7 py-6 shadow-[0_1px_4px_0_#0000000f]">
            {POSITION_GROUPS.filter((g) => grouped[g].length > 0).length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-10">No employees match these filters.</p>
            ) : (
              POSITION_GROUPS.filter((g) => grouped[g].length > 0).map((group) => (
                <CategorySection
                  key={group}
                  label={groupLabel(group)}
                  rows={grouped[group]}
                  stage={stage}
                  profileQuery={profileQuery}
                  exitTypeByUserId={exitTypeByUserId}
                  onShowMore={() => setOpenGroup(group)}
                />
              ))
            )}
          </div>
        ) : (
          <ListViewTable
            stage={stage}
            rows={filteredRows}
            profileQuery={profileQuery}
            thirdGroupLabel={thirdGroupLabel}
            exitTypeByUserId={exitTypeByUserId}
          />
        )}
      </div>

      {openGroup && (
        <ShowMoreModal
          label={groupLabel(openGroup)}
          rows={grouped[openGroup]}
          stage={stage}
          profileQuery={profileQuery}
          exitTypeByUserId={exitTypeByUserId}
          onClose={() => setOpenGroup(null)}
        />
      )}
    </div>
  );
}

function PersonCard({
  row,
  stage,
  profileQuery,
  exitType,
}: {
  row: EmployeeOverviewRow;
  stage: EmployeeStage;
  profileQuery: string;
  exitType?: RealExitType;
}) {
  return (
    <Link
      href={`/employee-folder/${stage}/employee/${row.id}${profileQuery}`}
      className="relative flex-1 basis-[130px] max-w-[150px] min-w-0 box-border bg-white border border-[#807d7d73] rounded-[15px] py-4 px-3 flex flex-col items-center text-center gap-1.5 hover:border-[#ee5f5f] hover:shadow-md transition-all"
    >
      <RowActionMenu name={row.fullName} className="absolute top-1.5 right-1.5" />
      <div
        className={`w-[60px] h-[60px] rounded-full flex items-center justify-center font-medium text-lg shrink-0 ${
          STAGE_AVATAR_CLASSES[stage] ?? "bg-emerald-100 text-emerald-800"
        }`}
      >
        {initialsFromName(row.fullName)}
      </div>
      <div className="text-base font-medium text-black/67 w-full truncate">{row.fullName}</div>
      <div className="text-sm font-medium text-black/67 w-full truncate">{row.position ?? "—"}</div>
      {exitType && (
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium mt-0.5 ${EXIT_TYPE_META[exitType].classes}`}>
          {EXIT_TYPE_META[exitType].label}
        </span>
      )}
    </Link>
  );
}

function CategorySection({
  label,
  rows,
  stage,
  profileQuery,
  exitTypeByUserId,
  onShowMore,
}: {
  label: string;
  rows: EmployeeOverviewRow[];
  stage: EmployeeStage;
  profileQuery: string;
  exitTypeByUserId?: Record<number, RealExitType>;
  onShowMore: () => void;
}) {
  const shown = rows.slice(0, CARD_CAP);
  return (
    <section className="mb-7 last:mb-0">
      <h2 className="text-xl font-medium text-black/77 mb-4">{label}</h2>
      <div className="flex justify-center">
        <div className="flex flex-col items-end w-full max-w-[1000px]">
          <div className="flex flex-wrap gap-4 self-stretch">
            {shown.map((row) => (
              <PersonCard key={row.id} row={row} stage={stage} profileQuery={profileQuery} exitType={exitTypeByUserId?.[row.id]} />
            ))}
          </div>
          {rows.length > CARD_CAP && (
            <button
              type="button"
              onClick={onShowMore}
              className="mt-4 shrink-0 inline-block px-5 py-2 rounded-[10px] border-2 border-[#ee5f5f] bg-white text-sm font-medium text-[#7a1f1f] hover:bg-[#f48e8e24]"
            >
              Show More
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ShowMoreModal({
  label,
  rows,
  stage,
  profileQuery,
  exitTypeByUserId,
  onClose,
}: {
  label: string;
  rows: EmployeeOverviewRow[];
  stage: EmployeeStage;
  profileQuery: string;
  exitTypeByUserId?: Record<number, RealExitType>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);

  const years = useMemo(
    () => Array.from(new Set(rows.map((r) => r.date?.slice(0, 4)).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.fullName.toLowerCase().includes(q) && !(r.position ?? "").toLowerCase().includes(q)) return false;
      if (year && r.date?.slice(0, 4) !== year) return false;
      if (month && r.date?.slice(5, 7) !== month) return false;
      return true;
    });
  }, [rows, search, year, month]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="fixed inset-0 z-[1000]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 cursor-pointer" />
      <div className="relative w-[min(1040px,calc(100vw-64px))] max-h-[min(720px,calc(100vh-64px))] mx-auto my-8 bg-white rounded-3xl p-7 box-border flex flex-col gap-4">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-xl font-semibold text-black">{label}</h3>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-[10px] border-2 border-[#ee5f5f] bg-white text-sm font-medium text-[#7a1f1f] hover:bg-[#f48e8e24]"
          >
            Show Less
          </button>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <input
            type="search"
            placeholder="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 min-w-[180px] h-10 rounded-lg border-2 border-black/25 px-3.5 text-sm text-black/67 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 rounded-lg border-2 border-black/25 text-sm text-black/67 min-w-[100px]"
          >
            <option value="">year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 rounded-lg border-2 border-black/25 text-sm text-black/67 min-w-[120px]"
          >
            <option value="">month</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-6 max-[900px]:grid-cols-3 max-[560px]:grid-cols-2 gap-4 p-1">
          {visible.length === 0 ? (
            <p className="col-span-full text-center text-sm text-slate-500 py-8">No matches.</p>
          ) : (
            visible.map((row) => (
              <PersonCard key={row.id} row={row} stage={stage} profileQuery={profileQuery} exitType={exitTypeByUserId?.[row.id]} />
            ))
          )}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          pageSizeOptions={[24, 50, 100]}
          totalCount={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          className="shrink-0"
        />
      </div>
    </div>
  );
}

function ListViewTable({
  stage,
  rows,
  profileQuery,
  thirdGroupLabel,
  exitTypeByUserId,
}: {
  stage: EmployeeStage;
  rows: EmployeeOverviewRow[];
  profileQuery: string;
  thirdGroupLabel: string;
  exitTypeByUserId?: Record<number, RealExitType>;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const isExit = stage === "exit";
  const gridColsClass = isExit
    ? "grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(150px,1fr)_60px]"
    : "grid-cols-[minmax(200px,2fr)_minmax(140px,1fr)_minmax(160px,1fr)_60px]";

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mt-1">
      <div className="bg-white rounded-[20px] overflow-hidden">
        <div className={`grid ${gridColsClass} gap-4 px-8 py-4 bg-[#a4e2f480] text-[15px] font-medium text-black`}>
          <span>Name</span>
          <span>Employment Type</span>
          <span>Position</span>
          {isExit && <span>Exit Type</span>}
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
                  href={`/employee-folder/${stage}/employee/${row.id}${profileQuery}`}
                  className="text-base font-medium text-black hover:underline truncate min-w-0"
                >
                  {row.fullName}
                </Link>
                {/* Derived from position, not the raw employment_type column —
                    confirmed via direct query that employment_type is null on
                    ~80% of real rows (only a handful of onboarding-era rows
                    have it populated, e.g. "Intern - 4 months"), which is why
                    it was showing "Other" for most people. position is
                    reliably populated for everyone, so positionGroup() (the
                    same classifier the Block view's Full Time/Part Time/
                    Protege-or-Intern grouping already uses) gives a real
                    answer for every row instead. */}
                <span className="text-[15px] text-black/67 truncate">
                  {(() => {
                    const g = positionGroup(row.position);
                    return g === "Intern" ? thirdGroupLabel : g;
                  })()}
                </span>
                <span className="text-[15px] text-black/67 truncate">{row.position ?? "—"}</span>
                {isExit && (
                  <span>
                    {exitType ? (
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${EXIT_TYPE_META[exitType].classes}`}>
                        {EXIT_TYPE_META[exitType].label}
                      </span>
                    ) : (
                      "—"
                    )}
                  </span>
                )}
                <div className="flex justify-center">
                  <RowActionMenu name={row.fullName} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {rows.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          pageSizeOptions={[15, 50, 100]}
          totalCount={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          className="mt-4"
        />
      )}
    </div>
  );
}
