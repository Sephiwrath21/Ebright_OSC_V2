"use client";

import { useEffect, useState } from "react";
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
    if (!current) cls += "text-slate-300";
    else if (inSelectedWeek) cls += "text-white font-semibold";
    else if (isToday) cls += "text-indigo-600 font-semibold underline";
    else cls += "text-slate-700";
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
        <div className={`flex-1 text-center text-xs py-1.5 px-2 rounded-lg border transition-colors ${selectedMonday ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium" : "border-slate-200 text-slate-400 bg-slate-50"}`}>
          {selectedMonday ? formatDate(selectedMonday) : "Start date"}
        </div>
        <div className={`flex-1 text-center text-xs py-1.5 px-2 rounded-lg border transition-colors ${selectedSunday ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium" : "border-slate-200 text-slate-400 bg-slate-50"}`}>
          {selectedSunday ? formatDate(selectedSunday) : "End date"}
        </div>
      </div>

      {/* Month/Year nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Previous month">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex gap-1.5">
          <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))} className="text-xs border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))} className="text-xs border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Next month">
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
                  ? "bg-emerald-50/70"
                  : rowStatus === "Updated"
                  ? "bg-amber-50/70"
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
        <div className="mt-2.5 flex items-center gap-3 pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-400 font-medium">Schedule:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium text-slate-500">Finalized</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] font-medium text-slate-500">Updated</span>
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

  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedMonday, setSelectedMonday] = useState<Date | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Existing schedules for the selected branch: ISO Monday → status
  const [scheduledWeeks, setScheduledWeeks] = useState<Record<string, string>>({});

  const selectedSunday = selectedMonday
    ? new Date(selectedMonday.getTime() + 6 * 86_400_000)
    : null;

  const OTHER_REGION = "Other";
  const regions = Array.from(
    new Set(branches.map(b => b.region?.trim() || OTHER_REGION))
  ).sort();
  const filteredBranches = selectedRegion
    ? branches.filter(b => (b.region?.trim() || OTHER_REGION) === selectedRegion)
    : [];

  // Load branches
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Branch[] = await res.json();
        if (cancelled) return;
        setBranches(data);
        if (!isAdmin && data.length > 0) {
          const first = data[0];
          setSelectedRegion(first.region?.trim() || OTHER_REGION);
          setSelectedBranch(first);
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

  function handleRegionChange(value: string) {
    setSelectedRegion(value);
    setSelectedBranch(null);
    setSelectedMonday(null);
    setConfirmed(false);
  }

  function handleBranchChange(value: string) {
    const id = Number(value);
    const branch = branches.find(b => b.branch_id === id) ?? null;
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

  const selectCls =
    "w-full text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-700 bg-white " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors " +
    "appearance-none disabled:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400";
  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236b7280' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 10px center" as const,
    paddingRight: "32px",
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-5">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/manpower-schedule" className="hover:text-slate-900 transition-colors">Manpower Planning</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Plan New Week</span>
        </nav>

        <div className="max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* ── Title header spanning both columns ── */}
          <div className="px-6 py-4 border-b border-slate-100">
            <h1 className="text-xl font-bold text-slate-900">Plan New Week</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Pick a branch and the upcoming week to build the new manpower roster.
            </p>
          </div>

          {/* ── 2-column content ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          {/* ── Step 1: Branch ── */}
          <div>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-semibold inline-flex items-center justify-center shrink-0">1</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900">Select branch</p>
                </div>
                <p className="text-xs text-slate-500">Choose the branch to plan manpower for</p>
              </div>
            </div>

            <div className="p-5 space-y-2.5">
              <select
                value={selectedRegion}
                onChange={e => handleRegionChange(e.target.value)}
                disabled={branchesLoading || !!branchesError}
                className={selectCls}
                style={selectStyle}
              >
                <option value="">
                  {branchesLoading ? "Loading…" : branchesError ? "Failed to load" : "Region"}
                </option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>

              <select
                value={selectedBranch?.branch_id ?? ""}
                onChange={e => handleBranchChange(e.target.value)}
                disabled={branchesLoading || !!branchesError || !selectedRegion}
                className={selectCls}
                style={selectStyle}
              >
                <option value="">{selectedRegion ? "Branch" : "Pick region first"}</option>
                {filteredBranches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name}{b.location ? ` — ${b.location}` : ""}
                  </option>
                ))}
              </select>

              {branchesError && <p className="text-xs text-rose-600">{branchesError}</p>}

              {selectedBranch ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                  <span className="text-xs text-indigo-700">
                    {selectedBranch.region ? `Region ${selectedBranch.region} · ` : ""}
                    <span className="font-semibold">{selectedBranch.branch_name}</span>
                    {" "}· {selectedBranch.staff_count}{" "}
                    {selectedBranch.staff_count === 1 ? "staff" : "staffs"}
                  </span>
                </div>
              ) : (
                <div className="h-9 rounded-xl border border-dashed border-slate-200 flex items-center justify-center">
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
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
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
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full text-white text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-colors ${selectedBranch ? "bg-indigo-600" : "bg-slate-300"}`}>2</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900">Select a week</p>
                </div>
                <p className="text-xs text-slate-500">Click any day — the full Mon–Sun week is selected</p>
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
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                    : "bg-amber-50 border border-amber-200 text-amber-700"
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
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
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
          <div className="mt-4 max-w-5xl flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium text-emerald-800">
              Planning new week for{" "}
              <span className="font-semibold">{selectedBranch.branch_name}</span>
              <span className="font-normal text-emerald-700"> · {formatDate(selectedMonday)} – {formatDate(selectedSunday)}</span>
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
