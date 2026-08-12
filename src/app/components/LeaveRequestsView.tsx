"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Home,
  ChevronRight,
  Search,
  Plus,
  Umbrella,
  Inbox,
  Hourglass,
  User,
  Users,
} from "lucide-react";
import HodApprovalTable, { type HodApprovalItem } from "@/app/components/HodApprovalTable";
import LeaveDetailButton from "@/app/components/LeaveDetailButton";

export interface LeaveRow {
  leaveId: number;
  displayId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  rejectionReason: string | null;
  status: string;
  appliedAt: string;
  employeeName?: string;
}

export interface LeaveStatusCounts {
  total: number;
  pending: number;
  hod_approved: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending: { bg: "var(--tint-amber)", text: "var(--accent-amber-strong)", dot: "var(--accent-amber)", label: "Pending" },
  hod_approved: { bg: "var(--tint-blue)", text: "var(--status-blue-fg)", dot: "var(--accent-blue)", label: "HOD Approved" },
  approved: { bg: "var(--tint-green)", text: "var(--accent-green-strong)", dot: "var(--accent-green)", label: "Approved" },
  rejected: { bg: "var(--tint-red)", text: "var(--accent-red-strong)", dot: "var(--accent-red)", label: "Rejected" },
  cancelled: { bg: "var(--status-neutral-bg)", text: "var(--status-neutral-fg-strong)", dot: "var(--status-neutral-fg)", label: "Cancelled" },
};

const statCards = [
  { key: "total", label: "TOTAL", dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-200 bg-blue-50/40 dark:ring-blue-800 dark:bg-blue-900/40" },
  { key: "pending", label: "PENDING", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", ring: "" },
  { key: "hod_approved", label: "HOD APPROVED", dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", ring: "" },
  { key: "approved", label: "APPROVED", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", ring: "" },
  { key: "rejected", label: "REJECTED", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", ring: "" },
  { key: "cancelled", label: "CANCELLED", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300", ring: "" },
] as const;

// Segments shown in the donut (total is rendered in the center, not as a slice).
const DONUT_SEGMENTS = [
  { key: "pending", label: "Pending", color: STATUS_BADGE.pending.dot },
  { key: "hod_approved", label: "HOD Approved", color: STATUS_BADGE.hod_approved.dot },
  { key: "approved", label: "Approved", color: STATUS_BADGE.approved.dot },
  { key: "rejected", label: "Rejected", color: STATUS_BADGE.rejected.dot },
  { key: "cancelled", label: "Cancelled", color: STATUS_BADGE.cancelled.dot },
] as const;

function StatusDonut({ counts }: { counts: Record<string, number> }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const sum = DONUT_SEGMENTS.reduce((acc, s) => acc + (counts[s.key] ?? 0), 0);

  let offset = 0;

  return (
    <div className="relative w-40 h-40 shrink-0">
      <svg viewBox="0 0 160 160" className="w-40 h-40 -rotate-90">
        {/* Track */}
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--status-neutral-bg)" strokeWidth="20" />
        {sum > 0 &&
          DONUT_SEGMENTS.map((s) => {
            const value = counts[s.key] ?? 0;
            if (value === 0) return null;
            const length = (value / sum) * circumference;
            const circle = (
              <circle
                key={s.key}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="20"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return circle;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{counts.total ?? 0}</span>
        <span className="text-[11px] font-semibold tracking-widest text-slate-400">TOTAL</span>
      </div>
    </div>
  );
}

export default function LeaveRequestsView({
  rows = [],
  counts,
  canApprove = false,
  viewerIsHod = false,
  approvalItems = [],
}: {
  rows?: LeaveRow[];
  counts?: LeaveStatusCounts;
  canApprove?: boolean;
  viewerIsHod?: boolean;
  approvalItems?: HodApprovalItem[];
}) {
  // True when the row set spans multiple employees (e.g. HR/superadmin
  // "view all" mode) rather than just the current user's own requests.
  // ASSUMPTION: derived from row shape since no explicit prop is passed in —
  // confirm this matches intent, or wire an explicit `viewOnly` prop instead.
  const viewOnly = rows.some((r) => r.employeeName != null);

  // A HOD's own request skips the HOD stage and goes straight to HR, so the
  // "HOD Approved" state never reflects a real HOD approval for them — show it
  // as awaiting HR instead.
  const hodApprovedLabel = viewerIsHod ? "Awaiting HR" : "HOD Approved";
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [tab, setTab] = useState<"mine" | "approve">("mine");

  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.leaveTypeCode)) seen.set(r.leaveTypeCode, r.leaveTypeName);
    }
    return Array.from(seen, ([code, name]) => ({ code, name }));
  }, [rows]);

  const monthOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.startDate.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.leaveTypeCode !== typeFilter) return false;
      if (monthFilter && !r.startDate.startsWith(monthFilter)) return false;
      if (!q) return true;
      return (
        r.displayId.toLowerCase().includes(q) ||
        r.leaveTypeName.toLowerCase().includes(q) ||
        (r.reason?.toLowerCase().includes(q) ?? false) ||
        (r.employeeName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, statusFilter, typeFilter, monthFilter]);

  const displayCounts: Record<string, number> = {
    total: counts?.total ?? 0,
    pending: counts?.pending ?? 0,
    hod_approved: counts?.hod_approved ?? 0,
    approved: counts?.approved ?? 0,
    rejected: counts?.rejected ?? 0,
    cancelled: counts?.cancelled ?? 0,
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10 space-y-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Attendance</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Leave</span>
        </nav>

        {/* Unified header: title + CTA in one row */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              {tab === "approve" && canApprove
                ? "Leave Approvals"
                : viewOnly ? "All Leave Requests" : "Leave Requests"}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {tab === "approve" && canApprove
                ? "Review and respond to leave requests from your team."
                : viewOnly
                  ? "Read-only view of every employee's leave requests."
                  : "Apply for leave and track the status of your requests."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {tab === "mine" && !viewOnly && (
              <Link
                href="/attendance/leave/new"
                className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Apply for Leave
              </Link>
            )}
          </div>
        </header>

        {canApprove && (
          <div className="flex justify-end">
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setTab("mine")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors ${
                tab === "mine" ? "bg-emerald-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <User className="w-4 h-4" aria-hidden="true" />
              {viewOnly ? "All Requests" : "My Requests"}
            </button>
            <button
              type="button"
              onClick={() => setTab("approve")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors ${
                tab === "approve" ? "bg-emerald-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              To Approve{approvalItems.length > 0 ? ` (${approvalItems.length})` : ""}
            </button>
            </div>
          </div>
        )}

        {canApprove && approvalItems.length > 0 && tab !== "approve" && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <Hourglass className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span className="flex-1">
              {approvalItems.length === 1
                ? "There is 1 pending leave request awaiting your approval."
                : `There are ${approvalItems.length} pending leave requests awaiting your approval.`}
            </span>
            <button
              type="button"
              onClick={() => setTab("approve")}
              className="shrink-0 inline-flex items-center justify-center rounded-lg bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-700 transition-colors"
            >
              Review
            </button>
          </div>
        )}

        {tab === "mine" && (
          <>
        {/* Status overview */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 360px) 1fr",
            gap: "1rem",
          }}
        >
          {/* Donut chart */}
          <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 flex items-center gap-6">
            <StatusDonut counts={displayCounts} />
            <ul className="space-y-2 min-w-0">
              {DONUT_SEGMENTS.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="text-slate-600">
                    {s.key === "hod_approved" ? hodApprovedLabel : s.label}
                  </span>
                  <span className="ml-auto font-semibold text-slate-900 tabular-nums">
                    {displayCounts[s.key]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Status cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "1rem",
            }}
          >
            {statCards
              .filter((card) => card.key !== "total")
              .map((card) => {
                const value = displayCounts[card.key];
                return (
                  <div
                    key={card.key}
                    className={`bg-white border border-slate-200 rounded-2xl px-5 py-4 ${card.ring}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${card.dot}`} aria-hidden="true" />
                      <p className="text-[11px] font-semibold tracking-widest text-slate-500">
                        {card.key === "hod_approved"
                          ? hodApprovedLabel.toUpperCase()
                          : card.label}
                      </p>
                    </div>
                    <p className={`mt-2 text-3xl font-bold ${card.text}`}>{value}</p>
                  </div>
                );
              })}
          </div>
        </section>

        {/* Filters */}
        <section className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ID, type, or reason…"
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36"
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by leave type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-40"
          >
            <option value="">All Types</option>
            {typeOptions.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36"
          >
            <option value="">All Months</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(m + "-01").toLocaleString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>
        </section>

        {/* Leave table */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Umbrella className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                {viewOnly ? "All Leave Requests" : "My Leave Requests"}
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              {filtered.length} {filtered.length === 1 ? "record" : "records"}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-6 py-3">ID</th>
                  {viewOnly && <th className="text-left px-6 py-3">Employee</th>}
                  <th className="text-left px-6 py-3">Type</th>
                  <th className="text-left px-6 py-3">From</th>
                  <th className="text-left px-6 py-3">To</th>
                  <th className="text-left px-6 py-3">Days</th>
                  <th className="text-left px-6 py-3">Reason</th>
                  <th className="text-left px-6 py-3">Applied</th>
                  <th className="text-left px-6 py-3">Status</th>
                  <th className="text-right px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={viewOnly ? 10 : 9} className="px-6 py-20">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                          <Inbox className="w-6 h-6 text-slate-400" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">
                            {rows.length === 0
                              ? viewOnly
                                ? "No leave requests in the system yet"
                                : "No leave requests yet"
                              : "No requests match your filters"}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {rows.length === 0
                              ? viewOnly
                                ? "Submitted requests will appear here."
                                : "Apply for leave to see it listed here."
                              : "Try adjusting the search or filters."}
                          </p>
                        </div>
                        {rows.length === 0 && !viewOnly && (
                          <Link
                            href="/attendance/leave/new"
                            className="mt-2 inline-flex items-center gap-2 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                            Apply for Leave
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const baseBadge = STATUS_BADGE[r.status] ?? {
                      bg: "#F1F5F9",
                      text: "#334155",
                      dot: "#64748B",
                      label: r.status,
                    };
                    const badge =
                      r.status === "hod_approved"
                        ? { ...baseBadge, label: hodApprovedLabel }
                        : baseBadge;
                    return (
                      <tr
                        key={r.leaveId}
                        className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="px-6 py-4 font-semibold text-emerald-700">
                          {r.displayId}
                        </td>
                        {viewOnly && (
                          <td className="px-6 py-4 text-slate-700 truncate max-w-[200px]" title={r.employeeName ?? ""}>
                            {r.employeeName ?? <span className="text-slate-400">—</span>}
                          </td>
                        )}
                        <td className="px-6 py-4 text-slate-700 font-medium tabular-nums" title={r.leaveTypeName}>
                          {r.leaveTypeCode.toUpperCase()}
                        </td>
                        <td className="px-6 py-4 text-slate-600 tabular-nums">
                          {new Date(r.startDate).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-6 py-4 text-slate-600 tabular-nums">
                          {new Date(r.endDate).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900 tabular-nums">
                          {r.totalDays}
                        </td>
                        <td className="px-6 py-4 text-slate-600 max-w-[240px] truncate" title={r.reason ?? ""}>
                          {r.reason ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-6 py-4 text-slate-500 tabular-nums">
                          {new Date(r.appliedAt).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                            style={{ backgroundColor: badge.bg, color: badge.text }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: badge.dot }}
                              aria-hidden="true"
                            />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <LeaveDetailButton
                            detail={{
                              displayId: r.displayId,
                              leaveTypeName: r.leaveTypeName,
                              startDate: r.startDate,
                              endDate: r.endDate,
                              totalDays: r.totalDays,
                              status: r.status,
                              appliedAt: r.appliedAt,
                              reason: r.reason,
                              rejectionReason: r.rejectionReason,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
          </>
        )}

        {tab === "approve" && canApprove && <HodApprovalTable items={approvalItems} />}
      </div>
    </div>
  );
}
