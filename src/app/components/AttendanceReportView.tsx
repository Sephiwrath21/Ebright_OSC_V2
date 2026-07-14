"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CalendarX,
  Plane,
  Timer,
  Hash,
  Building2,
  Briefcase,
  MapPin,
  CalendarClock,
  RefreshCw,
  Home,
  ChevronRight,
} from "lucide-react";

export interface BranchOption {
  code: string;
  name: string;
}
export interface DepartmentOption {
  code: string;
  name: string;
}
export interface EmployeeOption {
  userId: number;
  name: string;
  branchCode: string | null;
}
export interface MonthOption {
  value: string;
  label: string;
}

export interface DayRow {
  day: number;
  dayName: string;
  date: string;
  isoDate: string;
  checkIn: string | null;
  checkOut: string | null;
  duration: string | null;
  status: "present" | "no_record" | "weekend" | "leave";
  late?: boolean;
  leftEarly?: boolean;
  leaveCode?: string | null;
}

export interface EmployeeContext {
  userId: number;
  name: string | null;
  position: string | null;
  department: string | null;
  role: string | null;
  location: string | null;
  branchCode: string | null;
  /** HRFS BranchStaff.id — when present, the Schedule link opens the editor. */
  branchStaffId: number | null;
  employeeCode: string | null;
}

interface Summary {
  present: number;
  noRecord: number;
  onLeave: number;
  /** Count of days with a late clock-in (in the active window). */
  late: number;
  /** Count of days with a left-early clock-out. */
  leftEarly: number;
  totalHours: string | null;
  /** Raw seconds for the % bar / sub-caption. */
  totalSeconds?: number;
}

interface Props {
  branches: BranchOption[];
  departments: DepartmentOption[];
  employees: EmployeeOption[];
  months: MonthOption[];
  rows: DayRow[];
  employee: EmployeeContext | null;
  selectedBranch: string;
  selectedDept: string;
  selectedEmployeeId: number | null;
  selectedMonth: string;
  monthLabel: string;
  selectedDate: string;
  dateLabel: string | null;
  restrictToSelf?: boolean;
  summary: Summary;
}

const STATUS_BADGE: Record<
  DayRow["status"],
  { bg: string; text: string; dot: string; label: string }
> = {
  present:   { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Present"   },
  no_record: { bg: "bg-rose-50",    text: "text-rose-600",    dot: "bg-rose-500",    label: "No Record" },
  weekend:   { bg: "bg-stone-100",  text: "text-stone-500",   dot: "bg-stone-400",   label: "Weekend"   },
  leave:     { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500",  label: "On Leave"  },
};

export default function AttendanceReportView({
  branches,
  departments,
  employees,
  months,
  rows,
  employee,
  selectedBranch,
  selectedDept,
  selectedEmployeeId,
  selectedMonth,
  monthLabel,
  selectedDate,
  dateLabel,
  restrictToSelf = false,
  summary,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const updateParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (selectedBranch) params.set("branch", selectedBranch);
    if (selectedDept) params.set("dept", selectedDept);
    if (selectedEmployeeId != null) params.set("employeeId", String(selectedEmployeeId));
    if (selectedMonth) params.set("month", selectedMonth);
    if (selectedDate) params.set("date", selectedDate);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => {
      router.replace(`/attendance/report?${params.toString()}`);
    });
  };

  const onRefresh = () => startTransition(() => router.refresh());

  const onMonthChange = (m: string | null) => {
    updateParams({ month: m, date: null });
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-16 space-y-5">
        {/* Breadcrumb — same pattern as /attendance landing page. */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance" className="hover:text-slate-900 transition-colors">Attendance</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Report</span>
        </nav>

        {/* Header */}
        <header className="flex items-start gap-4">
          <Link
            href="/attendance"
            className="inline-flex items-center gap-1.5 mt-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Attendance Report</h1>
            <p className="mt-1 text-sm text-slate-500">
              Monthly attendance breakdown · Pulled live from scanner logs
            </p>
          </div>
        </header>

        {/* Stat cards (top-border accent) */}
        <section className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <StatCard label="Days Present" value={summary.present} Icon={CheckCircle2} accent="emerald" />
          <StatCard label="No Record"    value={summary.noRecord} Icon={CalendarX}   accent="rose" />
          <StatCard label="On Leave"     value={summary.onLeave}  Icon={Plane}       accent="blue" />
          <StatCard
            label="Total Hours"
            value={summary.totalHours ?? "—"}
            mono={!!summary.totalHours}
            Icon={Timer}
            accent="amber"
            caption={summary.totalHours ?? undefined}
          />
        </section>

        {/* Main grid: sidebar + table */}
        <div className="grid gap-5" style={{ gridTemplateColumns: "320px minmax(0, 1fr)" }}>
          {/* Sidebar */}
          <aside className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-5 py-5 border-b-2 border-blue-500/80">
              <span className="w-1 h-6 rounded-full bg-blue-500" aria-hidden="true" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Employee</h2>
                <p className="text-xs font-medium text-slate-500 mt-0.5">Pick the staff member and period</p>
              </div>
            </div>

            <div className={`p-5 space-y-4 ${isPending ? "opacity-60" : ""}`}>
              {!restrictToSelf && (
                <Field icon={<MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Branch">
                  <select
                    value={selectedBranch}
                    onChange={(e) => updateParams({ branch: e.target.value || null, dept: null, employeeId: null })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All branches</option>
                    {branches.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {!restrictToSelf && selectedBranch === "HQ" && departments.length > 0 && (
                <Field icon={<Building2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Department">
                  <select
                    value={selectedDept}
                    onChange={(e) => updateParams({ dept: e.target.value || null, employeeId: null })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field icon={<Briefcase className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Name">
                <select
                  value={selectedEmployeeId ?? ""}
                  onChange={(e) => updateParams({ employeeId: e.target.value || null })}
                  disabled={restrictToSelf || employees.length === 0}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {employees.length === 0 && <option value="">No employees</option>}
                  {employees.map((e) => (
                    <option key={e.userId} value={e.userId}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Employee detail card */}
              {employee && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <dl className="text-sm divide-y divide-slate-200">
                    <DetailRow icon={<Hash className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Employee ID">
                      <span className="font-mono text-xs text-slate-900">{employee.employeeCode ?? "—"}</span>
                    </DetailRow>
                    <DetailRow icon={<Building2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Department">
                      <span className="font-semibold text-slate-900">{employee.department ?? "—"}</span>
                    </DetailRow>
                    <DetailRow icon={<Briefcase className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Role">
                      <span className="font-semibold text-slate-900">{employee.position ?? employee.role ?? "—"}</span>
                    </DetailRow>
                    <DetailRow icon={<MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Location">
                      <span className="text-slate-700">{employee.location ?? "—"}</span>
                    </DetailRow>
                    <DetailRow icon={<CalendarClock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />} label="Schedule">
                      {employee.branchStaffId !== null ? (
                        <Link
                          href={`/attendance/working-hours?staffId=${employee.branchStaffId}`}
                          className="text-emerald-600 font-bold hover:text-emerald-700 hover:underline underline-offset-2"
                        >
                          Set
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </DetailRow>
                  </dl>
                  <div className="flex items-center gap-2 px-3 py-3 border-t border-slate-200 bg-white">
                    <CountChip count={summary.late} label="late" tone="rose" />
                    <CountChip count={summary.leftEarly} label="left early" tone="amber" />
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Main table */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b-2 border-blue-500/80">
              <div className="flex items-center gap-3">
                <span className="w-1 h-6 rounded-full bg-blue-500" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {dateLabel ?? monthLabel}
                  </h2>
                  <p className="text-xs font-medium text-slate-500 mt-0.5 uppercase tracking-wider">
                    {employee?.name ?? "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Month nav */}
                <select
                  value={selectedMonth}
                  onChange={(e) => onMonthChange(e.target.value || null)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-400"
                >
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} aria-hidden="true" />
                  Refresh
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="text-left px-6 py-3 w-[8%]">No.</th>
                    <th className="text-left px-3 py-3 w-[10%]">Day</th>
                    <th className="text-left px-3 py-3 w-[14%]">Date</th>
                    <th className="text-left px-3 py-3 w-[17%]">Clock In</th>
                    <th className="text-left px-3 py-3 w-[17%]">Clock Out</th>
                    <th className="text-left px-3 py-3 w-[14%]">Duration</th>
                    <th className="text-right px-6 py-3 w-[20%]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-sm font-medium text-slate-400">
                        No data for this selection.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const badge = STATUS_BADGE[r.status];
                      const dim = r.status === "weekend" || r.status === "no_record";
                      return (
                        <tr key={r.isoDate} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-colors">
                          <td className={`px-6 py-4 tabular-nums text-sm ${dim ? "text-slate-400" : "text-slate-500"}`}>
                            {i + 1}
                          </td>
                          <td className={`px-3 py-4 text-sm ${dim ? "text-slate-500" : "text-blue-600 font-bold"}`}>
                            {r.dayName}
                          </td>
                          <td className={`px-3 py-4 font-mono tabular-nums text-sm ${dim ? "text-slate-400" : "text-slate-700"}`}>
                            {r.date}
                          </td>
                          <td className="px-3 py-4 font-mono tabular-nums text-sm">
                            {r.checkIn ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className={r.late ? "text-rose-700 font-bold" : "text-slate-900"}>{r.checkIn}</span>
                                {r.late && <ChipBadge tone="rose">Late</ChipBadge>}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-4 font-mono tabular-nums text-sm">
                            {r.checkOut ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className={r.leftEarly ? "text-amber-700 font-bold" : "text-slate-900"}>{r.checkOut}</span>
                                {r.leftEarly && <ChipBadge tone="amber">Left Early</ChipBadge>}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-4 font-mono tabular-nums text-sm">
                            {r.duration ? (
                              <span className="text-slate-700">{r.duration}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${badge.bg} ${badge.text}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
                              {r.status === "leave" && r.leaveCode ? r.leaveCode : badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-500">
              Hours = clock-out − clock-in · Late / Left Early are judged against the working-hours schedule active that day.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

const STAT_ACCENT = {
  blue: { bar: "bg-blue-500", tile: "bg-blue-50", icon: "text-blue-600", text: "text-blue-600" },
  emerald: { bar: "bg-emerald-500", tile: "bg-emerald-50", icon: "text-emerald-600", text: "text-emerald-600" },
  amber: { bar: "bg-amber-500", tile: "bg-amber-50", icon: "text-amber-600", text: "text-amber-600" },
  rose: { bar: "bg-rose-500", tile: "bg-rose-50", icon: "text-rose-600", text: "text-rose-600" },
} as const;

function StatCard({
  label,
  value,
  Icon,
  accent,
  caption,
  mono,
}: {
  label: string;
  value: number | string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: keyof typeof STAT_ACCENT;
  caption?: string;
  mono?: boolean;
}) {
  const a = STAT_ACCENT[accent];
  return (
    <div className="relative bg-white border border-slate-200 rounded-2xl shadow-sm p-5 pt-6 overflow-hidden">
      <span className={`absolute top-0 left-0 right-0 h-1 ${a.bar}`} aria-hidden="true" />
      <span className={`absolute top-1 left-1/4 right-1/4 h-2 ${a.bar} opacity-30 blur-md rounded-full`} aria-hidden="true" />
      <div className="flex items-start gap-4">
        <div className={`${a.tile} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${a.icon}`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className={`text-4xl font-bold tracking-tight ${mono ? "font-mono" : "tabular-nums"} ${a.text}`}>
            {value}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
          {caption && <p className="mt-0.5 text-xs text-slate-400 font-mono">{caption}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="text-right truncate">{children}</dd>
    </div>
  );
}

function CountChip({ count, label, tone }: { count: number; label: string; tone: "rose" | "amber" }) {
  const styles = tone === "rose" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200";
  const dot = tone === "rose" ? "bg-rose-500" : "bg-amber-500";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${styles}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className="tabular-nums">{count}</span> {label}
    </span>
  );
}

function ChipBadge({ tone, children }: { tone: "rose" | "amber"; children: React.ReactNode }) {
  const styles = tone === "rose" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles}`}>
      {children}
    </span>
  );
}
