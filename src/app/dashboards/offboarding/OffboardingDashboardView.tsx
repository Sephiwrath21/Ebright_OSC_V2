"use client";

import Link from "next/link";
import { initialsFromName } from "@/lib/text";
import { useState, type ComponentType, type SVGProps } from "react";
import {
  ChevronRight,
  Home,
  Users,
  AlertCircle,
  CheckCircle2,
  CalendarClock,
  ArrowLeft,
} from "lucide-react";
import type {
  OffboardingCaseRow,
  OffboardingStats,
  OffboardingStage,
} from "@/lib/offboarding/queries";

interface Props {
  cases: OffboardingCaseRow[];
  stats: OffboardingStats;
  /** Logged-in user id — drives the "My Cases" assignment filter. */
  currentUserId: number;
}

const STAGE_LABEL: Record<OffboardingStage, string> = {
  Trigger: "Trigger",
  HRReview: "HR Review",
  ExitInterview: "Exit Interview",
  Checklist: "Checklist",
  SignOff: "Sign-off",
  Done: "Done",
};

const STAGE_PILL: Record<OffboardingStage, string> = {
  Trigger: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  HRReview: "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  ExitInterview: "bg-violet-50 text-violet-700 dark:bg-violet-900 dark:text-violet-200",
  Checklist: "bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  SignOff: "bg-rose-50 text-rose-700 dark:bg-rose-900 dark:text-rose-200",
  Done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
};

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function OffboardingDashboardView({ cases, stats, currentUserId }: Props) {
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [assignment, setAssignment] = useState<"all" | "mine">("all");

  const filtered = cases.filter((c) => {
    if (assignment === "mine" && c.assignedHrId !== currentUserId) return false;
    if (filter === "active") return c.status !== "Completed";
    if (filter === "completed") return c.status === "Completed";
    return true;
  });

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        {/* ── BREADCRUMB ── */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Offboarding</span>
        </nav>

        {/* ── HEADER ── */}
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Offboarding
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Manage employee exits — resignations and contract endings.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Create flow coming in Phase 2"
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-300 px-4 py-2 text-xs font-semibold text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
          >
            ＋ New Offboarding
          </button>
        </header>

        {/* ── 4 STAT CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Active"
            value={stats.totalActive}
            subtitle="Open cases"
            accentClass="bg-blue-500"
            Icon={Users}
          />
          <StatCard
            label="Pending Action"
            value={stats.pendingAction}
            subtitle="Awaiting HR / Supervisor / Finance"
            accentClass="bg-amber-500"
            Icon={AlertCircle}
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            subtitle="This cycle"
            accentClass="bg-emerald-500"
            Icon={CheckCircle2}
          />
          <StatCard
            label="Ending Soon"
            value={stats.endingSoon}
            subtitle="Last day ≤ 30 days"
            accentClass="bg-rose-500"
            Icon={CalendarClock}
          />
        </div>

        {/* ── ASSIGNMENT FILTER (All / My Cases) ── */}
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setAssignment("all")}
            className={`rounded-md px-3 py-1.5 transition ${
              assignment === "all" ? "bg-blue-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            }`}
          >
            All Cases
          </button>
          <button
            type="button"
            onClick={() => setAssignment("mine")}
            className={`rounded-md px-3 py-1.5 transition ${
              assignment === "mine" ? "bg-blue-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            }`}
          >
            My Cases
          </button>
        </div>

        {/* ── FILTER TABS ── */}
        <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-0">
          <TabButton label="All" active={filter === "all"} onClick={() => setFilter("all")} count={cases.length} />
          <TabButton label="Active" active={filter === "active"} onClick={() => setFilter("active")} count={cases.filter((c) => c.status !== "Completed").length} />
          <TabButton label="Completed" active={filter === "completed"} onClick={() => setFilter("completed")} count={stats.completed} />
        </div>

        {/* ── CASE TABLE ── */}
        <section aria-labelledby="cases-heading" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 id="cases-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {filter === "all" ? "All offboarding cases" : filter === "active" ? "Active cases" : "Completed cases"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {filtered.length} case{filtered.length === 1 ? "" : "s"}
            </p>
          </header>

          {filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 dark:bg-slate-800 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employee</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Department</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Day</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stage</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">HR Officer</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Supervisor</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider sr-only">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0 dark:bg-slate-700 dark:text-slate-200"
                            aria-hidden="true"
                          >
                            {initialsFromName(c.employeeName)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{c.employeeName}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.employeeEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          c.caseType === "Resign"
                            ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:border-violet-700"
                            : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700"
                        }`}>
                          {c.caseType === "Resign" ? "Resign" : "Contract Ended"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">{c.departmentName ?? "—"}</td>
                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{formatLongDate(c.lastWorkingDay)}</div>
                        {c.daysUntilLastDay !== null && c.status !== "Completed" && (
                          <div className={`text-[10px] mt-0.5 ${
                            c.daysUntilLastDay < 0
                              ? "text-slate-400"
                              : c.daysUntilLastDay <= 7
                                ? "text-rose-600 font-semibold dark:text-rose-400"
                                : c.daysUntilLastDay <= 30
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-slate-500 dark:text-slate-400"
                          }`}>
                            {c.daysUntilLastDay < 0
                              ? `${Math.abs(c.daysUntilLastDay)}d ago`
                              : c.daysUntilLastDay === 0
                                ? "Today"
                                : `in ${c.daysUntilLastDay}d`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${STAGE_PILL[c.currentStage]}`}>
                          {STAGE_LABEL[c.currentStage]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">{c.assignedHrName ?? "—"}</td>
                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">{c.supervisorName ?? "—"}</td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/dashboards/offboarding/${c.id}`}
                          className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Phase note */}
        <p className="mt-4 text-[11px] text-slate-400 italic">
          Read-only preview. Create flow, supervisor sign-off, finance remarks, and staff view land in
          subsequent phases. <Link href="/dashboards/hrms" className="text-blue-500 hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" aria-hidden="true" /> Back to HRMS</Link>
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function StatCard({
  label,
  value,
  subtitle,
  accentClass,
  Icon,
}: {
  label: string;
  value: number;
  subtitle: string;
  accentClass: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${accentClass}`} aria-hidden="true" />
      <Icon className="absolute top-3 right-3 w-10 h-10 text-slate-200 dark:text-slate-700 pointer-events-none" aria-hidden="true" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{value}</p>
      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold rounded-t-md transition flex items-center gap-2 ${
        active
          ? "bg-white text-blue-700 border border-slate-200 border-b-white -mb-px dark:bg-slate-900 dark:text-blue-400 dark:border-slate-800 dark:border-b-slate-900"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      <span>{label}</span>
      <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
        active ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
      }`}>
        {count}
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "Completed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
        <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
        Completed
      </span>
    );
  }
  if (status === "InProgress") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300">
        <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
      <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
      Pending
    </span>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-4xl mb-3" aria-hidden="true">📋</p>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No offboarding cases yet</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
        Cases will appear here once the create flow is wired up (Phase 2). Two trigger types
        will be supported: staff resignation (uploads a letter) and contract-end auto-flagging
        (30 days before end date).
      </p>
    </div>
  );
}
