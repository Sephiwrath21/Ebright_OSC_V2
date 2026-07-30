"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Home, Search } from "lucide-react";
import { EMPLOYEE_STAGES, STAGE_LABELS, STAGE_PILL_CLASSES, type EmployeeStage } from "@/lib/employeeStages";
import type { EmployeeOverviewRow } from "@/lib/employeeQueries";
import RowActionMenu from "@/app/components/RowActionMenu";
import Pagination from "@/app/components/Pagination";
import { SortableDateHeader, nextDateSortState, applyDateSort, type DateSortState } from "@/app/components/SortableHeader";

interface Props {
  rows: EmployeeOverviewRow[];
  counts: Record<EmployeeStage, number>;
  userName?: string | null;
}

export default function EmployeeOverviewView({ rows, counts, userName }: Props) {
  // Independent from the summary blocks above — those are navigation links
  // into a stage's Branch/Department drill-down, not a filter for this table.
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
      if (statusFilter && r.stage !== statusFilter) return false;
      if (q && !r.fullName.toLowerCase().includes(q)) return false;
      if (year && r.date?.slice(0, 4) !== year) return false;
      if (month && r.date?.slice(5, 7) !== month) return false;
      return true;
    });
    return applyDateSort(result, dateSort, (r) => r.date, Boolean(year) || Boolean(month));
  }, [rows, statusFilter, search, year, month, dateSort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function resetFilters() {
    setStatusFilter("");
    setSearch("");
    setYear("");
    setMonth("");
    setPage(1);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Employee Folder</span>
        </nav>

        <header className="mb-6">
          <p className="text-slate-500 text-lg">Welcome{userName ? `, ${userName}` : ","}</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
            Employee Overview
          </h1>
        </header>

        <section aria-labelledby="employees-summary-heading" className="mb-8">
          <h2 id="employees-summary-heading" className="text-xl font-semibold text-slate-800 mb-4">
            Employees
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {EMPLOYEE_STAGES.map((stage) => (
              <Link
                key={stage}
                href={`/employee-folder/${stage}`}
                className="relative text-left bg-white rounded-[27px] border-2 border-slate-200 p-5 min-h-[143px] flex flex-col justify-end gap-2.5 transition-all hover:border-slate-400 hover:shadow-md"
              >
                <span className={`self-start inline-block px-3.5 py-1 rounded-full text-[13px] font-medium ${STAGE_PILL_CLASSES[stage]}`}>
                  {STAGE_LABELS[stage]}
                </span>
                <span className="text-4xl font-medium text-slate-900/70">{counts[stage]}</span>
                <ChevronRight className="absolute top-3.5 right-4 w-5 h-5 text-slate-400" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="employees-list-heading">
          <h2 id="employees-list-heading" className="text-lg font-semibold text-slate-600 mb-4">
            Employee Records
          </h2>

          <div className="flex flex-wrap items-center gap-4 bg-white rounded-2xl p-5 mb-6">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 pl-9 pr-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as EmployeeStage | "");
                setPage(1);
              }}
              className="h-10 px-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 min-w-[120px]"
            >
              <option value="">status</option>
              {EMPLOYEE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>

            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPage(1);
              }}
              className="h-10 px-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 min-w-[110px]"
            >
              <option value="">year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
              className="h-10 px-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 min-w-[130px]"
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
              className="h-10 px-6 rounded-lg bg-blue-100 text-blue-800 font-semibold text-sm hover:bg-blue-200 transition-colors"
            >
              Search
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-10 px-4 rounded-lg border-2 border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors"
            >
              Reset
            </button>
          </div>

          <div className="bg-white rounded-[27px] overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 bg-[#a4e2f480] text-sm font-medium text-slate-900">
              <span>Name</span>
              <span>Branch/ Department</span>
              <SortableDateHeader state={dateSort} onToggle={() => setDateSort(nextDateSortState)} />
              <span>Status</span>
              <span />
            </div>

            {pageRows.length === 0 ? (
              <div className="px-8 py-10 text-center text-sm text-slate-500">No employees match these filters.</div>
            ) : (
              pageRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 items-center border-b border-black/10 last:border-b-0"
                >
                  <Link
                    href={`/employee-record/${row.id}`}
                    className="text-lg font-medium text-slate-900 hover:underline min-w-0 truncate"
                  >
                    {row.fullName}
                  </Link>
                  <span className="text-sm font-medium text-slate-600 truncate">
                    {row.departmentName ?? row.branchName ?? "—"}
                  </span>
                  <span className="text-sm font-medium text-slate-600">{row.date ?? "—"}</span>
                  <span>
                    <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[row.stage]}`}>
                      {STAGE_LABELS[row.stage]}
                    </span>
                  </span>
                  <div className="flex justify-center">
                    <RowActionMenu name={row.fullName} />
                  </div>
                </div>
              ))
            )}
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
