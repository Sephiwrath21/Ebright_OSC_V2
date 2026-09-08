"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import GreetingHeader from "./GreetingHeader";
import SelfJustificationModal, {
  type SelfJustificationTarget,
} from "./SelfJustificationModal";
import {
  Check,
  ChevronRight,
  Clock,
  CalendarDays,
  FileText,
  TrendingUp,
  Megaphone,
  Mail,
  Building2,
  UserCircle2,
  Briefcase,
} from "lucide-react";

// ─── Theme tokens ─────────────────────────────────────────────────────────────
// Theme-aware CSS vars (globals.css --status-*-fg) — light values are
// byte-identical to the original literals, dark values swap automatically.
// Used for text/fill paired with a matching tinted background.
const C = {
  green: "var(--status-green-fg)",
  amber: "var(--status-amber-fg)",
  blue:  "var(--status-blue-fg)",
  red:   "var(--status-red-fg)",
};

// Fixed (non-theme-aware) literals for solid colour fills carrying WHITE
// text/icons on top (avatar circle, "Profile complete" badge, checked
// to-do circle) — swapping these to the lighter dark-mode --status-*-fg
// tone would drop white-on-fill contrast, so they stay literal.
const SOLID = {
  green: "var(--status-green-fg)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TodoItem {
  id: string;
  title: string;
  subtitle?: string;
  pill?: { label: string; tone: "blue" | "red" | "green" | "amber" };
  progress?: number;
  done: boolean;
}

interface WeekDay {
  day:     string;
  dateIso: string;
  state:   "ontime" | "late" | "today" | "absent" | "upcoming" | "holiday";
  label:   string;
  minutesLate?: number;
  justification?: { reason: string | null; status: string };
}

interface DashboardData {
  success: boolean;
  isEmployee: boolean;
  viewer: {
    fullName:   string | null;
    nickName:   string | null;
    email:      string;
    employeeId: string | null;
    position:   string | null;
    branchName: string | null;
    branchCode: string | null;
    department: string | null;
    startDate:  string | null;
    createdAt:  string;
  };
  attendance: {
    thisMonthPercent: number;
    lastMonthPercent: number;
    delta:            number;
    lateThisMonth:    number;
  };
  week: {
    rangeStart:    string;
    rangeEnd:      string;
    onTimePercent: number;
    onTimeCount:   number;
    lateCount:     number;
    absentCount:   number;
    totalHours:    number;
    days:          WeekDay[];
  };
  leave:    { pendingDays:    number };
  overtime: { thisMonthHours: number };
}

interface Props {
  userName?:  string | null;
  userEmail?: string;
  /** Server-rendered Task Manager overview (personal, with date filters). */
  taskOverview?: ReactNode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatJoinedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
}

// Total days worked since `startIso` (inclusive). Returns null if missing/invalid.
// If `endIso` is set, counts up to that day instead of today.
function daysWorked(
  startIso: string | null | undefined,
  endIso?: string | null,
): number | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  if (isNaN(start.getTime())) return null;
  const end = endIso ? new Date(endIso) : new Date();
  if (isNaN(end.getTime())) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 3600_000)) + 1;
}

function initialsFrom(name: string | null | undefined, fallback = "—"): string {
  const s = (name && name.trim()) || fallback;
  return s.split(" ").map(n => n[0]).filter(Boolean).join("").slice(0, 2).toUpperCase();
}

function formatWeekRange(startIso: string, endIso: string): string {
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso   + "T00:00:00Z");
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sm = s.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const em = e.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return sm === em ? `${sd}–${ed} ${em}` : `${sd} ${sm} – ${ed} ${em}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmployeeSelfServiceDashboard({ userName, userEmail, taskOverview }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [justifyTarget, setJustifyTarget] = useState<SelfJustificationTarget | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/employee-dashboard", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) setData(json);
    } catch {
      // leave data null; UI shows fallback values
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  const openJustify = (w: WeekDay) => {
    if (w.state !== "absent" && w.state !== "late") return;
    setJustifyTarget({
      date: w.dateIso,
      state: w.state,
      existingReason: w.justification?.reason ?? null,
      existingStatus: w.justification?.status ?? null,
    });
  };

  const v = data?.viewer;
  const greetName = v?.nickName || v?.fullName?.split(" ")[0] || userName?.split(" ")[0] || "";

  const [todos, setTodos] = useState<TodoItem[]>([
    { id: "timesheet",   title: "Submit March timesheet", done: true },
    { id: "profile",     title: "Profile completion", subtitle: "upload photo & bank details",
      pill: { label: "Self", tone: "blue" }, progress: 80, done: false },
    { id: "claim",       title: "Claim submission", subtitle: "Due: 2 May 2026",
      pill: { label: "Urgent", tone: "red" }, done: false },
    { id: "onboarding",  title: "Complete onboarding survey",
      pill: { label: "HR", tone: "blue" }, done: false },
  ]);

  const pendingCount = todos.filter(t => !t.done).length;

  function toggleTodo(id: string) {
    setTodos(prev => prev.map(t => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  // Week-at-a-glance: real data from the API. Empty until loaded.
  const weekDays: WeekDay[] = data?.week.days ?? [];
  const weekRangeLabel = data?.week
    ? formatWeekRange(data.week.rangeStart, data.week.rangeEnd)
    : "";

  // Metric values (real from API, fallback to "—" while loading or on error)
  const m = {
    attendancePct: data ? `${data.attendance.thisMonthPercent}%` : "—",
    attendanceTrend: data
      ? data.attendance.delta === 0
        ? { tone: "up" as const, text: "= same as last month" }
        : data.attendance.delta > 0
          ? { tone: "up"   as const, text: `↑ ${data.attendance.delta}% vs last month` }
          : { tone: "down" as const, text: `↓ ${Math.abs(data.attendance.delta)}% vs last month` }
      : undefined,
    lateCount:  data ? String(data.attendance.lateThisMonth) : "—",
    leaveDays:  data ? String(data.leave.pendingDays)        : "—",
    overtime:   data ? String(data.overtime.thisMonthHours)  : "—",
  };

  const profileInitials = initialsFrom(v?.fullName, "—");
  const totalDaysWorked = daysWorked(v?.startDate);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <GreetingHeader name={greetName} style={{ marginBottom: 32 }} />

        {/* ── Metric cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={<CalendarDays className="w-4 h-4" />}
            label="Attendance this month"
            value={m.attendancePct}
            trend={m.attendanceTrend}
          />
          <MetricCard
            icon={<Clock className="w-4 h-4" />}
            label="Late check-ins"
            value={m.lateCount}
            subtitle="this month"
          />
          <MetricCard
            icon={<FileText className="w-4 h-4" />}
            label="Leave applied"
            value={m.leaveDays}
            subtitle="days pending approval"
          />
          <MetricCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Overtime hrs"
            value={m.overtime}
            subtitle="this month"
          />
        </div>

        {/* ── Row 1: This week + Profile ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* This week at a glance */}
          <Card>
            <CardHeader
              title="This week at a glance"
              subtitle={weekRangeLabel ? `Attendance · ${weekRangeLabel}` : "Attendance"}
            />
            <div className="flex items-center gap-6">
              <Donut percent={data?.week.onTimePercent ?? 0} />
              <div className="flex-1 space-y-2">
                {weekDays.length === 0 && (
                  <p className="text-xs text-slate-400 italic">
                    {loading ? "Loading…" : "No working days this week."}
                  </p>
                )}
                {weekDays.map(w => (
                  <WeekRow
                    key={w.dateIso}
                    day={w.day}
                    state={w.state}
                    label={w.label}
                    justification={w.justification}
                    onJustify={
                      w.state === "absent" || w.state === "late"
                        ? () => openJustify(w)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>

            {/* Weekly stats footer — fills the gap and adds quick context */}
            {data?.week && (
              <div className="mt-5 grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <WeekStat
                  label="Hours worked"
                  value={`${data.week.totalHours}h`}
                  tone="blue"
                />
                <WeekStat
                  label="On time"
                  value={String(data.week.onTimeCount)}
                  tone="green"
                />
                <WeekStat
                  label={data.week.absentCount > 0 ? "Absent" : "Late"}
                  value={String(data.week.absentCount > 0 ? data.week.absentCount : data.week.lateCount)}
                  tone={data.week.absentCount > 0 ? "red" : "amber"}
                />
              </div>
            )}
          </Card>

          {/* Profile card */}
          <Card>
            <div className="flex items-start gap-4 mb-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-base font-black text-white shrink-0"
                style={{ background: SOLID.green }}
              >
                {profileInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {loading ? "Loading…" : v?.fullName || "—"}
                  </h3>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                    style={{ background: SOLID.green }}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                    Profile complete
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                  {v?.position || "—"}{v?.department ? ` · ${v.department}` : ""}
                </p>
              </div>
            </div>

            <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <InfoRow icon={<UserCircle2  className="w-3.5 h-3.5" />} label="Employee ID" value={v?.employeeId || "—"} />
              <InfoRow icon={<Building2    className="w-3.5 h-3.5" />} label="Department"  value={v?.department || "—"} />
              <InfoRow icon={<Building2    className="w-3.5 h-3.5" />} label="Branch"      value={v?.branchName || "—"} />
              <InfoRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Joined"      value={formatJoinedDate(v?.startDate)} />
              <InfoRow icon={<Mail         className="w-3.5 h-3.5" />} label="Work email"  value={v?.email || userEmail || "—"} />
            </dl>

            {totalDaysWorked !== null && (
              <div
                className="mt-4 rounded-xl px-4 py-3 flex items-center gap-2.5"
                style={{ background: "var(--status-green-bg)", color: C.green }}
              >
                <Briefcase className="w-4 h-4 shrink-0" />
                <p className="text-sm font-semibold">
                  {totalDaysWorked.toLocaleString()} day{totalDaysWorked === 1 ? "" : "s"} worked
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* ── Row 2: Announcements + To-do ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Announcements */}
          <Card>
            <CardHeader
              title="Announcements"
              subtitle="Latest updates from HR"
              icon={<Megaphone className="w-4 h-4" style={{ color: C.blue }} />}
            />
            <div className="space-y-3">
              <Announcement title="Town hall this Friday"        body="3:00 PM · Main Auditorium"          tag="Event"   />
              <Announcement title="Public holiday — 1 May"        body="Labour Day · Office closed"          tag="Holiday" />
              <Announcement title="Q2 performance reviews open"   body="Submit self-review by 10 May"        tag="HR"      />
            </div>
          </Card>

          {/* To-do / pending actions */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">To-do / pending actions</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tap to mark complete</p>
              </div>
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: "var(--status-amber-bg)", color: C.amber }}
              >
                {pendingCount} pending
              </span>
            </div>
            <ul className="space-y-2.5">
              {todos.map(t => (
                <TodoRow key={t.id} t={t} onToggle={() => toggleTodo(t.id)} />
              ))}
            </ul>
          </Card>
        </div>

        {/* Task Manager — personal status (server-rendered slot).
            ALWAYS the LAST section on Home, for every account type
            (2026-07-28 placement decision). */}
        {taskOverview && <div className="mt-6">{taskOverview}</div>}
      </div>

      <SelfJustificationModal
        target={justifyTarget}
        onClose={() => setJustifyTarget(null)}
        onSaved={load}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800">{children}</div>;
}

function CardHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      {icon && <span className="mt-0.5">{icon}</span>}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function MetricCard({
  icon, label, value, subtitle, trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  trend?: { tone: "up" | "down"; text: string };
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-3xl font-black text-slate-900 dark:text-slate-100 leading-none">{value}</p>
      {trend ? (
        <p className="text-[11px] font-semibold mt-2"
           style={{ color: trend.tone === "up" ? C.green : C.red }}>
          {trend.text}
        </p>
      ) : subtitle ? (
        <p className="text-[11px] text-slate-400 mt-2">{subtitle}</p>
      ) : null}
    </div>
  );
}

function Donut({ percent }: { percent: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative w-[120px] h-[120px] shrink-0">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--status-track)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke={C.green}
          strokeWidth="10"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{percent}%</span>
        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">on time</span>
      </div>
    </div>
  );
}

function WeekRow({ day, state, label, justification, onJustify }: {
  day: string;
  state: "ontime" | "late" | "today" | "absent" | "upcoming" | "holiday";
  label: string;
  justification?: { reason: string | null; status: string };
  onJustify?: () => void;
}) {
  const tone =
    state === "ontime"    ? { bg: "var(--status-green-bg)",       fg: C.green,                     w: "85%"  }
    : state === "late"    ? { bg: "var(--status-amber-bg-strong)", fg: C.amber,                    w: "60%"  }
    : state === "absent"  ? { bg: "var(--status-red-bg)",         fg: C.red,                       w: "40%"  }
    : state === "holiday" ? { bg: "var(--status-violet-bg)",      fg: "var(--status-violet-fg)",    w: "100%" }
    :                       { bg: "var(--status-neutral-bg)",     fg: "var(--status-neutral-fg)",   w: "0%"   };

  const labelColor =
    state === "today" || state === "upcoming" ? "var(--status-neutral-fg)" : tone.fg;

  // Small pill on the right of the bar reflecting justification status, or a
  // "Justify" affordance when the day is absent/late and not yet handled.
  const badge = (() => {
    const s = justification?.status;
    if (s === "approved") return { text: "Justified", bg: "var(--status-green-bg)", fg: C.green };
    if (s === "pending")  return { text: "Pending",   bg: "var(--status-amber-bg)", fg: C.amber };
    if (s === "rejected") return { text: "Rejected",  bg: "var(--status-red-bg)", fg: C.red };
    if (onJustify)        return { text: "Justify",   bg: "var(--status-blue-bg)", fg: C.blue };
    return null;
  })();

  const rowInner = (
    <>
      <span className="w-8 text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">{day}</span>
      <div className="flex-1 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
        <div className="h-full rounded-lg transition-all" style={{ width: tone.w, background: tone.bg }} />
        <span
          className="absolute inset-0 flex items-center px-2.5 text-[11px] font-semibold"
          style={{ color: labelColor }}
        >
          {label}
        </span>
      </div>
      {badge && (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: badge.bg, color: badge.fg }}
        >
          {badge.text}
        </span>
      )}
    </>
  );

  if (onJustify) {
    return (
      <button
        type="button"
        onClick={onJustify}
        className="w-full flex items-center gap-3 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        title="Justify this day"
      >
        {rowInner}
      </button>
    );
  }

  return <div className="flex items-center gap-3">{rowInner}</div>;
}

function WeekStat({ label, value, tone }: {
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "red";
}) {
  const fg =
    tone === "blue"  ? C.blue
    : tone === "green" ? C.green
    : tone === "amber" ? C.amber
    : C.red;

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-base font-black mt-0.5" style={{ color: fg }}>{value}</p>
    </div>
  );
}

function TodoRow({ t, onToggle }: { t: TodoItem; onToggle: () => void }) {
  const pillStyle = (() => {
    switch (t.pill?.tone) {
      case "blue":  return { bg: "var(--status-blue-bg)",  fg: C.blue };
      case "red":   return { bg: "var(--status-red-bg)",   fg: C.red  };
      case "amber": return { bg: "var(--status-amber-bg)", fg: C.amber };
      case "green": return { bg: "var(--status-green-bg)", fg: C.green };
      default:      return { bg: "var(--status-neutral-bg)", fg: "var(--status-neutral-fg-strong)" };
    }
  })();

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 text-left rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <span
          className="mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
          style={{
            background:  t.done ? SOLID.green : "transparent",
            borderColor: t.done ? SOLID.green : "var(--status-border-idle)",
          }}
        >
          {t.done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${t.done ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>
              {t.title}
            </span>
            {t.pill && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: pillStyle.bg, color: pillStyle.fg }}
              >
                {t.pill.label}
              </span>
            )}
          </div>
          {t.subtitle && (
            <p className={`text-xs mt-0.5 ${t.done ? "text-slate-300 dark:text-slate-600 line-through" : "text-slate-500 dark:text-slate-400"}`}>
              {t.subtitle}
            </p>
          )}
          {typeof t.progress === "number" && !t.done && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                     style={{ width: `${t.progress}%`, background: C.blue }} />
              </div>
              <span className="text-[10px] font-bold" style={{ color: C.blue }}>
                {t.progress}%
              </span>
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

function Announcement({ title, body, tag }: { title: string; body: string; tag: string }) {
  return (
    <div
      className="rounded-xl bg-slate-50 dark:bg-slate-800 pl-4 pr-3 py-3 border-l-4 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-colors cursor-pointer flex items-start justify-between gap-2"
      style={{ borderLeftColor: C.blue }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{title}</p>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
            style={{ background: "var(--status-blue-bg)", color: C.blue }}
          >
            {tag}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{body}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 mt-1 shrink-0" />
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
        <span className="text-slate-400">{icon}</span>
        {label}
      </dt>
      <dd className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{value}</dd>
    </div>
  );
}
