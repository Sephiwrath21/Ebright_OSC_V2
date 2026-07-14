"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Home, ChevronRight, ClipboardCheck, Search, Printer,
} from "lucide-react";

type BranchCode = "PJ" | "SA" | "SP" | "KD" | "SE" | "JB";

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_EVENTS: MockEvent[] = [
  { id: "pcm-001", name: "PCM Jul 2026 Weekly Showcase", shortLabel: "14 Jul 2026" },
  { id: "pcm-a1",  name: "PCM Jan 2025 Weekly Showcase", shortLabel: "6 Jan 2025" },
  { id: "pcm-a2",  name: "PCM Mar 2026 Weekly Showcase", shortLabel: "9 Mar 2026" },
  { id: "pcm-a3",  name: "PCM May 2026 Weekly Showcase", shortLabel: "11 May 2026" },
];

const MOCK_REPORTS: PCMReport[] = [
  // pcm-a1 (Jan 2025)
  { id: "r001", invitationId: "inv-a01", eventId: "pcm-a1", studentId: "S0001", studentName: "Ahmad Fariz",    branch: "PJ", grade: 4,  preparedBy: "Coach Azri",  confidenceScore: 4, voiceClarityScore: 5, eyeContactScore: 4, ideaExpressionScore: 4, createdAt: "2025-01-08", updatedAt: "2025-01-08" },
  { id: "r002", invitationId: "inv-a02", eventId: "pcm-a1", studentId: "S0002", studentName: "Nurul Ain",      branch: "PJ", grade: 6,  preparedBy: "Coach Azri",  confidenceScore: 3, voiceClarityScore: 4, eyeContactScore: 3, ideaExpressionScore: 4, createdAt: "2025-01-08", updatedAt: "2025-01-08" },
  { id: "r003", invitationId: "inv-a04", eventId: "pcm-a1", studentId: "S0005", studentName: "Siti Maisarah",  branch: "SA", grade: 7,  preparedBy: "Coach Lina",  confidenceScore: 5, voiceClarityScore: 5, eyeContactScore: 4, ideaExpressionScore: 5, createdAt: "2025-01-09", updatedAt: "2025-01-09" },
  { id: "r004", invitationId: "inv-a05", eventId: "pcm-a1", studentId: "S0010", studentName: "Rina Yusof",     branch: "SA", grade: 5,  preparedBy: "Coach Lina",  confidenceScore: 4, voiceClarityScore: 3, eyeContactScore: 4, ideaExpressionScore: 3, createdAt: "2025-01-09", updatedAt: "2025-01-09" },
  { id: "r005", invitationId: "inv-a06", eventId: "pcm-a1", studentId: "S0011", studentName: "Danial Haris",   branch: "SP", grade: 1,  preparedBy: "Coach Faiz",  confidenceScore: 2, voiceClarityScore: 3, eyeContactScore: 2, ideaExpressionScore: 3, createdAt: "2025-01-10", updatedAt: "2025-01-10" },
  { id: "r006", invitationId: "inv-a08", eventId: "pcm-a1", studentId: "S0016", studentName: "Rayyan Malik",   branch: "SE", grade: 5,  preparedBy: "Coach Zara",  confidenceScore: 4, voiceClarityScore: 4, eyeContactScore: 5, ideaExpressionScore: 4, createdAt: "2025-01-11", updatedAt: "2025-01-11" },

  // pcm-a2 (Mar 2026)
  { id: "r007", invitationId: "inv-b01", eventId: "pcm-a2", studentId: "S0001", studentName: "Ahmad Fariz",    branch: "PJ", grade: 5,  preparedBy: "Coach Azri",  confidenceScore: 4, voiceClarityScore: 5, eyeContactScore: 5, ideaExpressionScore: 4, createdAt: "2026-03-11", updatedAt: "2026-03-11" },
  { id: "r008", invitationId: "inv-b02", eventId: "pcm-a2", studentId: "S0004", studentName: "Hafiz Zain",     branch: "PJ", grade: 3,  preparedBy: "Coach Azri",  confidenceScore: 3, voiceClarityScore: 3, eyeContactScore: 4, ideaExpressionScore: 3, createdAt: "2026-03-11", updatedAt: "2026-03-11" },
  { id: "r009", invitationId: "inv-b03", eventId: "pcm-a2", studentId: "S0005", studentName: "Siti Maisarah",  branch: "SA", grade: 8,  preparedBy: "Coach Lina",  confidenceScore: 5, voiceClarityScore: 5, eyeContactScore: 5, ideaExpressionScore: 5, createdAt: "2026-03-12", updatedAt: "2026-03-12" },
  { id: "r010", invitationId: "inv-b04", eventId: "pcm-a2", studentId: "S0013", studentName: "Zafran Idris",   branch: "KD", grade: 5,  preparedBy: "Coach Razi",  confidenceScore: 4, voiceClarityScore: 4, eyeContactScore: 3, ideaExpressionScore: 4, createdAt: "2026-03-13", updatedAt: "2026-03-13" },
  { id: "r011", invitationId: "inv-b05", eventId: "pcm-a2", studentId: "S0014", studentName: "Aisyah Noor",    branch: "KD", grade: 10, preparedBy: "Coach Razi",  confidenceScore: 4, voiceClarityScore: 5, eyeContactScore: 4, ideaExpressionScore: 4, createdAt: "2026-03-13", updatedAt: "2026-03-13" },
  { id: "r012", invitationId: "inv-b06", eventId: "pcm-a2", studentId: "S0016", studentName: "Rayyan Malik",   branch: "SE", grade: 6,  preparedBy: "Coach Zara",  confidenceScore: 5, voiceClarityScore: 4, eyeContactScore: 5, ideaExpressionScore: 4, createdAt: "2026-03-14", updatedAt: "2026-03-14" },

  // pcm-a3 (May 2026)
  { id: "r013", invitationId: "inv-c01", eventId: "pcm-a3", studentId: "S0001", studentName: "Ahmad Fariz",    branch: "PJ", grade: 5,  preparedBy: "Coach Azri",  confidenceScore: 5, voiceClarityScore: 5, eyeContactScore: 5, ideaExpressionScore: 4, createdAt: "2026-05-13", updatedAt: "2026-05-13" },
  { id: "r014", invitationId: "inv-c02", eventId: "pcm-a3", studentId: "S0005", studentName: "Siti Maisarah",  branch: "SA", grade: 8,  preparedBy: "Coach Lina",  confidenceScore: 5, voiceClarityScore: 4, eyeContactScore: 5, ideaExpressionScore: 5, createdAt: "2026-05-13", updatedAt: "2026-05-13" },
  { id: "r015", invitationId: "inv-c03", eventId: "pcm-a3", studentId: "S0015", studentName: "Yasmin Osman",   branch: "PJ", grade: 12, preparedBy: "Coach Azri",  confidenceScore: 5, voiceClarityScore: 5, eyeContactScore: 4, ideaExpressionScore: 5, createdAt: "2026-05-14", updatedAt: "2026-05-14" },
  { id: "r016", invitationId: "inv-c04", eventId: "pcm-a3", studentId: "S0017", studentName: "Amira Saad",     branch: "SA", grade: 13, preparedBy: "Coach Lina",  confidenceScore: 5, voiceClarityScore: 5, eyeContactScore: 5, ideaExpressionScore: 5, createdAt: "2026-05-15", updatedAt: "2026-05-15" },
  { id: "r017", invitationId: "inv-c05", eventId: "pcm-a3", studentId: "S0011", studentName: "Danial Haris",   branch: "SP", grade: 2,  preparedBy: "Coach Faiz",  confidenceScore: 3, voiceClarityScore: 4, eyeContactScore: 3, ideaExpressionScore: 3, createdAt: "2026-05-15", updatedAt: "2026-05-15" },
  { id: "r018", invitationId: "inv-c06", eventId: "pcm-a3", studentId: "S0013", studentName: "Zafran Idris",   branch: "KD", grade: 5,  preparedBy: "Coach Razi",  confidenceScore: 4, voiceClarityScore: 5, eyeContactScore: 4, ideaExpressionScore: 5, createdAt: "2026-05-16", updatedAt: "2026-05-16" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRANCH_NAMES: Record<BranchCode, string> = {
  PJ: "Petaling Jaya", SA: "Shah Alam", SP: "Seri Petaling",
  KD: "Kepong Damansara", SE: "Selayang", JB: "Johor Bahru",
};

const BRANCHES: BranchCode[] = ["PJ", "SA", "SP", "KD", "SE", "JB"];

function gradeLabel(g: number): string {
  return g <= 12 ? `G${g}` : `GB${g - 12}`;
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

// Mock attended counts per event (for coverage %)
const ATTENDED_PER_EVENT: Record<string, number> = {
  "pcm-a1": 6,
  "pcm-a2": 8,
  "pcm-a3": 10,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PCMReportsClient() {
  const [eventId, setEventId] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = [...MOCK_REPORTS];
    if (eventId !== "all") list = list.filter(r => r.eventId === eventId);
    if (branchFilter !== "all") list = list.filter(r => r.branch === branchFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r =>
      r.studentName.toLowerCase().includes(q) ||
      r.studentId.toLowerCase().includes(q) ||
      r.preparedBy.toLowerCase().includes(q),
    );
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [eventId, branchFilter, search]);

  const coverageInfo = useMemo(() => {
    if (eventId === "all") {
      const totalAttended = Object.values(ATTENDED_PER_EVENT).reduce((s, n) => s + n, 0);
      return { attended: totalAttended, coverage: totalAttended === 0 ? 0 : Math.round((filtered.length / totalAttended) * 100) };
    }
    const attended = ATTENDED_PER_EVENT[eventId] ?? 0;
    return { attended, coverage: attended === 0 ? 0 : Math.round((filtered.length / attended) * 100) };
  }, [eventId, filtered.length]);

  const EVENT_BY_ID = useMemo(() => new Map(MOCK_EVENTS.map(e => [e.id, e])), []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">

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
              {MOCK_EVENTS.map(ev => (
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
              <span className="text-xs text-slate-400">{filtered.length} of {MOCK_REPORTS.length} total</span>
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

          {filtered.length === 0 ? (
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
