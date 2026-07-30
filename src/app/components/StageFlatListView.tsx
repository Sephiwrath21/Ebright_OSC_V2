"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Home, Search } from "lucide-react";
import { STAGE_LABELS, STAGE_PILL_CLASSES, type EmployeeStage } from "@/lib/employeeStages";
import type { BranchOpt, DepartmentOpt, EmployeeOverviewRow } from "@/lib/employeeQueries";
import RowActionMenu from "@/app/components/RowActionMenu";
import { SortableDateHeader, nextDateSortState, applyDateSort, type DateSortState } from "@/app/components/SortableHeader";
import AddPreStageEmployeeModal from "@/app/components/AddPreStageEmployeeModal";

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
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [dateSort, setDateSort] = useState<DateSortState>("default");

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
    return applyDateSort(result, dateSort, (r) => r.date, Boolean(year) || Boolean(month));
  }, [rows, search, year, month, dateSort]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
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

        <div className="flex flex-wrap items-center gap-4 bg-white rounded-2xl p-5 mb-6">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-10 px-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 min-w-[110px]"
          >
            <option value="">year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 px-3 rounded-lg border-2 border-slate-200 text-sm text-slate-700 min-w-[130px]"
          >
            <option value="">month</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {stage === "pre" && <AddPreStageEmployeeModal branches={branches ?? []} departments={departments ?? []} />}
        </div>

        <div className="bg-white rounded-[27px] overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 bg-[#a4e2f480] text-sm font-medium text-slate-900">
            <span>Name</span>
            <span>Branch/ Department</span>
            <SortableDateHeader state={dateSort} onToggle={() => setDateSort(nextDateSortState)} />
            <span>Status</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="px-8 py-10 text-center text-sm text-slate-500">No employees match these filters.</div>
          ) : (
            filtered.map((row) => (
              <Link
                key={row.id}
                href={`/employee-folder/${stage}/employee/${row.id}`}
                className="relative grid grid-cols-[2fr_1fr_1fr_1fr_60px] gap-4 px-8 py-4 items-center border-b border-black/10 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <span className="text-lg font-medium text-slate-900 hover:underline min-w-0 truncate">{row.fullName}</span>
                <span className="text-sm font-medium text-slate-600 truncate">{row.departmentName ?? row.branchName ?? "—"}</span>
                <span className="text-sm font-medium text-slate-600">{row.date ?? "—"}</span>
                <span>
                  <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[stage]}`}>
                    {STAGE_LABELS[stage]}
                  </span>
                </span>
                {/* Candidates have no portal account to act on — no message/
                    remove actions make sense yet, so the menu is skipped
                    (the row itself still opens the same profile template). */}
                <div className="flex justify-center">{!row.isCandidate && <RowActionMenu name={row.fullName} />}</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
