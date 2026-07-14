"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Home,
  ChevronRight,
  Search,
  Plus,
  Download,
  Eye,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight as ChevronRightLg,
  UserPlus,
  CircleAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { deleteEmployee } from "@/app/dashboard-employee-management/actions";
import {
  EmployeeDashboardOverviewSection,
  type OverviewStats,
  type EmployeeBoxKey,
} from "@/app/components/EmployeeDashboardOverviewSection";

const ROLE_OPTIONS = ["FT CEO", "FT HOD", "FT EXEC", "BM", "FT COACH", "PT COACH", "INTERN"] as const;
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "inactive", label: "Inactive" },
  { value: "archive", label: "Archive" },
];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  onboarding: "bg-amber-50 text-amber-700 ring-amber-600/20",
  inactive: "bg-slate-100 text-slate-600 ring-slate-500/20",
  archive: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
};
const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  onboarding: "bg-amber-500",
  inactive: "bg-slate-400",
  archive: "bg-zinc-500",
};

export interface EmployeeRow {
  id: number;
  email: string;
  employeeId: string | null;
  fullName: string;
  nickName: string | null;
  dob: string | null;
  phone: string | null;
  role: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  pendingOnboarding: boolean;
}

export interface BranchOpt { id: number; code: string; name: string }
export interface DepartmentOpt { id: number; code: string; name: string }

const PAGE_SIZE = 10;

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function statusLabel(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function calculateAge(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : "—";
}

// Branch label for export — "HQ — Optimisation" for HQ folks (so the
// department isn't lost), branch name otherwise.
function branchLabel(e: EmployeeRow): string {
  if (e.branchCode === "HQ") {
    return e.departmentName ? `HQ — ${e.departmentName}` : "HQ";
  }
  return e.branchName ?? e.departmentName ?? "—";
}

export default function EmployeeListView({
  employees,
  branches,
  departments,
  overviewStats,
  onboardingUserIds,
}: {
  employees: EmployeeRow[];
  branches: BranchOpt[];
  departments: DepartmentOpt[];
  /** Optional — when provided, renders the org overview cards above the
   *  existing employees table. The cards act as quick-filters for the list. */
  overviewStats?: OverviewStats;
  /** user_ids on the "burnlist" (Finalized manpower_schedule, start_date within
   *  -1 week .. +6 months). Drives the Onboarding card click-filter. */
  onboardingUserIds?: number[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [orgUnit, setOrgUnit] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [activeBox, setActiveBox] = useState<EmployeeBoxKey | null>(null);
  const [page, setPage] = useState(1);
  const [advOpen, setAdvOpen] = useState(false);
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [endFrom, setEndFrom] = useState("");
  const [endTo, setEndTo] = useState("");
  const [nullFields, setNullFields] = useState<string[]>([]);

  // Clicking an overview card drives the list on its own, so we clear the
  // manual dropdown/search filters and let the box be the sole active filter
  // (Total simply shows everything). Clicking the active card again clears it.
  const handleBoxClick = (key: EmployeeBoxKey) => {
    setActiveBox((cur) => (cur === key ? null : key));
    setSearch("");
    setOrgUnit("");
    setRole("");
    setStatus("");
    setStartFrom("");
    setStartTo("");
    setEndFrom("");
    setEndTo("");
    setNullFields([]);
    setPage(1);
  };
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteEmployee(targetId);
      if (res.ok) {
        setDeleteTarget(null);
        router.refresh();
      } else {
        setDeleteError(res.error ?? "Could not delete employee.");
      }
    });
  };

  useEffect(() => {
    if (!deleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDeleteModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget, isDeleting]);

  const onboardingIdSet = useMemo(
    () => new Set(onboardingUserIds ?? []),
    [onboardingUserIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (role && e.role !== role) return false;
      // Default load applies no implicit status filter — the list is already
      // scoped to active staff (same source as the Total Staff box). Status is
      // only narrowed when the Status dropdown is explicitly set.
      if (status && e.status !== status) return false;
      if (orgUnit.startsWith("branch:")) {
        const code = orgUnit.slice("branch:".length);
        if (e.branchCode !== code) return false;
      } else if (orgUnit.startsWith("dept:")) {
        const code = orgUnit.slice("dept:".length);
        if (e.departmentCode !== code) return false;
      }
      // Overview-card quick filters (Total = no constraint):
      if (activeBox === "branches") {
        if (!e.branchCode || e.branchCode === "HQ") return false;
      } else if (activeBox === "departments") {
        if (e.branchCode !== "HQ") return false;
      } else if (activeBox === "onboarding") {
        // "Burnlist": staff with a Finalized manpower_schedule starting within
        // the -1 week .. +6 months window (set computed server-side).
        if (!onboardingIdSet.has(e.id)) return false;
      }
      if (startFrom && (!e.startDate || e.startDate < startFrom)) return false;
      if (startTo && (!e.startDate || e.startDate > startTo)) return false;
      if (endFrom && (!e.endDate || e.endDate < endFrom)) return false;
      if (endTo && (!e.endDate || e.endDate > endTo)) return false;
      if (nullFields.length > 0) {
        const allMissing = nullFields.every((key) =>
          key === "pendingOnboarding" ? e.pendingOnboarding : !e[key as keyof EmployeeRow],
        );
        if (!allMissing) return false;
      }
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        (e.nickName?.toLowerCase().includes(q) ?? false) ||
        (e.employeeId?.toLowerCase().includes(q) ?? false) ||
        e.email.toLowerCase().includes(q)
      );
    });
  }, [employees, search, orgUnit, role, status, activeBox, onboardingIdSet, startFrom, startTo, endFrom, endTo, nullFields]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // "total" means "show all", so it doesn't count as an active filter.
  const boxFiltering = activeBox !== null && activeBox !== "total";
  const hasAdvFilters = Boolean(startFrom || startTo || endFrom || endTo || nullFields.length > 0);
  const hasActiveFilters = Boolean(search || orgUnit || role || status || boxFiltering || hasAdvFilters);
  const clearAdvFilters = () => {
    setStartFrom("");
    setStartTo("");
    setEndFrom("");
    setEndTo("");
    setNullFields([]);
  };
  const clearFilters = () => {
    setSearch("");
    setOrgUnit("");
    setRole("");
    setStatus("");
    setActiveBox(null);
    clearAdvFilters();
    setPage(1);
  };

  // Export the currently-filtered employee list as a clean, minimalist PDF.
  // Header bar matches the manpower report (logo + title + period); the table
  // itself is borderless with thin row dividers — fewer ink, easier to scan.
  async function generatePDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    let logoImg: string | null = null;
    try {
      const resp = await fetch("/ebright-logo.png");
      if (resp.ok) {
        const blob = await resp.blob();
        logoImg = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    } catch { /* no logo available */ }

    // Header bar
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageW, 28, "F");

    let headerX = 14;
    if (logoImg) {
      doc.addImage(logoImg, "PNG", 14, 3, 55, 22);
      headerX = 74;
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("EMPLOYEE LIST", headerX, 14);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const filterLabels: string[] = [`${filtered.length} ${filtered.length === 1 ? "employee" : "employees"}`];
    if (orgUnit.startsWith("branch:")) {
      const code = orgUnit.slice("branch:".length);
      const b = branches.find((x) => x.code === code);
      filterLabels.push(`Branch: ${b?.name ?? code}`);
    } else if (orgUnit.startsWith("dept:")) {
      const code = orgUnit.slice("dept:".length);
      const d = departments.find((x) => x.code === code);
      filterLabels.push(`Dept: ${d?.name ?? code}`);
    }
    if (role) filterLabels.push(`Role: ${role}`);
    if (status) filterLabels.push(`Status: ${statusLabel(status)}`);
    if (search) filterLabels.push(`Search: "${search}"`);
    doc.text(filterLabels.join("  |  "), headerX, 21);

    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-MY")}`, pageW - 14, 21, { align: "right" });

    const startY = 38;

    const head = [["Emp ID", "Name", "Age", "Position", "Branch / Dept", "Email", "Phone"]];
    const body: string[][] = filtered.map((e) => [
      e.employeeId ?? "—",
      e.nickName ? `${e.fullName}\n${e.nickName}` : e.fullName,
      calculateAge(e.dob),
      e.role ?? "—",
      branchLabel(e),
      e.email,
      e.phone ?? "—",
    ]);

    if (body.length === 0) {
      body.push(["—", "No employees match the current filters.", "", "", "", "", ""]);
    }

    autoTable(doc, {
      startY,
      head,
      body,
      theme: "plain",
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        textColor: [51, 65, 85], // slate-700
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0,
        valign: "middle",
      },
      headStyles: {
        fillColor: [248, 250, 252], // slate-50
        textColor: [71, 85, 105], // slate-600
        fontStyle: "bold",
        fontSize: 8,
        // Force uppercase header look via cellPadding spacing (autotable doesn't
        // text-transform); titles are already uppercase in `head`.
        cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
        lineWidth: { bottom: 0.4 },
        lineColor: [203, 213, 225], // slate-300
      },
      bodyStyles: {
        lineWidth: { bottom: 0.1 },
        lineColor: [241, 245, 249], // slate-100 — barely-there row divider
      },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: "bold", textColor: [30, 41, 59] }, // Emp ID
        1: { cellWidth: 50 }, // Name
        2: { cellWidth: 14, halign: "center" }, // Age
        3: { cellWidth: 28 }, // Position
        4: { cellWidth: 44 }, // Branch / Dept
        5: { cellWidth: 56 }, // Email
        6: { cellWidth: "auto" }, // Phone
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text("Ebright HRMS — Confidential", 14, pageH - 6);
      doc.text(`Page ${i} of ${totalPages}`, pageW - 14, pageH - 6, { align: "right" });
    }

    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Employees</span>
        </nav>

        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">Employees</h1>
            <p className="mt-1 text-sm text-slate-500">
              {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
              {hasActiveFilters && (
                <>
                  {" "}·{" "}
                  <button onClick={clearFilters} className="text-blue-600 hover:underline">Clear filters</button>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generatePDF}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Export
            </button>
            <Link
              href="/dashboard-employee-management/new"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shadow-sm"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add Employee
            </Link>
          </div>
        </div>

        {overviewStats && (
          <EmployeeDashboardOverviewSection
            stats={overviewStats}
            activeBox={activeBox}
            onBoxClick={handleBoxClick}
          />
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setActiveBox(null); setPage(1); }}
                placeholder="Search by name, nickname, ID, or email"
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <OrgUnitSelect value={orgUnit} onChange={(v) => { setOrgUnit(v); setActiveBox(null); setPage(1); }} branches={branches} departments={departments} />

            <FilterSelect
              ariaLabel="Role"
              placeholder="All Roles"
              value={role}
              onChange={(v) => { setRole(v); setActiveBox(null); setPage(1); }}
              options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
            />

            <FilterSelect
              ariaLabel="Status"
              placeholder="All Status"
              value={status}
              onChange={(v) => { setStatus(v); setActiveBox(null); setPage(1); }}
              options={STATUS_OPTIONS}
            />

            <div className="relative">
              <button
                type="button"
                onClick={() => setAdvOpen(true)}
                aria-label="Advanced filters"
                className={`h-10 w-10 rounded-lg border flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${hasAdvFilters ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
              {hasAdvFilters && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white" />
              )}
            </div>
          </div>

          {pageRows.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} totalInDb={employees.length} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th scope="col" className="px-6 py-3">Employee</th>
                    <th scope="col" className="px-6 py-3">Role</th>
                    <th scope="col" className="px-6 py-3">Branch / Dept</th>
                    <th scope="col" className="px-6 py-3">Status</th>
                    <th scope="col" className="px-6 py-3">Start Date</th>
                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((e) => {
                    const statusKey = e.status ?? "";
                    return (
                      <tr key={e.id} className="group hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0">
                              {getInitials(e.fullName)}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate">{e.fullName}</div>
                              {e.pendingOnboarding ? (
                                <span className="inline-flex items-center mt-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                  Pending onboarding
                                </span>
                              ) : (
                                <div className="text-xs text-slate-500 tabular-nums truncate">
                                  {e.employeeId ?? "—"}{e.nickName ? ` · ${e.nickName}` : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          {e.role ? (
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 whitespace-nowrap">
                              {e.role}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          {e.branchCode === "HQ" ? (
                            <>
                              <div className="text-slate-900 font-medium">HQ</div>
                              <div className="text-xs text-slate-500 truncate">
                                {e.departmentName ?? e.departmentCode ?? ""}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-slate-900 font-medium">
                                {e.branchCode ?? e.departmentCode ?? "—"}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {e.branchName ?? e.departmentName ?? ""}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          {statusKey ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[statusKey] ?? STATUS_STYLES.inactive}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[statusKey] ?? STATUS_DOT.inactive}`} aria-hidden="true" />
                              {statusLabel(statusKey)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDate(e.startDate)}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <RowIconLink href={`/dashboard-employee-management/${e.id}`} label={`View ${e.fullName}`} Icon={Eye} />
                            <RowIconLink href={`/dashboard-employee-management/${e.id}/edit`} label={`Edit ${e.fullName}`} Icon={Pencil} />
                            <RowIconButton label={`Delete ${e.fullName}`} Icon={Trash2} danger onClick={() => setDeleteTarget(e)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
              <span className="tabular-nums">
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="tabular-nums px-2">Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRightLg className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <DeleteEmployeeModal
          target={deleteTarget}
          isDeleting={isDeleting}
          error={deleteError}
          onCancel={closeDeleteModal}
          onConfirm={confirmDelete}
        />
      )}

      {advOpen && (
        <AdvancedFiltersModal
          startFrom={startFrom} startTo={startTo}
          endFrom={endFrom} endTo={endTo}
          nullFields={nullFields}
          onStartFrom={setStartFrom} onStartTo={setStartTo}
          onEndFrom={setEndFrom} onEndTo={setEndTo}
          onNullFields={setNullFields}
          onClear={clearAdvFilters}
          onClose={() => setAdvOpen(false)}
        />
      )}
    </div>
  );
}

const NULL_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "employeeId",      label: "Employee ID" },
  { key: "nickName",        label: "Nickname" },
  { key: "phone",           label: "Phone" },
  { key: "dob",             label: "Date of Birth" },
  { key: "role",            label: "Role / Position" },
  { key: "branchCode",      label: "Branch" },
  { key: "departmentCode",  label: "Department" },
  { key: "startDate",       label: "Start Date" },
  { key: "endDate",         label: "End Date" },
  { key: "pendingOnboarding", label: "No profile set up" },
];

function AdvancedFiltersModal({
  startFrom, startTo, endFrom, endTo, nullFields,
  onStartFrom, onStartTo, onEndFrom, onEndTo, onNullFields,
  onClear, onClose,
}: {
  startFrom: string; startTo: string; endFrom: string; endTo: string;
  nullFields: string[];
  onStartFrom: (v: string) => void; onStartTo: (v: string) => void;
  onEndFrom: (v: string) => void; onEndTo: (v: string) => void;
  onNullFields: (v: string[]) => void;
  onClear: () => void; onClose: () => void;
}) {
  const fieldSet = new Set(nullFields);
  const toggleField = (key: string) => {
    const next = new Set(fieldSet);
    if (next.has(key)) next.delete(key); else next.add(key);
    onNullFields(Array.from(next));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" aria-label="Close" onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm focus:outline-none" />
      <div role="dialog" aria-modal="true" aria-labelledby="adv-filter-title"
        className="relative w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="adv-filter-title" className="text-base font-semibold text-slate-900">Advanced Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Start Date</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">From</label>
                <input type="date" value={startFrom} onChange={(e) => onStartFrom(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">To</label>
                <input type="date" value={startTo} onChange={(e) => onStartTo(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">End Date</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">From</label>
                <input type="date" value={endFrom} onChange={(e) => onEndFrom(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">To</label>
                <input type="date" value={endTo} onChange={(e) => onEndTo(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Show employees missing field</p>
            <p className="text-xs text-slate-500 mb-3">Tick fields — only employees missing all ticked fields will appear.</p>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {NULL_FIELD_OPTIONS.map(({ key, label }) => {
                const checked = fieldSet.has(key);
                return (
                  <label key={key}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleField(key)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0" />
                    <span className={`text-sm ${checked ? "text-blue-700 font-medium" : "text-slate-700"}`}>{label}</span>
                  </label>
                );
              })}
            </div>
            {fieldSet.size > 0 && (
              <p className="mt-2 text-xs text-blue-600 font-medium">
                {fieldSet.size} field{fieldSet.size > 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button type="button" onClick={onClear}
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Clear all
          </button>
          <button type="button" onClick={onClose}
            className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shadow-sm">
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteEmployeeModal({
  target,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: {
  target: EmployeeRow;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        disabled={isDeleting}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm focus:outline-none"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-desc"
        className="relative w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <CircleAlert className="w-5 h-5 text-red-600" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="delete-modal-title" className="text-base font-semibold text-slate-900">Delete employee?</h2>
              <p id="delete-modal-desc" className="mt-1 text-sm text-slate-600">
                Confirm to delete employee <span className="font-semibold text-slate-900">{target.fullName}</span>. This permanently removes their profile, employment, bank, and emergency contact records. This cannot be undone.
              </p>
              {error && (
                <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrgUnitSelect({
  value,
  onChange,
  branches,
  departments,
}: {
  value: string;
  onChange: (v: string) => void;
  branches: BranchOpt[];
  departments: DepartmentOpt[];
}) {
  return (
    <label className="relative">
      <span className="sr-only">Branch / Department</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer min-w-[200px]"
      >
        <option value="">All Branch / Dept</option>
        <optgroup label="Branches">
          {branches.map((b) => (
            <option key={`b-${b.id}`} value={`branch:${b.code}`}>{b.code} — {b.name}</option>
          ))}
        </optgroup>
        <optgroup label="Departments">
          {departments.map((d) => (
            <option key={`d-${d.id}`} value={`dept:${d.code}`}>{d.code} — {d.name}</option>
          ))}
        </optgroup>
      </select>
      <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
    </label>
  );
}

function FilterSelect({
  ariaLabel,
  placeholder,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer min-w-[160px]"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
    </label>
  );
}

function RowIconLink({ href, label, Icon }: { href: string; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </Link>
  );
}

function RowIconButton({ label, Icon, danger = false, onClick }: { label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; danger?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-white hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${danger ? "hover:text-red-600" : "hover:text-slate-900"}`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

function EmptyState({ hasFilters, onClear, totalInDb }: { hasFilters: boolean; onClear: () => void; totalInDb: number }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
        <UserPlus className="w-6 h-6 text-slate-500" aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">
        {hasFilters ? "No employees match these filters" : "No employees yet"}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        {hasFilters
          ? "Try adjusting your search or filters."
          : totalInDb === 0
            ? "Get started by adding your first employee."
            : "The employees we found don't have a matching profile yet."}
      </p>
      {hasFilters ? (
        <button onClick={onClear} className="mt-4 text-sm text-blue-600 font-medium hover:underline">
          Clear filters
        </button>
      ) : (
        <Link
          href="/dashboard-employee-management/new"
          className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Employee
        </Link>
      )}
    </div>
  );
}
