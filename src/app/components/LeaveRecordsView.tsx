import Link from "next/link";
import { Home, ChevronRight, Inbox, Hourglass } from "lucide-react";
import LeaveDetailButton from "@/app/components/LeaveDetailButton";

export interface LeaveRecordItem {
  leaveId: number;
  displayId: string;
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  rejectionReason: string | null;
  status: string;
  appliedAt: string;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending: { bg: "var(--tint-amber)", text: "var(--accent-amber-strong)", dot: "var(--accent-amber)", label: "Pending" },
  hod_approved: { bg: "var(--tint-blue)", text: "var(--status-blue-fg)", dot: "var(--accent-blue)", label: "HOD Approved" },
  approved: { bg: "var(--tint-green)", text: "var(--accent-green-strong)", dot: "var(--accent-green)", label: "Approved" },
  rejected: { bg: "var(--tint-red)", text: "var(--accent-red-strong)", dot: "var(--accent-red)", label: "Rejected" },
  cancelled: { bg: "var(--status-neutral-bg)", text: "var(--status-neutral-fg-strong)", dot: "var(--status-neutral-fg)", label: "Cancelled" },
};

// Donut slices, in order. Total is shown in the center, not as a slice.
const DONUT_ORDER = ["pending", "hod_approved", "approved", "rejected", "cancelled"] as const;

function RecordsDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const sum = DONUT_ORDER.reduce((acc, k) => acc + (counts[k] ?? 0), 0);

  let offset = 0;

  return (
    <div className="relative w-40 h-40 shrink-0">
      <svg viewBox="0 0 160 160" className="w-40 h-40 -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--status-neutral-bg)" strokeWidth="20" />
        {sum > 0 &&
          DONUT_ORDER.map((k) => {
            const value = counts[k] ?? 0;
            if (value === 0) return null;
            const length = (value / sum) * circumference;
            const slice = (
              <circle
                key={k}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={STATUS_STYLE[k].dot}
                strokeWidth="20"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return slice;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{total}</span>
        <span className="text-[11px] font-semibold tracking-widest text-slate-400">TOTAL</span>
      </div>
    </div>
  );
}

function formatMonth(ym: string): string {
  const d = new Date(ym + "-01T00:00:00");
  return `${d.toLocaleString("en-US", { month: "short" })} '${ym.slice(2, 4)}`;
}

interface MonthStat {
  month: string;
  count: number;
  label: string;
}

/** Simple dependency-free bar chart of leave requests per month. */
function LeaveStatsBar({ stats, maxCount }: { stats: MonthStat[]; maxCount: number }) {
  if (stats.length === 0) {
    return <p className="text-sm text-slate-400">No data to chart.</p>;
  }
  return (
    <div>
      <div className="flex items-end gap-2">
        {stats.map((s) => (
          <div
            key={s.month}
            className="flex-1 flex flex-col items-center justify-end gap-1"
            title={`${s.label}: ${s.count}`}
          >
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{s.count}</span>
            <div
              className="w-full rounded-t"
              style={{
                height: `${(s.count / maxCount) * 150}px`,
                maxWidth: "32px",
                minHeight: s.count > 0 ? "4px" : "0px",
                backgroundColor: "var(--accent-green)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
        {stats.map((s) => (
          <span key={s.month} className="flex-1 text-center text-[10px] text-slate-400">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LeaveRecordsView({
  scopeLabel,
  rows = [],
  canApprove = false,
}: {
  scopeLabel: string;
  rows?: LeaveRecordItem[];
  canApprove?: boolean;
}) {
  const counts: Record<string, number> = {
    pending: 0,
    hod_approved: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };
  for (const r of rows) {
    if (r.status in counts) counts[r.status] += 1;
  }

  // Leave volume per month (by start date), most recent 12 months with data.
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const m = r.startDate.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const stats: MonthStat[] = Array.from(byMonth.keys())
    .sort()
    .slice(-12)
    .map((m) => ({ month: m, count: byMonth.get(m) ?? 0, label: formatMonth(m) }));
  const maxCount = stats.reduce((mx, s) => Math.max(mx, s.count), 1);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10 space-y-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Attendance</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Records</span>
        </nav>

        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{scopeLabel}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Read-only view of submitted leave requests.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {canApprove && (
              <Link
                href="/attendance/leave/approvals"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Approvals
              </Link>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {rows.length} {rows.length === 1 ? "record" : "records"}
            </span>
          </div>
        </header>

        {canApprove && counts.hod_approved > 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <Hourglass className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span className="flex-1">
              {counts.hod_approved === 1
                ? "There is 1 request awaiting your final approval."
                : `There are ${counts.hod_approved} requests awaiting your final approval.`}
            </span>
            <Link
              href="/attendance/leave/approvals"
              className="shrink-0 inline-flex items-center justify-center rounded-lg bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-700 transition-colors"
            >
              Review
            </Link>
          </div>
        ) : (
          counts.pending > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <Hourglass className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>
                {counts.pending === 1
                  ? "There is 1 pending leave request awaiting approval."
                  : `There are ${counts.pending} pending leave requests awaiting approval.`}
              </span>
            </div>
          )
        )}

        {rows.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(300px, 420px) 1fr",
              gap: "1rem",
            }}
          >
            {/* Status donut */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-5 flex items-center gap-6">
              <RecordsDonut counts={counts} total={rows.length} />
              <ul className="space-y-2 min-w-0 flex-1">
                {DONUT_ORDER.map((k) => (
                  <li key={k} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: STATUS_STYLE[k].dot }}
                      aria-hidden="true"
                    />
                    <span className="text-slate-600 dark:text-slate-300">{STATUS_STYLE[k].label}</span>
                    <span className="ml-auto font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {counts[k] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Leave statistics (monthly trend) */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Leave Statistics</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Leave requests by month</p>
              <LeaveStatsBar stats={stats} maxCount={maxCount} />
            </section>
          </div>
        )}

        {rows.length === 0 ? (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-12 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">No leave records to show.</p>
          </section>
        ) : (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
                  <tr>
                    <th className="text-left px-6 py-3">ID</th>
                    <th className="text-left px-6 py-3">Employee</th>
                    <th className="text-left px-6 py-3">Department</th>
                    <th className="text-left px-6 py-3">Type</th>
                    <th className="text-left px-6 py-3">Dates</th>
                    <th className="text-left px-6 py-3">Days</th>
                    <th className="text-left px-6 py-3">Status</th>
                    <th className="text-left px-6 py-3">Applied</th>
                    <th className="text-right px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = STATUS_STYLE[r.status] ?? {
                      bg: "var(--status-neutral-bg)",
                      text: "var(--status-neutral-fg-strong)",
                      label: r.status,
                    };
                    return (
                      <tr key={r.leaveId} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">{r.displayId}</td>
                        <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{r.requesterName}</td>
                        <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{r.departmentName ?? "—"}</td>
                        <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{r.leaveTypeName}</td>
                        <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{r.startDate} → {r.endDate}</td>
                        <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{r.totalDays}</td>
                        <td className="px-6 py-3">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: s.bg, color: s.text }}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{r.appliedAt.slice(0, 10)}</td>
                        <td className="px-6 py-3 text-right">
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
                              requesterName: r.requesterName,
                              departmentName: r.departmentName,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
