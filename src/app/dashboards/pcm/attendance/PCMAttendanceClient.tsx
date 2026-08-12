"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ClipboardCheck, CalendarDays, Users, MapPin, Search, Download, ChevronRight, Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  BRANCHES as PCM_BRANCHES, gradeLabel,
  type FAEvent as RawEvent, type Session as RawSession, type Invitation as RawInvitation,
} from "@/lib/pcm/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type BranchCode = string;
type AttStatus = "invited" | "confirmed" | "attended" | "rescheduled" | "declined" | "no_show";
type AttStatusFilter = "all" | AttStatus;
type InviteType = "progress" | "renewal";
type EventStatus = "draft" | "open" | "ongoing" | "closed" | "completed";

interface PCMEvent {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  status: EventStatus;
  numberOfDays: number;
}

interface PCMSession {
  id: string;
  eventId: string;
  dayNumber: number;
  sessionNumber: number;
  startTime: string;
  endTime: string;
}

interface AttRecord {
  id: string;
  sessionId: string;
  eventId: string;
  studentId: string;
  studentName: string;
  branch: BranchCode;
  grade: number;
  inviteType: InviteType;
  status: AttStatus;
  coachName: string;
}


const STATUS_BADGE: Record<AttStatus, string> = {
  invited:     "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  confirmed:   "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  attended:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  rescheduled: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  declined:    "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
  no_show:     "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
};

const STATUS_LABELS: Record<AttStatus, string> = {
  invited:     "Invited",
  confirmed:   "Confirmed",
  attended:    "Attended",
  rescheduled: "Rescheduled",
  declined:    "Declined",
  no_show:     "Absent",
};

const EVENT_STATUS_BADGE: Record<EventStatus, string> = {
  draft:     "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  open:      "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  ongoing:   "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  closed:    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
};

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft", open: "Open", ongoing: "Ongoing", closed: "Closed", completed: "Completed",
};


// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRANCHES: { code: string; name: string }[] = PCM_BRANCHES.map(b => ({ code: b.code, name: b.name }));

interface PCMDataBundle {
  events: RawEvent[];
  sessions: RawSession[];
  invitations: RawInvitation[];
}

const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/** Label for the Nth day of an event: startDate + (dayNumber-1), UTC-anchored. */
function dayLabel(startIso: string | undefined, dayNumber: number): string {
  if (!startIso) return `Day ${dayNumber}`;
  const [y, m, d] = startIso.split("-").map(Number);
  if (!y || !m || !d) return `Day ${dayNumber}`;
  const dt = new Date(Date.UTC(y, m - 1, d + (dayNumber - 1)));
  return `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS_SHORT[dt.getUTCMonth()]}`;
}

function buildCsv(
  records: AttRecord[],
  events: PCMEvent[],
  sessById: Map<string, PCMSession>,
): string {
  const evById = new Map(events.map(e => [e.id, e]));
  const header = "Event,Day,Session,Start,End,StudentID,Name,Branch,Grade,Type,Status,Coach";
  const rows = records.map(r => {
    const sess = sessById.get(r.sessionId);
    const ev   = evById.get(r.eventId);
    return [
      ev?.name ?? r.eventId,
      dayLabel(ev?.startDate, sess?.dayNumber ?? 1),
      `S${sess?.sessionNumber ?? ""}`,
      sess?.startTime ?? "",
      sess?.endTime ?? "",
      r.studentId,
      `"${r.studentName}"`,
      r.branch,
      gradeLabel(r.grade),
      r.inviteType === "progress" ? "Progress" : "Renewal",
      STATUS_LABELS[r.status],
      r.coachName,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PCMAttendanceClient() {
  const [eventId, setEventId]             = useState<string>("");
  const [dayFilter, setDayFilter]         = useState<number | "all">("all");
  const [sessionIdFilter, setSessionIdFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter]   = useState<BranchCode | "all">("all");
  const [statusFilter, setStatusFilter]   = useState<AttStatusFilter>("all");
  const [search, setSearch]               = useState("");

  const [events, setEvents]         = useState<PCMEvent[]>([]);
  const [sessions, setSessions]     = useState<PCMSession[]>([]);
  const [records, setRecords]       = useState<AttRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/pcm/data", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load attendance (${res.status})`);
        const data = (await res.json()) as PCMDataBundle;
        if (!alive) return;
        const evs: PCMEvent[] = (data.events ?? [])
          .map(e => ({ id: e.id, name: e.name, venue: e.venue, startDate: e.startDate, status: e.status as EventStatus, numberOfDays: e.numberOfDays }))
          .sort((a, b) => b.startDate.localeCompare(a.startDate));
        setEvents(evs);
        setSessions((data.sessions ?? []).map(s => ({
          id: s.id, eventId: s.eventId, dayNumber: s.dayNumber,
          sessionNumber: s.sessionNumber, startTime: s.startTime, endTime: s.endTime,
        })));
        setRecords((data.invitations ?? []).map(i => ({
          id: i.id, sessionId: i.sessionId, eventId: i.eventId,
          studentId: i.studentId,
          studentName: i.studentName || `#${i.studentId}`,
          branch: i.branch, grade: i.targetGrade,
          inviteType: (i.inviteType === "renewal" ? "renewal" : "progress"),
          status: i.status as AttStatus,
          coachName: i.coachName ?? "",
        })));
        // Default to the most recent event that has attendance records.
        const withRec = evs.find(e => (data.invitations ?? []).some(i => i.eventId === e.id));
        setEventId(withRec?.id ?? evs[0]?.id ?? "");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load attendance");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const SESSIONS_BY_ID = useMemo(
    () => new Map<string, PCMSession>(sessions.map(s => [s.id, s])),
    [sessions],
  );

  const selectedEvent = useMemo(
    () => events.find(e => e.id === eventId) ?? null,
    [events, eventId],
  );

  const eventSessions = useMemo(
    () => sessions
      .filter(s => s.eventId === eventId)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [sessions, eventId],
  );

  const filteredSessions = useMemo(
    () => dayFilter === "all" ? eventSessions : eventSessions.filter(s => s.dayNumber === dayFilter),
    [eventSessions, dayFilter],
  );

  const allFilteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => {
      if (r.eventId !== eventId) return false;
      if (r.status === "declined") return false;
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.studentName.toLowerCase().includes(q) && !r.studentId.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, eventId, branchFilter, statusFilter, search]);

  // Sessions that have at least one record after filters
  const sessionsWithData = useMemo(
    () => new Set(allFilteredRecords.map(r => r.sessionId)),
    [allFilteredRecords],
  );

  const sessionsToRender = useMemo(() => {
    if (sessionIdFilter !== "all") {
      const s = SESSIONS_BY_ID.get(sessionIdFilter);
      return s ? [s] : [];
    }
    return filteredSessions.filter(s => sessionsWithData.has(s.id));
  }, [sessionIdFilter, filteredSessions, sessionsWithData]);

  const recordsBySession = useMemo(() => {
    const map = new Map<string, AttRecord[]>();
    for (const r of allFilteredRecords) {
      if (!map.has(r.sessionId)) map.set(r.sessionId, []);
      map.get(r.sessionId)!.push(r);
    }
    return map;
  }, [allFilteredRecords]);

  const counts = useMemo(() => ({
    rows:     allFilteredRecords.length,
    attended: allFilteredRecords.filter(r => r.status === "attended").length,
    absent:   allFilteredRecords.filter(r => r.status === "no_show").length,
    awaiting: allFilteredRecords.filter(r => r.status === "confirmed" || r.status === "invited").length,
  }), [allFilteredRecords]);

  function handleDownload() {
    const csv  = buildCsv(allFilteredRecords, events, SESSIONS_BY_ID);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `attendance-${(selectedEvent?.name ?? "pcm").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 py-6 md:px-8 w-full mx-auto space-y-6">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-slate-400">
        <Link href="/dashboards" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/dashboards/pcm" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">PCM System</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-700 dark:text-slate-300 font-medium">Attendance</span>
      </nav>

      {/* Masthead */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <ClipboardCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Attendance</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Track who showed up during each session.</p>
        </div>
      </div>

      {/* Filter card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm dark:bg-slate-900 dark:border-slate-800">

        {/* Row 1: Event · Day · Session */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            <CalendarDays className="w-3.5 h-3.5" /> Event
          </span>
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm flex-1 min-w-[240px] dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
            value={eventId}
            onChange={e => {
              setEventId(e.target.value);
              setDayFilter("all");
              setSessionIdFilter("all");
            }}
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Day</span>
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-44 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
            value={dayFilter === "all" ? "all" : String(dayFilter)}
            onChange={e => {
              setDayFilter(e.target.value === "all" ? "all" : Number(e.target.value));
              setSessionIdFilter("all");
            }}
          >
            <option value="all">All days</option>
            {Array.from({ length: selectedEvent?.numberOfDays ?? 0 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>
                {dayLabel(selectedEvent?.startDate, d)}
              </option>
            ))}
          </select>

          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm min-w-[260px] dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
            value={sessionIdFilter}
            onChange={e => setSessionIdFilter(e.target.value)}
          >
            <option value="all">All sessions</option>
            {filteredSessions.map(s => (
              <option key={s.id} value={s.id}>
                {dayLabel(selectedEvent?.startDate, s.dayNumber)} · S{s.sessionNumber} · {s.startTime}–{s.endTime}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Branch · Status · Search */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm min-w-[160px] dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
          >
            <option value="all">All branches</option>
            {BRANCHES.map(b => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>

          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm min-w-[200px] dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as AttStatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed (awaiting)</option>
            <option value="attended">Attended</option>
            <option value="no_show">Absent</option>
            <option value="invited">Pending confirmation</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or ID…"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {selectedEvent && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${EVENT_STATUS_BADGE[selectedEvent.status]}`}>
              {EVENT_STATUS_LABELS[selectedEvent.status]}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <MapPin className="w-3 h-3 text-slate-400" /> {selectedEvent?.venue ?? "—"}
          </span>
          <span><strong className="text-slate-900 dark:text-slate-100">{counts.rows}</strong> <span className="text-slate-400">rows</span></span>
          <span className="text-emerald-700 dark:text-emerald-300"><strong>{counts.attended}</strong> attended</span>
          <span className="text-rose-600 dark:text-rose-300"><strong>{counts.absent}</strong> absent</span>
          {counts.awaiting > 0 && <span className="text-amber-600 dark:text-amber-300"><strong>{counts.awaiting}</strong> awaiting</span>}
        </div>
      </div>

      {/* Action bar */}
      {allFilteredRecords.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Actions</span>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" /> Download CSV
          </button>
        </div>
      )}

      {/* Roster cards */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading attendance…</p>
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center shadow-sm dark:bg-slate-900 dark:border-red-700">
          <p className="text-sm font-medium text-red-600 dark:text-red-300">{error}</p>
        </div>
      ) : sessionsToRender.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 dark:bg-slate-800">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">No records</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">No attendance records match your current filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessionsToRender.map(session => {
            const sessionRecords = recordsBySession.get(session.id) ?? [];
            const sessAtt    = sessionRecords.filter(r => r.status === "attended").length;
            const sessAbs    = sessionRecords.filter(r => r.status === "no_show").length;
            const sessAwait  = sessionRecords.filter(r => r.status === "confirmed" || r.status === "invited").length;
            const dayLabelStr = dayLabel(selectedEvent?.startDate, session.dayNumber);

            return (
              <div key={session.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm dark:bg-slate-900 dark:border-slate-800">
                {/* Session header */}
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2 dark:bg-slate-800 dark:border-slate-800">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {dayLabelStr} · Session {session.sessionNumber} · {session.startTime}–{session.endTime}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      {sessAtt > 0   && <span className="text-emerald-700 dark:text-emerald-300 font-medium">{sessAtt} attended</span>}
                      {sessAbs > 0   && <span className="text-rose-600 dark:text-rose-300 font-medium">{sessAbs} absent</span>}
                      {sessAwait > 0 && <span className="text-amber-600 dark:text-amber-300 font-medium">{sessAwait} awaiting</span>}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{sessionRecords.length} student{sessionRecords.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Student table */}
                {sessionRecords.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-400">No students in this session.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Branch</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Grade</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Coach</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sessionRecords.map((r, i) => (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{r.studentName}</div>
                              <div className="text-xs text-slate-400 font-mono">{r.studentId}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-bold">
                                {r.branch}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm text-slate-700">{gradeLabel(r.grade)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
                                r.inviteType === "progress"
                                  ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                                  : "bg-gradient-to-r from-cyan-500 to-teal-500"
                              }`}>
                                {r.inviteType === "progress" ? "Progress" : "Renewal"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[r.status]}`}>
                                {STATUS_LABELS[r.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">{r.coachName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
