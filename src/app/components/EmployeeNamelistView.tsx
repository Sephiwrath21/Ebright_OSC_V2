"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Home, LayoutGrid, List, Search } from "lucide-react";
import { initialsFromName } from "@/lib/text";
import { deleteEmployeeRecord } from "@/lib/employeeRecordActions";
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
import type { EmployeeOverviewRow } from "@/lib/employeeQueries";

const CARD_CAP = 6;

const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" }, { value: "03", label: "March" },
  { value: "04", label: "April" }, { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" }, { value: "09", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

interface Props {
  stage: EmployeeStage;
  groupBy: "branch" | "department";
  locationCode: string;
  locationName: string;
  rows: EmployeeOverviewRow[];
}

export default function EmployeeNamelistView({ stage, groupBy, locationCode, locationName, rows }: Props) {
  const router = useRouter();
  const handleDelete = async (id: number) => {
    const result = await deleteEmployeeRecord(id);
    if (result.ok) router.refresh();
    return result;
  };
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PositionGroup | "">("");
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
    return true;
  };

  const filteredRows = useMemo(() => rows.filter(matchesFilters), [rows, search, typeFilter]);

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
          <Link href={`/employee-folder/${stage}?by=${groupBy}`} className="hover:text-slate-900 transition-colors">
            {STAGE_LABELS[stage]}
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">{locationName}</span>
        </nav>

        {/* search-bar: search input + type filter + search button, all on
            one row at every width down to 375px. Search takes the remaining
            space (flex-1, min-w-0 so it can shrink freely); the dropdown and
            button are shrink-0 with deliberately narrow fixed widths/padding
            on mobile so the three together never need to wrap. sm+ reverts
            to the original sizing unchanged. */}
        <div className="flex flex-nowrap items-center gap-2 sm:gap-4 bg-white rounded-[20px] p-4 sm:p-5 mb-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-8 sm:pl-9 pr-2 sm:pr-3 rounded-lg border-2 border-black/25 text-sm text-black/67 truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as PositionGroup | "")}
            className="shrink-0 w-[84px] sm:w-auto sm:min-w-[130px] h-11 px-1.5 sm:px-3 rounded-lg border-2 border-black/25 text-xs sm:text-sm text-black/67 truncate"
          >
            <option value="">All types</option>
            {POSITION_GROUPS.map((g) => (
              <option key={g} value={g}>{groupLabel(g)}</option>
            ))}
          </select>
          <button
            type="button"
            className="shrink-0 h-11 px-3 sm:px-6 rounded-lg bg-[#8ac4f3bd] text-xs sm:text-sm font-bold text-[#004386c9] hover:bg-[#8ac4f3]"
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
                  onShowMore={() => setOpenGroup(group)}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        ) : (
          <ListViewTable stage={stage} rows={filteredRows} profileQuery={profileQuery} thirdGroupLabel={thirdGroupLabel} onDelete={handleDelete} />
        )}
      </div>

      {openGroup && (
        <ShowMoreModal
          label={groupLabel(openGroup)}
          rows={grouped[openGroup]}
          stage={stage}
          profileQuery={profileQuery}
          onClose={() => setOpenGroup(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function PersonCard({
  row,
  stage,
  profileQuery,
  onDelete,
}: {
  row: EmployeeOverviewRow;
  stage: EmployeeStage;
  profileQuery: string;
  onDelete: (id: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  return (
    <Link
      href={`/employee-folder/${stage}/employee/${row.id}${profileQuery}`}
      className="relative flex-1 basis-[130px] max-w-[150px] min-w-0 box-border bg-white border border-[#807d7d73] rounded-[15px] py-4 px-3 flex flex-col items-center text-center gap-1.5 hover:border-[#ee5f5f] hover:shadow-md transition-all"
    >
      <RowActionMenu name={row.fullName} className="absolute top-1.5 right-1.5" onDelete={() => onDelete(row.id)} />
      <div
        className={`w-[60px] h-[60px] rounded-full flex items-center justify-center font-medium text-lg shrink-0 ${
          STAGE_AVATAR_CLASSES[stage] ?? "bg-emerald-100 text-emerald-800"
        }`}
      >
        {initialsFromName(row.fullName)}
      </div>
      <div className="text-base font-medium text-black/67 w-full truncate">{row.fullName}</div>
      <div className="text-sm font-medium text-black/67 w-full truncate">{row.position ?? "—"}</div>
    </Link>
  );
}

function CategorySection({
  label,
  rows,
  stage,
  profileQuery,
  onShowMore,
  onDelete,
}: {
  label: string;
  rows: EmployeeOverviewRow[];
  stage: EmployeeStage;
  profileQuery: string;
  onShowMore: () => void;
  onDelete: (id: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  const shown = rows.slice(0, CARD_CAP);
  return (
    <section className="mb-7 last:mb-0">
      <h2 className="text-xl font-medium text-black/77 mb-4">{label}</h2>
      <div className="flex justify-center">
        <div className="flex flex-col items-end w-full max-w-[1000px]">
          <div className="flex flex-wrap gap-4 self-stretch">
            {shown.map((row) => (
              <PersonCard key={row.id} row={row} stage={stage} profileQuery={profileQuery} onDelete={onDelete} />
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
  onClose,
  onDelete,
}: {
  label: string;
  rows: EmployeeOverviewRow[];
  stage: EmployeeStage;
  profileQuery: string;
  onClose: () => void;
  onDelete: (id: number) => Promise<{ ok: boolean; error?: string }>;
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
      <div className="relative w-[min(1040px,calc(100vw-32px))] max-h-[min(720px,calc(100vh-32px))] mx-auto my-4 sm:my-8 bg-white rounded-3xl p-4 sm:p-7 box-border flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <h3 className="text-xl font-semibold text-black">{label}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-h-11 px-5 py-2 rounded-[10px] border-2 border-[#ee5f5f] bg-white text-sm font-medium text-[#7a1f1f] hover:bg-[#f48e8e24]"
          >
            Show Less
          </button>
        </div>

        {/* Search + year + month all on one row down to 375px — search
            takes the remaining space (flex-1, min-w-0, no longer a fixed
            180px floor that forced month onto its own row); year/month are
            shrink-0 with narrow fixed widths/padding on mobile, reverting to
            the original sizing at sm+. */}
        <div className="flex flex-nowrap gap-2 sm:gap-3 shrink-0">
          <input
            type="search"
            placeholder="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 min-w-0 sm:min-w-[180px] h-11 rounded-lg border-2 border-black/25 px-2.5 sm:px-3.5 text-sm text-black/67 truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
            className="shrink-0 w-[64px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-black/25 text-xs sm:text-sm text-black/67 truncate sm:min-w-[100px]"
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
            className="shrink-0 w-[74px] sm:w-auto h-11 px-1.5 sm:px-3 rounded-lg border-2 border-black/25 text-xs sm:text-sm text-black/67 truncate sm:min-w-[120px]"
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
              <PersonCard key={row.id} row={row} stage={stage} profileQuery={profileQuery} onDelete={onDelete} />
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
  onDelete,
}: {
  stage: EmployeeStage;
  rows: EmployeeOverviewRow[];
  profileQuery: string;
  thirdGroupLabel: string;
  onDelete: (id: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const gridColsClass = "grid-cols-[minmax(200px,2fr)_minmax(140px,1fr)_minmax(160px,1fr)_60px]";

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mt-1">
      {/* Each column already has a minmax() floor (see gridColsClass above),
          so the grid itself won't shrink below a legible width — the
          overflow-x-auto wrapper is what turns that into a horizontal swipe
          on mobile instead of the whole page overflowing. The whole table
          (including Name) scrolls together as one unit — deliberately no
          sticky column. */}
      <div className="bg-white rounded-[20px] overflow-x-auto">
        {/* Opaque #d1f0f9 (the same #a4e2f480-over-white blend every other
            header row uses) rather than the translucent color directly —
            translucent backgrounds on a wide grid inside overflow-x-auto are
            prone to partial-repaint glitches during horizontal scroll in
            some browsers, which is what was actually showing as "Position"
            losing its background. Visually identical against this card's
            white background either way. */}
        <div className={`grid ${gridColsClass} gap-4 px-8 py-4 bg-[#d1f0f9] text-[15px] font-medium text-black`}>
          <span>Name</span>
          <span>Employment Type</span>
          <span>Position</span>
          <span />
        </div>

        {visible.length === 0 ? (
          <div className="px-8 py-10 text-center text-sm text-slate-500">No employees match these filters.</div>
        ) : (
          visible.map((row) => {
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
                <div className="flex justify-center">
                  <RowActionMenu name={row.fullName} onDelete={() => onDelete(row.id)} />
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
