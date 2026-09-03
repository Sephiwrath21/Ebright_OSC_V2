"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";
import type { EmployeeTasksSummary, EmployeeTaskRow } from "@/lib/employeeQueries";
import Pagination from "@/app/components/Pagination";
import TaskDrilldownModal from "./TaskDrilldownModal";
import StaffFilterPicker, { type StaffPoolPerson } from "./StaffFilterPicker";

export interface PendingOverdueEmployeeRow {
  id: number;
  fullName: string;
  position: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  tasks: EmployeeTasksSummary;
}

interface LocationOption {
  code: string;
  name: string;
}

interface Props {
  rows: PendingOverdueEmployeeRow[];
  /** Branch/Department filters only render for CEO/Finance/HR/Superadmin
   *  ("full" access, see pendingOverdueTasksAccess.ts) — HOD/BM are already
   *  scoped server-side to their own department/branch, so these would be a
   *  single-option, do-nothing dropdown for them. */
  canFilterLocation: boolean;
  branchOptions: LocationOption[];
  departmentOptions: LocationOption[];
  /** Real distinct employment.position values within the viewer's own
   *  scope, not a hardcoded list — see page.tsx's own comment. */
  roleOptions: string[];
  selectedBranch: string;
  selectedDepartment: string;
  selectedRole: string;
  /** Same scope-limited set the table itself starts from, captured before
   *  Branch/Department/Role narrow it further — see page.tsx's own
   *  staffPoolRows comment for why this is the actual enforcement (a
   *  scoped HOD/BM's browser never receives anyone outside their own
   *  department/branch in the first place). */
  staffPool: StaffPoolPerson[];
  selectedStaffIds: number[];
}

const MONTH_OPTIONS = [
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

export default function PendingOverdueTasksView({
  rows,
  canFilterLocation,
  branchOptions,
  departmentOptions,
  roleOptions,
  selectedBranch,
  selectedDepartment,
  selectedRole,
  staffPool,
  selectedStaffIds,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // Month/Year — client-side only, same convention as the existing
  // per-employee Task tab (TaskPanel in EmployeeRecordPanels.tsx): the full
  // open-task list is already loaded (fetched once server-side, unaffected
  // by this), so switching months just re-filters/re-counts it locally
  // rather than round-tripping to the server. Lazy initializers so
  // `new Date()` only runs once, on mount. "All months"/"All years" are
  // included (unlike the reference screenshot, which shows neither) so a
  // task with no due date at all — which would otherwise never appear
  // under any specific month — still has somewhere to show up.
  const currentMonth = useMemo(() => String(new Date().getMonth() + 1).padStart(2, "0"), []);
  const currentYear = useMemo(() => String(new Date().getFullYear()), []);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  const years = useMemo(() => {
    const set = new Set<string>([String(new Date().getFullYear())]);
    for (const row of rows) {
      for (const t of [...row.tasks.pending, ...row.tasks.overdue]) {
        if (t.dueDate) set.add(t.dueDate.slice(0, 4));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  function inSelectedPeriod(t: EmployeeTaskRow): boolean {
    // A task with no due date at all can't match a specific month/year —
    // it only ever shows up under "All months"+"All years" (confirmed
    // against real data: a task with dueDate=null does exist in production,
    // and this is the only path that ever surfaces it, matching the reason
    // "All months"/"All years" exists here at all — see this component's
    // own comment on why, above `month`'s useState).
    if (!t.dueDate) return year === "all" && month === "all";
    if (year !== "all" && t.dueDate.slice(0, 4) !== year) return false;
    if (month !== "all" && t.dueDate.slice(5, 7) !== month) return false;
    return true;
  }

  const filteredRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        pending: row.tasks.pending.filter(inSelectedPeriod),
        overdue: row.tasks.overdue.filter(inSelectedPeriod),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, month, year],
  );

  // Capped at 25/page (2026-08-28, see conversation) — `rows` previously
  // rendered in full, unpaginated. Page resets to 1 whenever the matching
  // set actually changes (a new server round-trip via `rows`, or a
  // month/year change) so a stale page number never lands past the end of a
  // now-shorter result set.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => setPage(1), [rows, month, year]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const [drilldown, setDrilldown] = useState<{ employeeName: string; bucket: "pending" | "overdue"; tasks: EmployeeTaskRow[] } | null>(
    null,
  );

  // Branch/Department are mutually exclusive, same convention as
  // EmployeeRecordsTable.tsx's own Branch/Department pair — picking one
  // clears the other rather than letting both narrow the query at once.
  // Each select's onChange passes only the ONE field it owns; every other
  // field falls back to its own current value, except the other half of the
  // branch/department pair, which is explicitly cleared. Staff is a
  // separate peer filter (2026-08-27, see conversation) — ANDed with
  // whichever of these is also active, never cleared by them.
  function pushFilters(branch: string, department: string, role: string, staffIds: number[]) {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    if (department) params.set("department", department);
    if (role) params.set("role", role);
    if (staffIds.length > 0) params.set("staff", staffIds.join(","));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function onLocationOrRoleChange(key: "branch" | "department" | "role", value: string) {
    const branch = key === "branch" ? value : key === "department" ? "" : selectedBranch;
    const department = key === "department" ? value : key === "branch" ? "" : selectedDepartment;
    const role = key === "role" ? value : selectedRole;
    pushFilters(branch, department, role, selectedStaffIds);
  }

  function onStaffApply(staffIds: number[]) {
    pushFilters(selectedBranch, selectedDepartment, selectedRole, staffIds);
  }

  // Resets every filter on the page — Month/Year (local state, back to
  // today) plus Branch/Department/Role/Staff (URL params, dropped entirely
  // so the server re-resolves them to "All ...").
  function clearAllFilters() {
    setMonth(currentMonth);
    setYear(currentYear);
    router.push(pathname);
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      {/* max-w-7xl, not 6xl (2026-08-27, see conversation — layout fix) —
          6xl (1152px) left only ~130px of headroom for 6 filter fields plus
          5 gaps plus the divider, which was just short of fitting Month/
          Year/Branch/Department/Role/Staff on one row at typical desktop
          widths, wrapping Staff alone onto its own line. flex-wrap stays on
          the filter row below regardless — this widens the budget so it
          fits at more widths, it doesn't remove the safety net for a
          genuinely narrow viewport. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-10">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-11 h-11 rounded-xl bg-[#1e2a5e] dark:bg-indigo-900 flex items-center justify-center shrink-0">
            <ClipboardList className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Pending &amp; Overdue Tasks Overview</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              See who still has work outstanding, and how much of it is overdue, for the month you pick below.
            </p>
          </div>
        </div>

        <div
          className="bg-white dark:bg-slate-900 rounded-[14px] shadow-[0_2px_6px_rgba(0,0,0,0.08)] p-5 mb-6 flex flex-wrap items-end gap-4"
          style={{ border: "0.5px solid var(--border-neutral)" }}
        >
          <FilterField label="Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
              <option value="all">All months</option>
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Year">
            <select value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </FilterField>

          {canFilterLocation && (
            <>
              <div className="hidden sm:block self-stretch w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
              <FilterField label="Branch">
                <select
                  value={selectedBranch}
                  onChange={(e) => onLocationOrRoleChange("branch", e.target.value)}
                  className={selectClass}
                >
                  <option value="">All branches</option>
                  {branchOptions.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Department">
                <select
                  value={selectedDepartment}
                  onChange={(e) => onLocationOrRoleChange("department", e.target.value)}
                  className={selectClass}
                >
                  <option value="">All departments</option>
                  {departmentOptions.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            </>
          )}

          <FilterField label="Role">
            <select value={selectedRole} onChange={(e) => onLocationOrRoleChange("role", e.target.value)} className={selectClass}>
              <option value="">All roles</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Staff">
            <StaffFilterPicker
              pool={staffPool}
              canFilterLocation={canFilterLocation}
              branchOptions={branchOptions}
              departmentOptions={departmentOptions}
              selectedIds={selectedStaffIds}
              onApply={onStaffApply}
            />
          </FilterField>

          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-auto h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Clear Filter
          </button>
        </div>

        <div
          className="bg-white dark:bg-slate-900 rounded-[14px] overflow-hidden shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
          style={{ border: "0.5px solid var(--border-neutral)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#dbe6fb] dark:bg-slate-800 text-[#1e2a5e] dark:text-slate-200">
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-5 py-3">No.</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-5 py-3">Name</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-5 py-3">Role</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-5 py-3">Department</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-5 py-3">Pending</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-5 py-3">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500">
                      No employees match the current filters.
                    </td>
                  </tr>
                )}
                {pageRows.map((row, i) => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-5 py-4 text-slate-400 dark:text-slate-500">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900 dark:text-slate-100">{row.fullName}</td>
                    <td className="px-5 py-4 text-[#3f5aa8] dark:text-slate-300">{row.position ?? "—"}</td>
                    <td className="px-5 py-4 text-[#3f5aa8] dark:text-slate-300">{row.departmentName ?? row.branchName ?? "—"}</td>
                    <td className="px-5 py-4">
                      <CountBadge
                        count={row.pending.length}
                        tone="pending"
                        onClick={() => setDrilldown({ employeeName: row.fullName, bucket: "pending", tasks: row.pending })}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <CountBadge
                        count={row.overdue.length}
                        tone="overdue"
                        onClick={() => setDrilldown({ employeeName: row.fullName, bucket: "overdue", tasks: row.overdue })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredRows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={[25, 50, 100]}
            totalCount={filteredRows.length}
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

      {drilldown && (
        <TaskDrilldownModal
          employeeName={drilldown.employeeName}
          bucket={drilldown.bucket}
          tasks={drilldown.tasks}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}

const selectClass =
  "min-w-[140px] h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function CountBadge({ count, tone, onClick }: { count: number; tone: "pending" | "overdue"; onClick: () => void }) {
  if (count === 0) {
    return <span className="inline-block min-w-[2.25rem] text-center text-slate-300 dark:text-slate-600 font-medium">0</span>;
  }
  const toneClass =
    tone === "pending"
      ? "bg-[#fdf1d6] text-[#8a6a1a] dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-[#fbe1e1] text-[#a63a3a] dark:bg-red-900/40 dark:text-red-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[2.25rem] rounded-lg px-2.5 py-1 text-sm font-semibold transition-colors hover:brightness-95 ${toneClass}`}
    >
      {count}
    </button>
  );
}
