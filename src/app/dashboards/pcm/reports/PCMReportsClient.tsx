"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Home, ChevronRight, ClipboardCheck, Search, Printer, Loader2,
} from "lucide-react";
import {
  BRANCHES as PCM_BRANCHES, gradeLabel,
  type FAEvent as RawEvent, type Invitation as RawInvitation, type PcmReport as RawReport,
} from "@/lib/pcm/types";

type BranchCode = string;

interface PCMReport {
  id: string;
  invitationId: string;
  eventId: string;
  studentId: string;
  studentName: string;
  branch: BranchCode;
  grade: number;
  preparedBy: string;
  confidenceScore: number;
  voiceClarityScore: number;
  eyeContactScore: number;
  ideaExpressionScore: number;
  createdAt: string;
  updatedAt: string;
}

interface MockEvent {
  id: string;
  name: string;
  shortLabel: string;
}

const BRANCH_NAMES: Record<string, string> = Object.fromEntries(PCM_BRANCHES.map(b => [b.code, b.name]));
const BRANCHES: string[] = PCM_BRANCHES.map(b => b.code);

interface PCMDataBundle {
  events: RawEvent[];
  invitations: RawInvitation[];
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortLabelOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS_SHORT[m - 1]} ${y}` : iso;
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

const SCORE_STYLE = (sc: number) =>
  sc >= 5 ? "bg-emerald-100 text-emerald-700" :
  sc >= 4 ? "bg-teal-50 text-teal-700" :
  sc >= 3 ? "bg-blue-50 text-blue-700" :
            "bg-amber-50 text-amber-700";


// ─── Component ────────────────────────────────────────────────────────────────

export default function PCMReportsClient() {
  const [eventId, setEventId] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [reports, setReports]           = useState<PCMReport[]>([]);
  const [events, setEvents]             = useState<MockEvent[]>([]);
  const [attendedPerEvent, setAttendedPerEvent] = useState<Record<string, number>>({});
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [reportsRes, dataRes] = await Promise.all([
          fetch("/api/pcm/reports", { cache: "no-store" }),
          fetch("/api/pcm/data", { cache: "no-store" }),
        ]);
        if (!reportsRes.ok || !dataRes.ok) throw new Error("Failed to load reports");
        const rep = (await reportsRes.json()) as { reports: RawReport[] };
        const data = (await dataRes.json()) as PCMDataBundle;
        if (!alive) return;

        // Reports key on invitationId; resolve each report's event via its
        // invitation, and tally attended per event (v1 rule: status==="attended").
        const invById = new Map<string, RawInvitation>();
        const attended: Record<string, number> = {};
        for (const i of data.invitations ?? []) {
          invById.set(i.id, i);
          if (i.status === "attended") attended[i.eventId] = (attended[i.eventId] ?? 0) + 1;
        }
        setEvents((data.events ?? [])
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
          .map(e => ({ id: e.id, name: e.name, shortLabel: shortLabelOf(e.startDate) })));
        setAttendedPerEvent(attended);
        setReports((rep.reports ?? []).map(r => ({
          id: r.id,
          invitationId: r.invitationId,
          eventId: invById.get(r.invitationId)?.eventId ?? "",
          studentId: r.studentId,
          studentName: r.studentName,
          branch: r.branch,
          grade: r.grade,
          preparedBy: r.preparedBy,
          confidenceScore: r.confidenceScore,
          voiceClarityScore: r.voiceClarityScore,
          eyeContactScore: r.eyeContactScore,
          ideaExpressionScore: r.ideaExpressionScore,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load reports");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    let list = [...reports];
    if (eventId !== "all") list = list.filter(r => r.eventId === eventId);
    if (branchFilter !== "all") list = list.filter(r => r.branch === branchFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r =>
      r.studentName.toLowerCase().includes(q) ||
      r.studentId.toLowerCase().includes(q) ||
      r.preparedBy.toLowerCase().includes(q),
    );
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [reports, eventId, branchFilter, search]);

  const coverageInfo = useMemo(() => {
    if (eventId === "all") {
      const totalAttended = Object.values(attendedPerEvent).reduce((s, n) => s + n, 0);
      return { attended: totalAttended, coverage: totalAttended === 0 ? 0 : Math.round((filtered.length / totalAttended) * 100) };
    }
    const attended = attendedPerEvent[eventId] ?? 0;
    return { attended, coverage: attended === 0 ? 0 : Math.round((filtered.length / attended) * 100) };
  }, [eventId, filtered.length, attendedPerEvent]);

  const EVENT_BY_ID = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full mx-auto px-4 md:px-6 py-8 space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/dashboards" className="hover:text-slate-900 flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> Home
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <Link href="/dashboards/pcm" className="hover:text-slate-900">PCM System</Link>
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <span className="text-slate-900 font-medium">Reports</span>
        </nav>

        {/* Masthead */}
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">PCM System</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-slate-400" aria-hidden="true" />
            Assessment Reports
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} report{filtered.length !== 1 ? "s" : ""}
            {coverageInfo.attended > 0 && (
              <> · <strong className="text-slate-700">{coverageInfo.coverage}%</strong> of attended students assessed</>
            )}
          </p>
        </div>

        {/* Filter card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[250px]"
              value={eventId}
              onChange={e => setEventId(e.target.value)}
            >
              <option value="all">All events</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name} ({ev.shortLabel})</option>
              ))}
            </select>

            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
            >
              <option value="all">All branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b} — {BRANCH_NAMES[b]}</option>)}
            </select>

            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search student name, ID, or coach…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Reports table card */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Reports</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{filtered.length} of {reports.length} total</span>
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print all {filtered.length}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center text-center">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
              <p className="text-sm text-slate-500">Loading reports…</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center"><p className="text-sm font-medium text-red-600">{error}</p></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto mb-3 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">No reports match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Branch</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Grade</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Coach</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Scores
                      <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-slate-300">C · V · E · I</span>
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(r => {
                    const total = r.confidenceScore + r.voiceClarityScore + r.eyeContactScore + r.ideaExpressionScore;
                    const ev = EVENT_BY_ID.get(r.eventId);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{r.studentName}</div>
                          <div className="text-xs text-slate-400">#{r.studentId}</div>
                          {ev && <div className="text-[11px] text-slate-400 mt-0.5">{ev.shortLabel}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold tracking-wide font-mono">
                            {r.branch}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700">
                          {gradeLabel(r.grade)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {r.preparedBy || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {[r.confidenceScore, r.voiceClarityScore, r.eyeContactScore, r.ideaExpressionScore].map((sc, i) => (
                              <span key={i} className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${SCORE_STYLE(sc)}`}>
                                {sc}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-bold text-emerald-700">{total}</span>
                          <span className="text-slate-400 text-xs"> / 20</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Link
                              href={`/dashboards/pcm/reports/${r.invitationId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              Edit
                            </Link>
                            <Link
                              href={`/dashboards/pcm/reports/${r.invitationId}/certificate`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                            >
                              <Printer className="w-3 h-3" /> Print
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
