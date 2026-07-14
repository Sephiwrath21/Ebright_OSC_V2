"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import {
  CalendarDays, Users, CheckCircle2, XCircle,
  MapPin, Home, ChevronRight, BarChart3,
} from "lucide-react";
import { useBreadcrumb } from "@/app/components/BreadcrumbContext";
import {
  BRANCHES, MOCK_DASH_EVENTS, MOCK_DASH_SESSIONS, MOCK_DASH_QUOTAS, MOCK_DASH_INVS,
  countsAsConfirmed,
  type BranchCode, type EventStatus,
} from "./_mock";

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<EventStatus, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-slate-100 text-slate-500" },
  open:      { label: "Open",      cls: "bg-blue-50 text-blue-700" },
  closed:    { label: "Closed",    cls: "bg-slate-100 text-slate-500" },
  ongoing:   { label: "Ongoing",   cls: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700" },
};

function StatusPill({ status }: { status: EventStatus }) {
  const { label, cls } = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Fill / attendance rate bar ────────────────────────────────────────────────
function RateBar({ rate, tone = "slate" }: { rate: number; tone?: "slate" | "emerald" }) {
  const pct = Math.min(100, Math.round(rate * 100));
  return (
    <div className="inline-flex items-center gap-2 w-24">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${tone === "emerald" ? "bg-emerald-500" : "bg-slate-700"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-slate-600 w-7 text-right">{pct}%</span>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPICard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  accent?: "slate" | "emerald" | "red";
}) {
  const bg = accent === "emerald" ? "bg-emerald-600" : accent === "red" ? "bg-red-500" : "bg-slate-800";
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center">
      <div className={`w-9 h-9 rounded-[10px] ${bg} flex items-center justify-center mb-3 mx-auto`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rateColor(rate: number): string {
  if (rate > 0.90) return "text-emerald-600";
  if (rate >= 0.75) return "text-amber-500";
  return "text-red-500";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

// ── Shared table header cell ──────────────────────────────────────────────────
function TH({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest ${center ? "text-center" : "text-left"}`}>
      {children}
    </th>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FADashboardClient() {
  useBreadcrumb([
    { label: "Home", href: "/home" },
    { label: "FA System", href: "/dashboards/fa" },
    { label: "Dashboard" },
  ]);

  const years = useMemo(
    () => Array.from(new Set(MOCK_DASH_EVENTS.map(e => e.year))).sort((a, b) => b - a),
    []
  );

  const [yearFilter, setYearFilter]     = useState<number | "all">("all");
  const [eventFilter, setEventFilter]   = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">("all");

  const eventsForFilter = useMemo(
    () =>
      MOCK_DASH_EVENTS
        .filter(e => yearFilter === "all" || e.year === yearFilter)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [yearFilter]
  );

  useEffect(() => {
    if (eventFilter !== "all" && !eventsForFilter.some(e => e.id === eventFilter)) {
      setEventFilter("all");
    }
  }, [eventFilter, eventsForFilter]);

  // Per-event stats
  const eventStats = useMemo(() => {
    return MOCK_DASH_EVENTS
      .filter(e => yearFilter === "all" || e.year === yearFilter)
      .filter(e => eventFilter === "all" || e.id === eventFilter)
      .map(event => {
        const sessionIds = new Set(
          MOCK_DASH_SESSIONS.filter(s => s.eventId === event.id).map(s => s.id)
        );
        let relevantQuotas = MOCK_DASH_QUOTAS.filter(q => sessionIds.has(q.sessionId));
        let relevantInvs   = MOCK_DASH_INVS.filter(i => i.eventId === event.id);
        if (branchFilter !== "all") {
          relevantQuotas = relevantQuotas.filter(q => q.branch === branchFilter);
          relevantInvs   = relevantInvs.filter(i => i.branch === branchFilter);
        }
        const totalQuota = relevantQuotas.reduce((sum, q) => sum + q.quota, 0);
        const invited    = relevantInvs.length;
        const confirmed  = relevantInvs.filter(i => countsAsConfirmed(i.status)).length;
        const attended   = relevantInvs.filter(i => i.status === "attended").length;
        const noShow     = relevantInvs.filter(i => i.status === "no_show").length;
        return {
          event,
          sessionCount: sessionIds.size,
          totalQuota,
          invited,
          confirmed,
          attended,
          noShow,
          fillRate: totalQuota > 0 ? invited / totalQuota : 0,
        };
      })
      .sort((a, b) => b.event.startDate.localeCompare(a.event.startDate));
  }, [yearFilter, eventFilter, branchFilter]);

  const totals = useMemo(() =>
    eventStats.reduce(
      (acc, s) => ({
        events:    acc.events + 1,
        slots:     acc.slots + s.totalQuota,
        invited:   acc.invited + s.invited,
        confirmed: acc.confirmed + s.confirmed,
        attended:  acc.attended + s.attended,
        noShow:    acc.noShow + s.noShow,
      }),
      { events: 0, slots: 0, invited: 0, confirmed: 0, attended: 0, noShow: 0 }
    ),
    [eventStats]
  );

  const totalMarked  = totals.attended + totals.noShow;
  const overallRate  = totalMarked > 0 ? totals.attended / totalMarked : 0;

  // Attendance by branch
  const attendanceByBranch = useMemo(() => {
    const eventIds = new Set(
      MOCK_DASH_EVENTS
        .filter(e => yearFilter === "all" || e.year === yearFilter)
        .filter(e => eventFilter === "all" || e.id === eventFilter)
        .map(e => e.id)
    );
    const branches = branchFilter === "all" ? BRANCHES : BRANCHES.filter(b => b.code === branchFilter);
    return branches
      .map(b => {
        const bInvs    = MOCK_DASH_INVS.filter(i => eventIds.has(i.eventId) && i.branch === b.code);
        const invited  = bInvs.length;
        const confirmed = bInvs.filter(i => countsAsConfirmed(i.status)).length;
        const attended  = bInvs.filter(i => i.status === "attended").length;
        const absent    = bInvs.filter(i => i.status === "no_show").length;
        const marked    = attended + absent;
        return { branch: b, invited, confirmed, attended, absent, marked, rate: marked > 0 ? attended / marked : 0 };
      })
      .filter(row => branchFilter !== "all" || row.marked > 0)
      .sort((a, b) => a.rate - b.rate || b.invited - a.invited);
  }, [yearFilter, eventFilter, branchFilter]);

  // Branch breakdown (all-branch view only)
  const branchBreakdown = useMemo(() => {
    if (branchFilter !== "all") return null;
    const eventIds = new Set(
      MOCK_DASH_EVENTS
        .filter(e => yearFilter === "all" || e.year === yearFilter)
        .filter(e => eventFilter === "all" || e.id === eventFilter)
        .map(e => e.id)
    );
    const sessionIds = new Set(
      MOCK_DASH_SESSIONS.filter(s => eventIds.has(s.eventId)).map(s => s.id)
    );
    return BRANCHES
      .map(b => {
        const bQuotas   = MOCK_DASH_QUOTAS.filter(q => sessionIds.has(q.sessionId) && q.branch === b.code);
        const bInvs     = MOCK_DASH_INVS.filter(i => eventIds.has(i.eventId) && i.branch === b.code);
        const totalQuota = bQuotas.reduce((sum, q) => sum + q.quota, 0);
        const invited   = bInvs.length;
        const confirmed = bInvs.filter(i => countsAsConfirmed(i.status)).length;
        const attended  = bInvs.filter(i => i.status === "attended").length;
        const noShow    = bInvs.filter(i => i.status === "no_show").length;
        const marked    = attended + noShow;
        return {
          branch: b, totalQuota, invited, confirmed, attended,
          fillRate: totalQuota > 0 ? invited / totalQuota : 0,
          attRate:  marked > 0 ? attended / marked : 0,
        };
      })
      .filter(b => b.totalQuota > 0)
      .sort((a, b) => b.attended - a.attended);
  }, [yearFilter, eventFilter, branchFilter]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <Link href="/dashboards/fa" className="hover:text-slate-900 transition-colors">FA System</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span className="text-slate-800 font-medium">Dashboard</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">FA System</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of Foundation Appraisal performance across all events.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Year</label>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              >
                <option value="all">All years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Event</label>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                value={eventFilter}
                onChange={e => setEventFilter(e.target.value)}
                disabled={eventsForFilter.length === 0}
              >
                <option value="all">All events</option>
                {eventsForFilter.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Branch</label>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
              >
                <option value="all">All branches</option>
                {BRANCHES.map(b => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KPICard
            icon={CalendarDays}
            label="Events"
            value={totals.events}
            accent="slate"
          />
          <KPICard
            icon={Users}
            label="Invited"
            value={totals.invited}
            sub={totals.slots > 0 ? `${Math.round(totals.invited / totals.slots * 100)}% of ${totals.slots} slots` : undefined}
          />
          <KPICard
            icon={CheckCircle2}
            label="Attended"
            value={totals.attended}
            sub={totals.confirmed > 0 ? `${Math.round(totals.attended / totals.confirmed * 100)}% of confirmed` : undefined}
            accent="emerald"
          />
          <KPICard
            icon={XCircle}
            label="Absent"
            value={totals.noShow}
            sub={totals.confirmed > 0 ? `${Math.round(totals.noShow / totals.confirmed * 100)}% of confirmed` : undefined}
            accent="red"
          />
        </div>

        {/* ── Attendance rate ── */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Attendance rate
          </p>

          {totalMarked === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-400">
              Attendance not recorded yet.
            </div>
          ) : (
            <>
              {/* Overall rate card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Overall attendance rate
                </p>
                <div className="flex items-baseline gap-4 mt-2">
                  <span className={`text-5xl font-bold leading-none ${rateColor(overallRate)}`}>
                    {(overallRate * 100).toFixed(1)}%
                  </span>
                  <span className="text-sm text-slate-500">
                    <span className="text-emerald-600 font-semibold">{totals.attended}</span>
                    {" attended of "}
                    <span className="font-semibold text-slate-900">{totalMarked}</span>
                    {" marked"}
                  </span>
                </div>
              </div>

              {/* Per-branch breakdown */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <TH>Branch</TH>
                      <TH center>Invited</TH>
                      <TH center>Confirmed</TH>
                      <TH center>Attended</TH>
                      <TH center>Absent</TH>
                      <TH center>Att. rate</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceByBranch.map(row => (
                      <tr key={row.branch.code} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {row.branch.code}
                            </span>
                            <span className="text-slate-900">{row.branch.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-slate-700">{row.invited}</td>
                        <td className="px-4 py-3 text-center font-mono text-slate-700">{row.confirmed}</td>
                        <td className="px-4 py-3 text-center font-mono text-emerald-600 font-medium">{row.attended}</td>
                        <td className="px-4 py-3 text-center font-mono text-red-500 font-medium">{row.absent}</td>
                        <td className="px-4 py-3 text-center font-mono">
                          {row.marked > 0 ? (
                            <span className={`font-semibold ${rateColor(row.rate)}`}>
                              {(row.rate * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── By event ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">By event</p>
            <span className="text-xs text-slate-400">
              {eventStats.length} event{eventStats.length !== 1 ? "s" : ""}
            </span>
          </div>

          {eventStats.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center">
              <BarChart3 className="w-8 h-8 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">No data for this filter</p>
              <p className="text-xs text-slate-400 mt-1">Try selecting a different year or branch.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <TH>Event</TH>
                    <TH>Date</TH>
                    <TH>Status</TH>
                    <TH center>Slots</TH>
                    <TH center>Invited</TH>
                    <TH center>Confirmed</TH>
                    <TH center>Attended</TH>
                    <TH center>Fill rate</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eventStats.map(({ event, sessionCount, totalQuota, invited, confirmed, attended, noShow, fillRate }) => (
                    <tr key={event.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href="/dashboards/fa/events"
                          className="block hover:text-blue-600 transition-colors"
                        >
                          <div className="font-medium text-slate-900">{event.name}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {event.venue}
                            <span className="mx-1">·</span>
                            {sessionCount} session{sessionCount !== 1 ? "s" : ""}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(event.startDate)}</td>
                      <td className="px-4 py-3"><StatusPill status={event.status} /></td>
                      <td className="px-4 py-3 text-center font-mono text-slate-700">{totalQuota}</td>
                      <td className="px-4 py-3 text-center font-mono text-slate-700">{invited}</td>
                      <td className="px-4 py-3 text-center font-mono text-slate-700">{confirmed}</td>
                      <td className="px-4 py-3 text-center font-mono">
                        <span className="text-emerald-600 font-medium">{attended}</span>
                        {noShow > 0 && (
                          <span className="text-red-400 text-xs"> / {noShow} absent</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <RateBar rate={fillRate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── By branch ── */}
        {branchBreakdown && branchBreakdown.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">By branch</p>
              <span className="text-xs text-slate-400">{branchBreakdown.length} active branches</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <TH>Branch</TH>
                    <TH center>Slots</TH>
                    <TH center>Invited</TH>
                    <TH center>Confirmed</TH>
                    <TH center>Attended</TH>
                    <TH center>Fill rate</TH>
                    <TH center>Att. rate</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchBreakdown.map(b => (
                    <tr key={b.branch.code} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {b.branch.code}
                          </span>
                          <span className="text-slate-900">{b.branch.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-700">{b.totalQuota}</td>
                      <td className="px-4 py-3 text-center font-mono text-slate-700">{b.invited}</td>
                      <td className="px-4 py-3 text-center font-mono text-slate-700">{b.confirmed}</td>
                      <td className="px-4 py-3 text-center font-mono text-emerald-600 font-medium">{b.attended}</td>
                      <td className="px-4 py-3 text-center"><RateBar rate={b.fillRate} /></td>
                      <td className="px-4 py-3 text-center"><RateBar rate={b.attRate} tone="emerald" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
