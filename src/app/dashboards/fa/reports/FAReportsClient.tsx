"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Home, ChevronRight, Filter,
  Pencil, Printer, Camera, Users,
} from "lucide-react";
import {
  BRANCHES, FA_REPORT_MAX_PER_CRITERION, faReportTotal,
  MOCK_EVENTS, MOCK_INVITATIONS, MOCK_REPORTS, BranchCode,
} from "./_mock";

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
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Filled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  );
}

export default function FAReportsClient() {
  const [branch,  setBranch]  = useState<BranchCode | "all">("all");
  const [eventId, setEventId] = useState("all");
  const [search,  setSearch]  = useState("");
  const [filled,  setFilled]  = useState<FilledFilter>("all");

  const sortedEvents = useMemo(
    () => [...MOCK_EVENTS].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [],
  );

  const reportByInvId = useMemo(() => {
    const m = new Map<string, typeof MOCK_REPORTS[number]>();
    for (const r of MOCK_REPORTS) m.set(r.invitationId, r);
    return m;
  }, []);

  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of MOCK_EVENTS) m.set(e.id, e.name);
    return m;
  }, []);

  const rows = useMemo(() => {
    const list = MOCK_INVITATIONS.map(inv => ({
      invitationId: inv.id,
      studentId:    inv.studentId,
      name:         inv.studentName,
      branch:       inv.branch,
      grade:        inv.grade,
      eventId:      inv.eventId,
      eventName:    eventNameById.get(inv.eventId) ?? "—",
      attendedAt:   inv.attendedAt,
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
  }, [branch, eventId, filled, search, reportByInvId, eventNameById]);

  const totalFilled = useMemo(() => rows.filter(r => r.report).length, [rows]);
  const coverage    = rows.length === 0 ? 0 : Math.round((totalFilled / rows.length) * 100);
  const totalMax    = FA_REPORT_MAX_PER_CRITERION * 4;

  const globalFilled   = MOCK_REPORTS.length;
  const globalTotal    = MOCK_INVITATIONS.length;
  const globalCoverage = Math.round((globalFilled / globalTotal) * 100);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-0">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <Link href="/dashboards/fa" className="hover:text-slate-900 transition-colors">FA System</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span className="text-slate-800 font-medium">Reports</span>
        </nav>

        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">FA Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              {globalTotal} students attended · {globalFilled} reports filled ({globalCoverage}%)
            </p>
          </div>
          {totalFilled > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-colors mb-0.5"
              title="Bulk export — backend not connected yet"
            >
              <Printer className="w-3.5 h-3.5" />
              Export {totalFilled} as PDF
            </button>
          )}
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, ID, or preparer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg w-60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>

          <select
            className="py-2 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="py-2 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ minWidth: 160 }}
            value={branch}
            onChange={e => setBranch(e.target.value as BranchCode | "all")}
          >
            <option value="all">All branches</option>
            {BRANCHES.map(b => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {FILLED_FILTERS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilled(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filled === f.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
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

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-10">
        {rows.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center">
            <Users className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No attendees match your filters.</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the branch, event, or status filters.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
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
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => {
                    const r = row.report;
                    const total = r ? faReportTotal(r) : null;
                    return (
                      <tr key={row.invitationId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 whitespace-nowrap">{row.name}</div>
                          <div className="text-xs text-slate-400 font-mono">#{row.studentId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {row.branch}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                          G{row.grade}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap max-w-[180px] truncate">
                          {row.eventName}
                        </td>
                        <td className="px-4 py-3">
                          <FilledBadge filled={!!r} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {total !== null ? (
                            <span className="font-mono text-sm font-semibold text-slate-900">
                              {total} <span className="text-slate-400 font-normal">/ {totalMax}</span>
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r?.preparedBy ? (
                            <span className="text-sm text-slate-700">{r.preparedBy}</span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r?.videoLink ? (
                            <a
                              href={r.videoLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-colors"
                            >
                              ▶ Watch
                            </a>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r?.evidencePhotoLink ? (
                            <a
                              href={r.evidencePhotoLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-colors"
                            >
                              <Camera className="w-3 h-3" /> View
                            </a>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/dashboards/fa/reports/${row.invitationId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              {r ? "Edit" : "Fill"}
                            </Link>
                            {r && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-colors"
                                title="Certificate print — backend not connected yet"
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
