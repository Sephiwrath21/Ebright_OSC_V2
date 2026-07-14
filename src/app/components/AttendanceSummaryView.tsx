"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  MapPin,
  Radio,
  RadioReceiver,
  Users,
  UserCheck,
  UserX,
  LogOut,
  Info,
  Search,
  RefreshCw,
  Calendar as CalendarIcon,
  Database,
  AlertTriangle,
  AlertCircle,
  Clock,
  CheckCircle2,
  Edit3,
  Home,
  ChevronRight,
} from "lucide-react";
import JustificationModal, { type JustificationTarget } from "@/app/components/JustificationModal";

export type BranchOption = {
  branch_id: number;
  branch_name: string;
  branch_code: string | null;
};

// Absence categorisation for staff scheduled today who didn't scan:
//   missing   = no scan, no leave record, no HR justification
//   on_leave  = has a leave record whose code is NOT the "unpaid" code
//   mia       = leave code matches the unpaid code (UL in this portal)
//   justified = HR entered an attendance_justification row for this day
// null        = the person scanned today (handled by check_in/check_out fields).
export type AbsenceKind = "missing" | "on_leave" | "mia" | "justified" | null;

export type AttendanceRow = {
  user_id: number;
  name: string;
  employee_code: string | null;
  department: string | null;
  position: string | null;
  check_in: string | null;
  check_out: string | null;
  in_status: "on_time" | "late" | null;
  out_status: "normal" | "early" | null;
  scans: number;
  home_branch_code: string | null;
  visiting_from: string | null;
  absence_kind: AbsenceKind;
  leave_type_code: string | null;
  leave_type_name: string | null;
  /** Existing HR justification, if any — drives the edit-modal pre-fill. */
  justification: { id: number; reason: string; note: string | null } | null;
};

export type SummaryData = {
  branches: BranchOption[];
  selectedBranch: BranchOption | null;
  selectedDate: string;
  counts: {
    scanned: number;
    currentlyIn: number;
    checkedOut: number;
    missing: number;
    onLeave: number;
    mia: number;
    justified: number;
    totalEmployees: number;
  };
  scannerOnline: boolean;
  lastSyncedIso: string | null;
  recordsToday: number;
  rows: AttendanceRow[];
  /** Whether the current viewer can add/edit HR justifications. */
  canJustify: boolean;
};

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const DATE_SHORT_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  weekday: "short",
  day: "2-digit",
  month: "short",
});

type StatusFilter =
  | "scanned"
  | "currentlyIn"
  | "checkedOut"
  | "missing"
  | "justified";

const STATUS_PREDICATES: Record<StatusFilter, (r: AttendanceRow) => boolean> = {
  scanned:     (r) => Boolean(r.check_in || r.check_out),
  currentlyIn: (r) => Boolean(r.check_in && !r.check_out),
  checkedOut:  (r) => Boolean(r.check_in && r.check_out),
  missing:     (r) => r.absence_kind === "missing",
  justified:   (r) => r.absence_kind === "justified",
};

export default function AttendanceSummaryView({ data }: { data: SummaryData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [pulling, setPulling] = useState(false);
  const [justifyTarget, setJustifyTarget] = useState<JustificationTarget | null>(null);

  const openJustify = (row: AttendanceRow) => {
    if (!data.canJustify) return;
    if (!row.employee_code) {
      // Without an emp_no we can't write to HRFS attendance_justification
      // (the natural key). Silently skip — the button shouldn't be visible
      // for rows without an empNo anyway.
      return;
    }
    setJustifyTarget({
      empNo: row.employee_code,
      employeeName: row.name,
      branch: row.home_branch_code,
      date: data.selectedDate,
      // Existing reason text — null when no row exists, string when editing.
      existingReason: row.justification?.reason ?? null,
    });
  };

  const selectedBranchId = data.selectedBranch?.branch_id ?? null;
  const isAllBranches = data.selectedBranch === null;

  const todayIso = useMemo(() => {
    const myt = new Date(Date.now() + 8 * 60 * 60_000);
    return `${myt.getUTCFullYear()}-${String(myt.getUTCMonth() + 1).padStart(2, "0")}-${String(myt.getUTCDate()).padStart(2, "0")}`;
  }, []);
  const isToday = data.selectedDate === todayIso;

  const buildPath = (branch: string | null, date: string): string => {
    const params = new URLSearchParams();
    if (branch && branch !== "all") params.set("branch", branch);
    if (date && date !== todayIso) params.set("date", date);
    const qs = params.toString();
    return qs ? `/attendance/summary?${qs}` : "/attendance/summary";
  };

  const onChangeBranch = (value: string) => {
    startTransition(() => router.replace(buildPath(value, data.selectedDate)));
  };
  const onChangeDate = (value: string) => {
    if (!value) return;
    startTransition(() =>
      router.replace(buildPath(selectedBranchId === null ? "all" : String(selectedBranchId), value)),
    );
  };
  const onSelectStatus = (status: StatusFilter) => {
    setStatusFilter((current) => (current === status ? null : status));
  };
  const onPullHistory = () => {
    setPulling(true);
    startTransition(() => {
      router.refresh();
      // give the user visible feedback for a moment
      setTimeout(() => setPulling(false), 800);
    });
  };

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Date shown in the DATE chip (DD/MM/YYYY)
  const dateChipLabel = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.selectedDate);
    if (!m) return data.selectedDate;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }, [data.selectedDate]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const predicate = statusFilter ? STATUS_PREDICATES[statusFilter] : null;
    return data.rows.filter((r) => {
      if (predicate && !predicate(r)) return false;
      if (!q) return true;
      return [r.name, r.employee_code, r.department, r.position]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [data.rows, query, statusFilter]);

  // Absence rows split into the three side-panel buckets. Sorted by name
  // inside each bucket.
  const missingRows = useMemo(
    () => data.rows.filter((r) => r.absence_kind === "missing").sort((a, b) => a.name.localeCompare(b.name)),
    [data.rows],
  );
  const onLeaveRows = useMemo(
    () => data.rows.filter((r) => r.absence_kind === "on_leave").sort((a, b) => a.name.localeCompare(b.name)),
    [data.rows],
  );
  const justifiedRows = useMemo(
    () => data.rows.filter((r) => r.absence_kind === "justified").sort((a, b) => a.name.localeCompare(b.name)),
    [data.rows],
  );

  const liveClock = TIME_FMT.format(now ?? new Date(0));

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
          <span className="text-slate-900 font-medium">Summary</span>
        </nav>

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link
              href="/attendance"
              className="inline-flex items-center gap-1.5 mt-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                Attendance Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Live scanner sync · Auto-refreshes every 5 seconds
              </p>
            </div>
          </div>
          {!isAllBranches && <ScannerStatusChip online={data.scannerOnline} />}
        </header>

        {/* Filter row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <FilterChip icon={<MapPin className="w-4 h-4 text-blue-600" aria-hidden="true" />} label="Branch">
              <select
                value={selectedBranchId === null ? "all" : String(selectedBranchId)}
                onChange={(e) => onChangeBranch(e.target.value)}
                disabled={isPending}
                className="bg-transparent text-sm font-bold text-slate-900 focus:outline-none disabled:cursor-wait"
              >
                <option value="all">All branches</option>
                {data.branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_code ?? b.branch_name}
                  </option>
                ))}
              </select>
            </FilterChip>
            <FilterChip icon={<CalendarIcon className="w-4 h-4 text-blue-600" aria-hidden="true" />} label="Date">
              <span className="text-sm font-bold text-slate-900 tabular-nums">{dateChipLabel}</span>
              <input
                type="date"
                value={data.selectedDate}
                onChange={(e) => onChangeDate(e.target.value)}
                disabled={isPending}
                aria-label="Select date"
                className="w-5 h-5 ml-1 opacity-70 hover:opacity-100 cursor-pointer"
              />
              {isToday ? (
                <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-blue-600">Today</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChangeDate(todayIso)}
                  disabled={isPending}
                  className="ml-2 text-[11px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 disabled:opacity-60"
                >
                  Today
                </button>
              )}
            </FilterChip>
          </div>
          <button
            type="button"
            onClick={onPullHistory}
            disabled={pulling || isPending}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-60"
          >
            <Database className={`w-4 h-4 ${pulling ? "animate-pulse" : ""}`} aria-hidden="true" />
            {pulling ? "Pulling…" : "Pull History"}
          </button>
        </div>

        {/* Stat cards (top-border accent) */}
        <section className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <StatCard
            label="Employees Scanned"
            value={data.counts.scanned}
            Icon={Users}
            accent="blue"
            caption={`of ${data.counts.totalEmployees} expected`}
            selected={statusFilter === "scanned"}
            onSelect={() => onSelectStatus("scanned")}
          />
          <StatCard
            label="Currently In"
            value={data.counts.currentlyIn}
            Icon={UserCheck}
            accent="emerald"
            selected={statusFilter === "currentlyIn"}
            onSelect={() => onSelectStatus("currentlyIn")}
          />
          <StatCard
            label="Checked Out"
            value={data.counts.checkedOut}
            Icon={LogOut}
            accent="amber"
            selected={statusFilter === "checkedOut"}
            onSelect={() => onSelectStatus("checkedOut")}
          />
          <StatCard
            label="Missing"
            value={data.counts.missing}
            Icon={UserX}
            accent="rose"
            caption={`of ${data.counts.totalEmployees} expected`}
            selected={statusFilter === "missing"}
            onSelect={() => onSelectStatus("missing")}
          />
        </section>

        {/* Info banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-xl border border-blue-100 bg-blue-50/40">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Info className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
            <span>
              Live sync from office scanner. 1st scan = <strong className="text-blue-700">Check-In</strong>.
              Subsequent scans update <strong className="text-rose-700">Check-Out</strong>. Records reset at midnight.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <span className="relative inline-flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="tabular-nums">{liveClock}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-semibold">
              <Database className="w-3 h-3" aria-hidden="true" />
              <span className="tabular-nums">{data.recordsToday}</span>
            </span>
          </div>
        </div>

        {/* Main grid: table + Missing Today side panel */}
        <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
          {/* Attendance table */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b-2 border-blue-500/80">
              <div className="flex items-center gap-3">
                <span className="w-1 h-6 rounded-full bg-blue-500" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">Today&rsquo;s Attendance</h2>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    {data.selectedBranch?.branch_name ?? "All branches"} · {data.counts.totalEmployees} employees
                    {statusFilter && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => setStatusFilter(null)}
                          className="text-blue-600 font-semibold hover:text-blue-800 underline-offset-2 hover:underline"
                        >
                          Clear filter
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-500">
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                Auto-refresh · 5s
              </span>
            </div>
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, ID, department, or position…"
                  className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-2">Employee</th>
                    <th className="text-left px-3 py-2">Dept / Role</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap">Date</th>
                    <th className="text-left px-3 py-2">Check In</th>
                    <th className="text-left px-3 py-2">In Status</th>
                    <th className="text-left px-3 py-2">Check Out</th>
                    <th className="text-left px-3 py-2">Out Status</th>
                    <th className="text-right px-4 py-2">Scans</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-sm font-medium text-slate-400">
                        {statusFilter ? "No employees match this filter." : "No attendance records yet today."}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <AttendanceTableRow
                        key={row.user_id}
                        row={row}
                        showHomeBadge={isAllBranches}
                        dateLabel={DATE_SHORT_FMT.format(new Date(data.selectedDate + "T04:00:00Z"))}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right-column stack: per spec — 3 boxes only (no MIA on Summary;
              UL absences live on the HR Dashboard MIA card instead). */}
          <div className="space-y-5">
            <AbsencePanel
              title={`Missing ${isToday ? "Today" : "This Day"}`}
              subtitle={`${data.selectedBranch?.branch_name ?? "All branches"} branch · Scheduled & not scanned`}
              accent="rose"
              countLabel="missing"
              rows={missingRows}
              chip={null}
              actionLabel={data.canJustify ? "Justify" : null}
              onAction={data.canJustify ? openJustify : undefined}
              groupByBranch={isAllBranches}
            />
            <AbsencePanel
              title="On Leave"
              subtitle="Approved leave today"
              accent="violet"
              countLabel="on leave"
              rows={onLeaveRows}
              chip={(row) => row.leave_type_code ?? "Leave"}
            />
            <AbsencePanel
              title="Justify"
              subtitle="HR entered a reason / evidence"
              accent="emerald"
              countLabel="justified"
              rows={justifiedRows}
              chip={(row) => row.leave_type_code ?? "OK"}
              actionLabel={data.canJustify ? "Edit" : null}
              onAction={data.canJustify ? openJustify : undefined}
            />
          </div>
        </div>
      </div>
      <JustificationModal target={justifyTarget} onClose={() => setJustifyTarget(null)} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function FilterChip({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm text-slate-700 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
      {icon}
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const ACCENTS = {
  blue: { bar: "bg-blue-500", glow: "before:bg-blue-500/30", tile: "bg-blue-50", icon: "text-blue-600", ring: "ring-blue-300 border-blue-300", focus: "focus-visible:ring-blue-400", text: "text-blue-600" },
  emerald: { bar: "bg-emerald-500", glow: "before:bg-emerald-500/30", tile: "bg-emerald-50", icon: "text-emerald-600", ring: "ring-emerald-300 border-emerald-300", focus: "focus-visible:ring-emerald-400", text: "text-emerald-600" },
  amber: { bar: "bg-amber-500", glow: "before:bg-amber-500/30", tile: "bg-amber-50", icon: "text-amber-600", ring: "ring-amber-300 border-amber-300", focus: "focus-visible:ring-amber-400", text: "text-amber-600" },
  rose: { bar: "bg-rose-500", glow: "before:bg-rose-500/30", tile: "bg-rose-50", icon: "text-rose-600", ring: "ring-rose-300 border-rose-300", focus: "focus-visible:ring-rose-400", text: "text-rose-600" },
} as const;

function StatCard({
  label,
  value,
  Icon,
  accent,
  caption,
  selected,
  onSelect,
}: {
  label: string;
  value: number | string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: keyof typeof ACCENTS;
  caption?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const a = ACCENTS[accent];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative text-left bg-white border border-slate-200 rounded-2xl shadow-sm p-5 pt-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${a.focus} ${selected ? `ring-2 shadow-md -translate-y-0.5 ${a.ring}` : ""}`}
    >
      {/* Top accent bar with soft glow */}
      <span className={`absolute top-0 left-0 right-0 h-1 ${a.bar}`} aria-hidden="true" />
      <span className={`absolute top-1 left-1/4 right-1/4 h-2 ${a.bar} opacity-30 blur-md rounded-full`} aria-hidden="true" />

      <div className="flex items-start gap-4">
        <div className={`${a.tile} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${a.icon}`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className={`text-4xl font-bold tracking-tight tabular-nums ${a.text}`}>
            {value}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
          {caption && <p className="mt-0.5 text-xs text-slate-400">{caption}</p>}
        </div>
      </div>
    </button>
  );
}

function ScannerStatusChip({ online }: { online: boolean }) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-2 h-10 pl-4 pr-4 rounded-full border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700">
        <span className="relative inline-flex w-2 h-2 items-center justify-center">
          <span className="absolute inline-flex w-2 h-2 rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
        </span>
        <Radio className="w-4 h-4" aria-hidden="true" />
        Scanner Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 h-10 pl-4 pr-4 rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">
      <RadioReceiver className="w-4 h-4" aria-hidden="true" />
      Scanner Offline
    </span>
  );
}

function AttendanceTableRow({
  row,
  showHomeBadge,
  dateLabel,
}: {
  row: AttendanceRow;
  showHomeBadge: boolean;
  dateLabel: string;
}) {
  // Out status: when they scanned in but haven't scanned out yet, show
  // "Currently In" (emerald) instead of an empty "—".
  const checkedInButNotOut = Boolean(row.check_in && !row.check_out);
  const outVariant = row.out_status === "early"
    ? "early"
    : row.out_status === "normal"
      ? "normal"
      : checkedInButNotOut
        ? "currently_in"
        : "muted";
  const outLabel = row.out_status === "early"
    ? "Left Early"
    : row.out_status === "normal"
      ? "Normal"
      : checkedInButNotOut
        ? "Currently In"
        : "—";

  return (
    <tr className="bg-white odd:bg-slate-50/40 hover:bg-blue-50/40 transition-colors border-b border-slate-100 last:border-b-0">
      <td className="px-4 py-1.5 align-middle">
        <div className="leading-tight">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-tight">{row.name}</span>
            {row.visiting_from && (
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-1.5 text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap leading-4">
                Visit · {row.visiting_from}
              </span>
            )}
            {showHomeBadge && row.home_branch_code && !row.visiting_from && (
              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-1.5 text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap leading-4">
                {row.home_branch_code}
              </span>
            )}
            {row.absence_kind === "on_leave" && (
              <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-700 px-1.5 text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap leading-4">
                {row.leave_type_code ?? "Leave"}
              </span>
            )}
            {row.absence_kind === "mia" && (
              <span className="inline-flex items-center rounded-full bg-rose-100 text-rose-700 px-1.5 text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap leading-4">
                MIA · {row.leave_type_code ?? "UL"}
              </span>
            )}
          </div>
          {row.employee_code && (
            <div className="mt-0.5 text-[10px] font-medium text-slate-400 font-mono tracking-tight">
              <span className="text-slate-300">ID</span> · {row.employee_code}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-[11px]">
        {row.department && <span className="font-semibold text-slate-800">{row.department}</span>}
        {row.department && row.position && <span className="mx-1 text-slate-300">·</span>}
        {row.position && <span className="font-medium text-slate-500">{row.position}</span>}
        {!row.department && !row.position && <span className="text-slate-400">—</span>}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-slate-500 font-medium">
        {dateLabel.replace(", ", " ")}
      </td>
      <td className="px-3 py-1.5">
        <TimeCell iso={row.check_in} tone={row.in_status === "late" ? "late" : "ok"} />
      </td>
      <td className="px-3 py-1.5">
        <StatusPill
          variant={row.in_status === "late" ? "late" : row.in_status === "on_time" ? "on_time" : "muted"}
          label={row.in_status === "late" ? "Late" : row.in_status === "on_time" ? "On Time" : "—"}
        />
      </td>
      <td className="px-3 py-1.5">
        <TimeCell iso={row.check_out} tone={row.out_status === "early" ? "late" : "ok"} />
      </td>
      <td className="px-3 py-1.5">
        <StatusPill variant={outVariant} label={outLabel} />
      </td>
      <td className="px-4 py-1.5 text-right">
        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 tabular-nums">
          {row.scans}
        </span>
      </td>
    </tr>
  );
}

function TimeCell({ iso, tone }: { iso: string | null; tone: "ok" | "late" }) {
  if (!iso) return <span className="text-slate-300 font-mono text-xs">—</span>;
  return (
    <span className={`font-mono text-xs tabular-nums whitespace-nowrap ${tone === "late" ? "text-amber-600 font-bold" : "text-slate-700 font-medium"}`}>
      {TIME_FMT.format(new Date(iso))}
    </span>
  );
}

function StatusPill({
  variant,
  label,
}: {
  variant: "on_time" | "late" | "normal" | "early" | "currently_in" | "muted";
  label: string;
}) {
  const styles = {
    on_time:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    late:         "bg-rose-50 text-rose-700 border border-rose-200",
    normal:       "bg-slate-50 text-slate-600 border border-slate-200",
    early:        "bg-amber-50 text-amber-700 border border-amber-200",
    currently_in: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    muted:        "bg-slate-50 text-slate-400 border border-slate-100",
  }[variant];
  // Icon vs dot: late + early use an icon (matches the reference), the rest
  // use a small dot so the pill height stays consistent.
  const icon =
    variant === "late"  ? <AlertCircle className="w-3 h-3" aria-hidden="true" /> :
    variant === "early" ? <Clock       className="w-3 h-3" aria-hidden="true" /> :
    null;
  const dot = !icon && {
    on_time:      "bg-emerald-500",
    normal:       "bg-slate-400",
    currently_in: "bg-emerald-500",
    muted:        "bg-slate-300",
  }[variant as Exclude<typeof variant, "late" | "early">];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold ${styles}`}>
      {icon ?? <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />}
      {label}
    </span>
  );
}

const PANEL_ACCENT = {
  rose:    { border: "border-rose-500/80",    bar: "bg-rose-500",    chipBg: "bg-rose-50",    chipBorder: "border-rose-200",    chipText: "text-rose-700",    dot: "bg-rose-500"    },
  violet:  { border: "border-violet-500/80",  bar: "bg-violet-500",  chipBg: "bg-violet-50",  chipBorder: "border-violet-200",  chipText: "text-violet-700",  dot: "bg-violet-500"  },
  amber:   { border: "border-amber-500/80",   bar: "bg-amber-500",   chipBg: "bg-amber-50",   chipBorder: "border-amber-200",   chipText: "text-amber-700",   dot: "bg-amber-500"   },
  emerald: { border: "border-emerald-500/80", bar: "bg-emerald-500", chipBg: "bg-emerald-50", chipBorder: "border-emerald-200", chipText: "text-emerald-700", dot: "bg-emerald-500" },
} as const;

function AbsencePanel({
  title,
  subtitle,
  accent,
  countLabel,
  rows,
  chip,
  actionLabel,
  onAction,
  groupByBranch = false,
}: {
  title: string;
  subtitle: string;
  accent: keyof typeof PANEL_ACCENT;
  countLabel: string;
  rows: AttendanceRow[];
  chip: ((row: AttendanceRow) => string | null) | null;
  /** When set, renders a small button per row that fires onAction(row). */
  actionLabel?: string | null;
  onAction?: (row: AttendanceRow) => void;
  /** Group rows under branch-code section headers (used on "All branches"). */
  groupByBranch?: boolean;
}) {
  const a = PANEL_ACCENT[accent];
  return (
    <aside className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[420px]">
      <div className={`flex items-center justify-between gap-2 px-5 py-4 border-b-2 ${a.border}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-1 h-6 rounded-full shrink-0 ${a.bar}`} aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-bold whitespace-nowrap ${a.chipBg} ${a.chipBorder} ${a.chipText}`}>
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          {rows.length} {countLabel}
        </span>
      </div>
      <ul className="overflow-y-auto divide-y divide-slate-100">
        {rows.length === 0 ? (
          <li className="px-5 py-6 text-center text-xs font-medium text-slate-400">
            None.
          </li>
        ) : (
          // Optionally group rows under branch headers. When grouping, the
          // header text + count surface which branch each block belongs to.
          (groupByBranch
            ? Object.entries(
                rows.reduce<Record<string, AttendanceRow[]>>((acc, r) => {
                  const key = r.home_branch_code ?? "—";
                  (acc[key] ??= []).push(r);
                  return acc;
                }, {}),
              ).sort(([a], [b]) => a.localeCompare(b))
            : [[null as string | null, rows] as const]
          ).map(([branchKey, branchRows]) => (
            <li key={branchKey ?? "_all"}>
              {branchKey !== null && (
                <div className="px-5 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {branchKey}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {branchRows.length}
                  </span>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {branchRows.map((row) => {
                  const tag = chip ? chip(row) : null;
                  return (
                    <li key={row.user_id} className="px-5 py-3 flex items-center gap-3">
                      <div className="rounded-full w-8 h-8 bg-slate-100 text-slate-600 font-bold text-[11px] flex items-center justify-center shrink-0">
                        {row.name
                          .split(" ")
                          .map((p) => p[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{row.name}</p>
                        <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                          {row.position ?? "—"}
                          {row.home_branch_code && <span className="ml-1 text-slate-400">· {row.home_branch_code}</span>}
                        </p>
                        {tag && (
                          <span className={`mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${a.chipBg} ${a.chipText}`}>
                            {tag}
                          </span>
                        )}
                      </div>
                      {actionLabel && onAction ? (
                        <button
                          type="button"
                          onClick={() => onAction(row)}
                          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        >
                          {actionLabel}
                        </button>
                      ) : (
                        <span className={`w-2 h-2 rounded-full shrink-0 ${a.dot}`} aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
