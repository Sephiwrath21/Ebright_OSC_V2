"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Home,
  Building2,
  CalendarDays,
  Search,
  Check,
} from "lucide-react";
import AppShell from "@/app/components/AppShell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branch {
  branch_id: number;
  branch_name: string;
  branch_code: string | null;
  location: string | null;
  region: string | null;
  staff_count: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Local timezone ISO date string (avoids UTC-offset shift on toISOString)
function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── WeekPicker ───────────────────────────────────────────────────────────────

interface WeekPickerProps {
  selectedMonday: Date | null;
  onSelect: (monday: Date) => void;
  /** ISO Monday → status map for weeks that already have a schedule */
  scheduledWeeks?: Record<string, string>;
}

function WeekPicker({ selectedMonday, onSelect, scheduledWeeks = {} }: WeekPickerProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hoveredMonday, setHoveredMonday] = useState<Date | null>(null);

  const selectedSunday = selectedMonday
    ? new Date(selectedMonday.getTime() + 6 * 86_400_000)
    : null;
  const hoveredSunday = hoveredMonday
    ? new Date(hoveredMonday.getTime() + 6 * 86_400_000)
    : null;

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  type Cell = { date: Date; current: boolean };
  const cells: Cell[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ date: new Date(viewYear, viewMonth - 1, daysInPrevMonth - i), current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewYear, viewMonth, d), current: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({
      date: new Date(viewYear, viewMonth + 1, cells.length - daysInMonth - startOffset + 1),
      current: false,
    });
  }

  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function handleDayClick(date: Date) { onSelect(getMondayOfWeek(date)); }

  function getDigitClasses(cell: Cell, inSelectedWeek: boolean): string {
    const { date, current } = cell;
    const isToday = isSameDay(date, today);
    let cls = "relative z-10 w-8 h-8 inline-flex items-center justify-center text-sm rounded-full transition-colors pointer-events-none ";
    if (!current) cls += "text-slate-300 dark:text-slate-600";
    else if (inSelectedWeek) cls += "text-white font-semibold";
    else if (isToday) cls += "text-indigo-600 dark:text-indigo-400 font-semibold underline";
    else cls += "text-slate-700 dark:text-slate-300";
    return cls;
  }

  function rangeInRow(row: Cell[], rangeStart: Date | null, rangeEnd: Date | null) {
    if (!rangeStart || !rangeEnd) return null;
    let startCol = -1, endCol = -1;
    for (let i = 0; i < row.length; i++) {
      const d = row[i].date;
      if (d >= rangeStart && d <= rangeEnd) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }
    return startCol === -1 ? null : { startCol, endCol };
  }

  const curYear = today.getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => curYear - 3 + i);

  const hasAnySchedule = Object.keys(scheduledWeeks).length > 0;

  return (
    <div className="w-full">
      {/* Date range display */}
      <div className="flex gap-2 mb-3">
        <div className={`flex-1 text-center text-xs py-1.5 px-2 rounded-lg border transition-colors ${selectedMonday ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium" : "border-slate-200 dark:border-slate-700 text-slate-400 bg-slate-50 dark:bg-slate-800"}`}>
          {selectedMonday ? formatDate(selectedMonday) : "Start date"}
        </div>
        <div className={`flex-1 text-center text-xs py-1.5 px-2 rounded-lg border transition-colors ${selectedSunday ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium" : "border-slate-200 dark:border-slate-700 text-slate-400 bg-slate-50 dark:bg-slate-800"}`}>
          {selectedSunday ? formatDate(selectedSunday) : "End date"}
        </div>
      </div>

      {/* Month/Year nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Previous month">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex gap-1.5">
          <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))} className="text-xs border border-slate-200 dark:border-slate-500 rounded-md px-1.5 py-0.5 text-slate-700 dark:text-slate-100 bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))} className="text-xs border border-slate-200 dark:border-slate-500 rounded-md px-1.5 py-0.5 text-slate-700 dark:text-slate-100 bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Next month">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-slate-400">{d}</div>
        ))}
      </div>

      {/* Week rows */}
      <div onMouseLeave={() => setHoveredMonday(null)}>
        {rows.map((row, rIdx) => {
          const rowMondayISO = toLocalISO(row[0].date);
          const rowStatus = scheduledWeeks[rowMondayISO];
          const selRange = rangeInRow(row, selectedMonday, selectedSunday);
          const hovRange = rangeInRow(row, hoveredMonday, hoveredSunday);
          const showHover = !selRange && !!hovRange;

          return (
            <div
              key={rIdx}
              className={`relative grid grid-cols-7 h-8 rounded-sm ${
                rowStatus === "Finalized"
                  ? "bg-emerald-50/70 dark:bg-emerald-900/40"
                  : rowStatus === "Updated"
                  ? "bg-amber-50/70 dark:bg-amber-900/40"
                  : ""
              }`}
            >
              {/* Selected week pill */}
              {selRange && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-7 bg-indigo-600 rounded-full pointer-events-none z-0"
                  style={{
                    left:  `${(selRange.startCol / 7) * 100}%`,
                    right: `${((6 - selRange.endCol) / 7) * 100}%`,
                  }}
                />
              )}
              {/* Hover outline pill */}
              {showHover && hovRange && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-7 border-2 border-indigo-400 rounded-full pointer-events-none z-0"
                  style={{
                    left:  `${(hovRange.startCol / 7) * 100}%`,
                    right: `${((6 - hovRange.endCol) / 7) * 100}%`,
                  }}
                />
              )}
              {/* Status dot — right edge of row, hidden when this week is selected */}
              {rowStatus && !selRange && (
                <div className="absolute right-0.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className={`w-1.5 h-1.5 rounded-full ${rowStatus === "Finalized" ? "bg-emerald-500" : "bg-amber-400"}`} />
                </div>
              )}
              {/* Day cells */}
              {row.map((cell, cIdx) => {
                const inSelectedWeek = !!selRange && cIdx >= selRange.startCol && cIdx <= selRange.endCol;
                return (
                  <div
                    key={cIdx}
                    className="relative flex items-center justify-center cursor-pointer"
                    onMouseEnter={() => setHoveredMonday(getMondayOfWeek(cell.date))}
                    onClick={() => handleDayClick(cell.date)}
                  >
                    <span className={getDigitClasses(cell, inSelectedWeek)}>{cell.date.getDate()}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend — only shown when branch has any schedules */}
      {hasAnySchedule && (
        <div className="mt-2.5 flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] text-slate-400 font-medium">Schedule:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Finalized</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Updated</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page Content ─────────────────────────────────────────────────────────────

interface PlanNewWeekContentProps {
  userRole: string;
}

function PlanNewWeekContent({ userRole }: PlanNewWeekContentProps) {
  const router = useRouter();
  const isAdmin = userRole === "ADMIN" || userRole === "SUPERADMIN";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedMonday, setSelectedMonday] = useState<Date | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Existing schedules for the selected branch: ISO Monday → status
  const [scheduledWeeks, setScheduledWeeks] = useState<Record<string, string>>({});

  const selectedSunday = selectedMonday
    ? new Date(selectedMonday.getTime() + 6 * 86_400_000)
    : null;


  // Load branches
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;

        if (json.success && Array.isArray(json.branches)) {
          setBranches(json.branches);
          if (!isAdmin && json.branches.length > 0) {
            setSelectedBranch(json.branches[0]);
          }
        } else {
          throw new Error(json.error || "Failed to load branches");
        }
      } catch (err) {
        if (cancelled) return;
        setBranchesError(err instanceof Error ? err.message : "Failed to load branches");
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Load existing schedule indicators when branch changes
  useEffect(() => {
    if (!selectedBranch) { setScheduledWeeks({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/schedules");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !Array.isArray(data.schedules)) return;
        if (cancelled) return;
        const map: Record<string, string> = {};
        (data.schedules as { branch: string; startDate: string; status?: string }[]).forEach(s => {
          if (s.branch === selectedBranch.branch_name) {
            map[s.startDate] = s.status ?? "Finalized";
          }
        });
        setScheduledWeeks(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedBranch]);

  function handleBranchChange(branch: Branch | null) {
    setSelectedBranch(branch);
    setSelectedMonday(null);
    setConfirmed(false);
  }

  function handleWeekSelect(monday: Date) {
    setSelectedMonday(monday);
    setConfirmed(false);
  }

  function handleConfirm() {
    if (!selectedBranch || !selectedMonday || !selectedSunday) return;
    setConfirmed(true);
    const startISO = toLocalISO(selectedMonday);
    const endISO   = toLocalISO(selectedSunday);
    const params = new URLSearchParams({
      branch: selectedBranch.branch_name,
      branch_id: String(selectedBranch.branch_id),
      start: startISO,
      end: endISO,
    });
    router.push(`/manpower-schedule/plan-new-week/grid?${params.toString()}`);
  }

  const selectedWeekStatus = selectedMonday ? scheduledWeeks[toLocalISO(selectedMonday)] : null;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-5">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/manpower-schedule" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Manpower Planning</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Plan New Week</span>
        </nav>

        <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* ── Title header spanning both columns ── */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Plan New Week</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Pick a branch and the upcoming week to build the new manpower roster.
            </p>
          </div>

          {/* ── 2-column content ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
          {/* ── Step 1: Branch ── */}
          <div>
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-semibold inline-flex items-center justify-center shrink-0">1</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select branch</p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Choose the branch to plan manpower for</p>
              </div>
            </div>

            <div className="p-5 space-y-2.5">
              <BranchCombobox
                branches={branches}
                selected={selectedBranch}
                onSelect={handleBranchChange}
                loading={branchesLoading}
                error={!!branchesError}
              />

              {branchesError && <p className="text-xs text-rose-600">{branchesError}</p>}

              {selectedBranch ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900 border border-indigo-100 dark:border-indigo-700 rounded-xl">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                  <span className="text-xs text-indigo-700 dark:text-indigo-300">
                    {selectedBranch.region ? `Region ${selectedBranch.region} · ` : ""}
                    <span className="font-semibold">{selectedBranch.branch_name}</span>
                    {" "}· {selectedBranch.staff_count}{" "}
                    {selectedBranch.staff_count === 1 ? "staff" : "staffs"}
                  </span>
                </div>
              ) : (
                <div className="h-9 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  <p className="text-xs text-slate-400">No branch selected</p>
                </div>
              )}

              {/* Schedule summary for selected branch */}
              {selectedBranch && Object.keys(scheduledWeeks).length > 0 && (
                <div className="pt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-medium text-slate-400">Existing:</span>
                  {Object.entries(scheduledWeeks)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 3)
                    .map(([date, status]) => (
                      <span
                        key={date}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          status === "Finalized"
                            ? "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700"
                            : "bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700"
                        }`}
                      >
                        <span className={`w-1 h-1 rounded-full inline-block ${status === "Finalized" ? "bg-emerald-500" : "bg-amber-400"}`} />
                        {date.slice(5)} {/* MM-DD */}
                      </span>
                    ))}
                  {Object.keys(scheduledWeeks).length > 3 && (
                    <span className="text-[10px] text-slate-400">+{Object.keys(scheduledWeeks).length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Step 2: Week ── */}
          <div
            className={`transition-opacity duration-200 ${
              selectedBranch ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}
          >
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full text-white text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-colors ${selectedBranch ? "bg-indigo-600" : "bg-slate-300"}`}>2</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select a week</p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Click any day — the full Mon–Sun week is selected</p>
              </div>
            </div>

            <div className="p-5">
              <WeekPicker
                selectedMonday={selectedMonday}
                onSelect={handleWeekSelect}
                scheduledWeeks={scheduledWeeks}
              />

              {/* Re-plan warning */}
              {selectedWeekStatus && (
                <div className={`mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                  selectedWeekStatus === "Finalized"
                    ? "bg-emerald-50 dark:bg-emerald-900 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 shrink-0 ${selectedWeekStatus === "Finalized" ? "bg-emerald-500" : "bg-amber-400"}`} />
                  <span>
                    This week already has a <strong>{selectedWeekStatus}</strong> schedule.
                    Continuing will let you update it.
                  </span>
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={!selectedMonday}
                className={`mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  selectedMonday
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                }`}
              >
                {selectedMonday && selectedSunday
                  ? `Continue: ${formatDate(selectedMonday)} – ${formatDate(selectedSunday)}`
                  : "Select a week to continue"}
              </button>
            </div>
          </div>
        </div>
        </div>

        {/* Confirmed banner */}
        {confirmed && selectedBranch && selectedMonday && selectedSunday && (
          <div className="mt-4 max-w-5xl mx-auto flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900 border border-emerald-200 dark:border-emerald-700 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              Planning new week for{" "}
              <span className="font-semibold">{selectedBranch.branch_name}</span>
              <span className="font-normal text-emerald-700 dark:text-emerald-300"> · {formatDate(selectedMonday)} – {formatDate(selectedSunday)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page (with AppShell) ─────────────────────────────────────────────────────

export default function PlanNewWeekPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full text-indigo-600 font-semibold text-lg">
          Loading…
        </div>
      </AppShell>
    );
  }

  const userEmail = session?.user?.email || "";
  const userRole  = (session?.user as { role?: string } | undefined)?.role || "USER";
  const userName  = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <PlanNewWeekContent userRole={userRole} />
    </AppShell>
  );
}

// ─── Searchable branch dropdown ───────────────────────────────────────────────
// Type-to-filter combobox over the branch list (branch_name / location / region).
// `onSelect` receives the full Branch (or null when cleared).
function BranchCombobox({
  branches,
  selected,
  onSelect,
  loading,
  error,
}: {
  branches: Branch[];
  selected: Branch | null;
  onSelect: (b: Branch | null) => void;
  loading: boolean;
  error: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? branches.filter(b =>
        [b.branch_name, b.location ?? "", b.region ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : branches;

  const disabled = loading || error;
  const buttonLabel = loading
    ? "Loading…"
    : error
    ? "Failed to load"
    : selected
    ? selected.branch_name
    : "Select branch";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(o => !o); setQuery(""); } }}
        className={
          "w-full flex items-center justify-between gap-2 text-sm border rounded-xl px-3 py-2 bg-white dark:bg-slate-950 transition-colors " +
          "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 " +
          "disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-400 " +
          (open ? "border-indigo-400 ring-2 ring-indigo-400" : "border-slate-200 dark:border-slate-500")
        }
      >
        <span className={selected ? "text-slate-700 dark:text-slate-300 truncate" : "text-slate-400 truncate"}>
          {buttonLabel}
        </span>
        <ChevronRight className="w-4 h-4 text-slate-400 rotate-90 shrink-0" aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search branch…"
              className="w-full text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none bg-transparent"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">No branches match “{query}”.</li>
            ) : (
              filtered.map(b => {
                const isSel = selected?.branch_id === b.branch_id;
                return (
                  <li key={b.branch_id}>
                    <button
                      type="button"
                      onClick={() => { onSelect(b); setOpen(false); setQuery(""); }}
                      className={
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors " +
                        (isSel ? "bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")
                      }
                    >
                      <Check
                        className={"w-4 h-4 shrink-0 " + (isSel ? "text-indigo-600" : "text-transparent")}
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        <span className="font-medium">{b.branch_name}</span>
                        {b.location ? <span className="text-slate-400"> — {b.location}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
