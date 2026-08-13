"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Home, ChevronRight, Filter,
  Pencil, Printer, Camera, Users, Loader2,
} from "lucide-react";
import {
  BRANCHES, FA_REPORT_MAX_PER_CRITERION, faReportTotal, gradeLabel, countsAsAttended,
  type FAEvent, type Invitation, type FAReport,
} from "@/lib/fa/types";

type FilledFilter = "all" | "filled" | "pending";

const FILLED_FILTERS: { label: string; value: FilledFilter }[] = [
  { label: "All",     value: "all"     },
  { label: "Filled",  value: "filled"  },
  { label: "Pending", value: "pending" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function FilledBadge({ filled }: { filled: boolean }) {
  return filled ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Filled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  );
}

export default function FAReportsClient() {
  const [branch,  setBranch]  = useState<string>("all");
  const [eventId, setEventId] = useState("all");
  const [search,  setSearch]  = useState("");
  const [filled,  setFilled]  = useState<FilledFilter>("all");

  const [events, setEvents]           = useState<FAEvent[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [reports, setReports]         = useState<FAReport[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dataRes, reportsRes] = await Promise.all([
          fetch("/api/fa/data", { cache: "no-store" }),
          fetch("/api/fa/reports", { cache: "no-store" }),
        ]);
        if (!dataRes.ok || !reportsRes.ok) throw new Error("Failed to load reports");
        const data = (await dataRes.json()) as { events: FAEvent[]; invitations: Invitation[] };
        const rep  = (await reportsRes.json()) as { reports: FAReport[] };
        if (!alive) return;
        setEvents(data.events ?? []);
        setInvitations(data.invitations ?? []);
        setReports(rep.reports ?? []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load reports");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Only students who actually attended (attended / walk_in) can carry a report.
  const attendees = useMemo(
    () => invitations.filter(i => countsAsAttended(i.status)),
    [invitations],
  );

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events],
  );

  const reportByInvId = useMemo(() => {
    const m = new Map<string, FAReport>();
    for (const r of reports) m.set(r.invitationId, r);
    return m;
  }, [reports]);

  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) m.set(e.id, e.name);
    return m;
  }, [events]);

  const rows = useMemo(() => {
    const list = attendees.map(inv => ({
      invitationId: inv.id,
      studentId:    inv.studentId,
      name:         inv.studentNameSnapshot || reportByInvId.get(inv.id)?.studentName || `#${inv.studentId}`,
      branch:       inv.branch,
      grade:        inv.targetGrade,
      eventId:      inv.eventId,
      eventName:    eventNameById.get(inv.eventId) ?? "—",
      attendedAt:   inv.attendanceMarkedAt ?? inv.invitedAt,
      report:       reportByInvId.get(inv.id),
    }));

    return list
      .filter(r => branch === "all" || r.branch === branch)
      .filter(r => eventId === "all" || r.eventId === eventId)
      .filter(r =>
        filled === "all"     ? true :
        filled === "filled"  ? !!r.report : !r.report,
      )
      .filter(r => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.studentId.toLowerCase().includes(q) ||
          (r.report?.preparedBy ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.report && b.report) return b.report.updatedAt.localeCompare(a.report.updatedAt);
        if (a.report) return -1;
        if (b.report) return 1;
        return b.attendedAt.localeCompare(a.attendedAt);
      });
  }, [attendees, branch, eventId, filled, search, reportByInvId, eventNameById]);

  const totalFilled = useMemo(() => rows.filter(r => r.report).length, [rows]);
  const coverage    = rows.length === 0 ? 0 : Math.round((totalFilled / rows.length) * 100);
  const totalMax    = FA_REPORT_MAX_PER_CRITERION * 4;

  const globalFilled   = reports.length;
  const globalTotal    = attendees.length;
  const globalCoverage = globalTotal === 0 ? 0 : Math.round((globalFilled / globalTotal) * 100);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-0">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <Link href="/dashboards/fa" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">FA System</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <span className="text-slate-800 dark:text-slate-200 font-medium">Reports</span>
        </nav>

        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">FA Reports</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {globalTotal} students attended · {globalFilled} reports filled ({globalCoverage}%)
            </p>
          </div>
          {totalFilled > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mb-0.5"
              title="Bulk export — not connected yet"
            >
              <Printer className="w-3.5 h-3.5" />
              Export {totalFilled} as PDF
            </button>
          )}
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, ID, or preparer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100 rounded-lg w-60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>

          <select
            className="py-2 px-3 text-sm bg-white border border-slate-200 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ minWidth: 220 }}
            value={eventId}
            onChange={e => setEventId(e.target.value)}
          >
            <option value="all">All events</option>
            {sortedEvents.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({fmtDate(ev.startDate)})
              </option>
            ))}
          </select>

          <select
            className="py-2 px-3 text-sm bg-white border border-slate-200 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ minWidth: 160 }}
            value={branch}
            onChange={e => setBranch(e.target.value)}
          >
            <option value="all">All branches</option>
            {BRANCHES.map(b => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1">
            {FILLED_FILTERS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilled(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filled === f.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-slate-400 shrink-0">
            {rows.length} row{rows.length !== 1 ? "s" : ""}
            {rows.length > 0 && <> · {coverage}% filled</>}
          </span>
        </div>
      </div>

      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-16 flex flex-col items-center text-center">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading reports…</p>
          </div>
        ) : error ? (
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-2xl p-8 text-center">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 flex flex-col items-center text-center">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No attendees match your filters.</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the branch, event, or status filters.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Student</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Branch</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Grade</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Event</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Total</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Prepared by</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Video</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Evidence</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map(row => {
                    const r = row.report;
                    const total = r ? faReportTotal(r) : null;
                    return (
                      <tr key={row.invitationId} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{row.name}</div>
                          <div className="text-xs text-slate-400 font-mono">#{row.studentId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {row.branch}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {gradeLabel(row.grade)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[180px] truncate">
                          {row.eventName}
                        </td>
                        <td className="px-4 py-3">
                          <FilledBadge filled={!!r} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {total !== null ? (
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {total} <span className="text-slate-400 font-normal">/ {totalMax}</span>
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r?.preparedBy ? (
                            <span className="text-sm text-slate-700 dark:text-slate-300">{r.preparedBy}</span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r?.videoLink ? (
                            <a
                              href={r.videoLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
                            >
                              ▶ Watch
                            </a>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r?.evidencePhotoLink ? (
                            <a
                              href={r.evidencePhotoLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
                            >
                              <Camera className="w-3 h-3" /> View
                            </a>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/dashboards/fa/reports/${row.invitationId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              {r ? "Edit" : "Fill"}
                            </Link>
                            {r && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
                                title="Certificate print — not connected yet"
                              >
                                <Printer className="w-3 h-3" /> Print
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
