"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Home as HomeIcon, ChevronRight, RefreshCw } from "lucide-react";
import AppShell from "@/app/components/AppShell";
import { ALL_BRANCHES } from "@/lib/manpowerUtils";
import BranchSearchSelect from "@/app/components/BranchSearchSelect";

interface ScheduleRecord {
  id: string;
  branch: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;
  status: "Finalized" | "Updated";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Page Content ─────────────────────────────────────────────────────────────

function UpdateScheduleContent() {
  const router = useRouter();
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [drillYear, setDrillYear] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<number | null>(null);

  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/schedules");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          setError(data.error ?? "Failed to load schedules");
          return;
        }
        const mapped: ScheduleRecord[] = data.schedules.map((s: ScheduleRecord) => ({
          id: s.id,
          branch: s.branch,
          startDate: s.startDate,
          endDate: s.endDate,
          status: (s.status as ScheduleRecord["status"]) ?? "Finalized",
        }));
        setRecords(mapped);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openRecord(r: ScheduleRecord) {
    const params = new URLSearchParams({
      branch: r.branch,
      start: r.startDate,
      end: r.endDate,
      mode: "update",
    });
    router.push(`/manpower-schedule/plan-new-week/grid?${params.toString()}`);
  }

  const filteredHistory = useMemo(
    () => records.filter(r => !filterBranch || r.branch === filterBranch),
    [records, filterBranch],
  );

  // ─── List view ──────────────────────────────────────────────────────────────

  const byYear: Record<string, ScheduleRecord[]> = {};
  filteredHistory.forEach(r => {
    const y = format(parseISO(r.startDate), "yyyy");
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(r);
  });

  const drilled =
    drillYear !== null && drillMonth !== null
      ? filteredHistory.filter(
          r =>
            format(parseISO(r.startDate), "yyyy") === drillYear &&
            parseInt(format(parseISO(r.startDate), "M")) - 1 === drillMonth,
        )
      : [];
  const distinctWeeks = Array.from(new Set(drilled.map(r => r.startDate)))
    .sort()
    .map(startDate => {
      const rec = drilled.find(r => r.startDate === startDate)!;
      return {
        startDate,
        endDate: rec.endDate,
        label: `${format(parseISO(startDate), "dd MMM")} – ${format(parseISO(rec.endDate), "dd MMM")}`,
      };
    });

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6"
        >
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <HomeIcon className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/manpower-schedule" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            Manpower Planning
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Update Manpower Schedule</span>
        </nav>

        {/* Page heading + branch filter on one line */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Update Manpower Schedule</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Adjust shifts and assignments for active weeks after the fact.</p>
          </div>
          <div className="w-full sm:w-64 shrink-0">
            <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
              Branch
            </label>
            <BranchSearchSelect
              value={filterBranch}
              onChange={v => {
                setFilterBranch(v);
                setDrillYear(null);
                setDrillMonth(null);
              }}
              branches={ALL_BRANCHES}
            />
          </div>
        </header>

        {/* List body */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Loading schedules...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-2xl p-6 text-center">
            <p className="text-red-600 dark:text-red-300 font-medium">{error}</p>
          </div>
        ) : drillYear !== null && drillMonth !== null ? (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-lg font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                {drillYear} <span className="text-slate-400">›</span>{" "}
                {MONTH_NAMES[drillMonth]}
              </h2>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {distinctWeeks.map((week, wi) => {
                const weekRecs = drilled.filter(r => r.startDate === week.startDate);
                return (
                  <div
                    key={week.startDate}
                    className={`flex gap-4 items-start px-5 py-4 ${
                      wi < distinctWeeks.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""
                    }`}
                  >
                    <div className="w-28 shrink-0 text-xs font-black text-slate-400 pt-2">
                      {week.label}
                    </div>
                    <div className="flex flex-wrap gap-2 flex-1">
                      {weekRecs.length > 0 ? (
                        weekRecs.map(record => (
                          <button
                            key={record.id}
                            onClick={() => openRecord(record)}
                            className="text-left bg-orange-50 dark:bg-orange-900 hover:bg-orange-100 dark:hover:bg-orange-800 border border-orange-200 dark:border-orange-700 hover:border-orange-300 dark:hover:border-orange-600 rounded-xl px-4 py-3 transition-colors min-w-[160px]"
                          >
                            <div className="font-black text-sm text-orange-800 dark:text-orange-200 uppercase tracking-wide">
                              {record.branch}
                            </div>
                            <div className="text-xs text-orange-500 dark:text-orange-300 font-bold mt-0.5">
                              {format(parseISO(record.startDate), "dd MMM")} –{" "}
                              {format(parseISO(record.endDate), "dd MMM")}
                            </div>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${
                                record.status === "Updated"
                                  ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                                  : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                              }`}
                            >
                              {record.status}
                            </span>
                          </button>
                        ))
                      ) : (
                        <span className="text-slate-200 dark:text-slate-600 text-sm font-bold pt-1">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : Object.keys(byYear).length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-center shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 font-bold text-lg uppercase tracking-widest">
              No schedules found.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(byYear)
              .sort((a, b) => parseInt(b) - parseInt(a))
              .map(year => {
                const recs = byYear[year];
                const monthCounts: Record<number, number> = {};
                recs.forEach(r => {
                  const mi = parseInt(format(parseISO(r.startDate), "M")) - 1;
                  monthCounts[mi] = (monthCounts[mi] || 0) + 1;
                });
                return (
                  <div
                    key={year}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                  >
                    <div className="bg-[#2D3F50] px-6 py-3">
                      <h2 className="text-white font-black text-xl uppercase tracking-widest">
                        {year}
                      </h2>
                    </div>
                    <div className="p-4 grid grid-cols-6 gap-2">
                      {Array.from({ length: 12 }, (_, mi) => {
                        const count = monthCounts[mi] || 0;
                        const hasRecords = count > 0;
                        return (
                          <button
                            key={mi}
                            onClick={() => {
                              if (hasRecords) {
                                setDrillYear(year);
                                setDrillMonth(mi);
                              }
                            }}
                            disabled={!hasRecords}
                            className={`rounded-xl py-3 px-2 text-center transition-colors ${
                              hasRecords
                                ? "bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                            }`}
                          >
                            <div className="font-black text-sm">{MONTH_SHORT[mi]}</div>
                            {hasRecords && (
                              <div className="text-[10px] mt-0.5 opacity-80">{count}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page (with AppShell + auth) ──────────────────────────────────────────────

export default function UpdateSchedulePage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full text-blue-600 font-semibold text-lg">
          Loading...
        </div>
      </AppShell>
    );
  }

  const userEmail = session?.user?.email ?? "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "USER";
  const userName = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <UpdateScheduleContent />
    </AppShell>
  );
}
