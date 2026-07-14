"use client";

import { useState, useMemo } from "react";
import {
  ClipboardCheck, CalendarDays, Users, MapPin, Search, Download, ChevronRight,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type BranchCode = "PJ" | "KL" | "SJ" | "PG" | "JB";
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

// ─── Mock Events ──────────────────────────────────────────────────────────────

const MOCK_EVENTS: PCMEvent[] = [
  { id: "pcm-001", name: "PCM Jul 2026", venue: "Ebright PJ HQ",      startDate: "2026-07-14", status: "open",      numberOfDays: 7 },
  { id: "pcm-a3",  name: "PCM May 2026", venue: "Ebright PJ HQ",      startDate: "2026-05-19", status: "completed", numberOfDays: 7 },
  { id: "pcm-a2",  name: "PCM Mar 2026", venue: "Ebright KL Branch",   startDate: "2026-03-10", status: "completed", numberOfDays: 7 },
  { id: "pcm-a1",  name: "PCM Jan 2025", venue: "Ebright PJ HQ",      startDate: "2025-01-06", status: "completed", numberOfDays: 7 },
];

// ─── Sessions (auto-generated) ────────────────────────────────────────────────

const SESSION_TIMES = [
  { n: 1, start: "09:00", end: "10:00" },
  { n: 2, start: "10:00", end: "11:00" },
  { n: 3, start: "11:00", end: "12:00" },
  { n: 4, start: "14:00", end: "15:00" },
  { n: 5, start: "15:00", end: "16:00" },
  { n: 6, start: "16:00", end: "17:00" },
] as const;

const MOCK_SESSIONS: PCMSession[] = [];
const SESSIONS_BY_ID = new Map<string, PCMSession>();
for (const ev of MOCK_EVENTS) {
  for (let d = 1; d <= ev.numberOfDays; d++) {
    for (const t of SESSION_TIMES) {
      const s: PCMSession = {
        id: `${ev.id}-d${d}-s${t.n}`,
        eventId: ev.id,
        dayNumber: d,
        sessionNumber: t.n,
        startTime: t.start,
        endTime: t.end,
      };
      MOCK_SESSIONS.push(s);
      SESSIONS_BY_ID.set(s.id, s);
    }
  }
}

// ─── Day Labels ───────────────────────────────────────────────────────────────

const EVENT_DAY_LABELS: Record<string, Record<number, string>> = {
  "pcm-001": { 1:"Tue 14 Jul", 2:"Wed 15 Jul", 3:"Thu 16 Jul", 4:"Fri 17 Jul", 5:"Sat 18 Jul", 6:"Sun 19 Jul", 7:"Mon 20 Jul" },
  "pcm-a3":  { 1:"Tue 19 May", 2:"Wed 20 May", 3:"Thu 21 May", 4:"Fri 22 May", 5:"Sat 23 May", 6:"Sun 24 May", 7:"Mon 25 May" },
  "pcm-a2":  { 1:"Tue 10 Mar", 2:"Wed 11 Mar", 3:"Thu 12 Mar", 4:"Fri 13 Mar", 5:"Sat 14 Mar", 6:"Sun 15 Mar", 7:"Mon 16 Mar" },
  "pcm-a1":  { 1:"Mon 6 Jan",  2:"Tue 7 Jan",  3:"Wed 8 Jan",  4:"Thu 9 Jan",  5:"Fri 10 Jan", 6:"Sat 11 Jan", 7:"Sun 12 Jan" },
};

// ─── Status Display ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<AttStatus, string> = {
  invited:     "bg-slate-100 text-slate-600",
  confirmed:   "bg-amber-100 text-amber-700",
  attended:    "bg-emerald-100 text-emerald-700",
  rescheduled: "bg-orange-100 text-orange-700",
  declined:    "bg-red-100 text-red-600",
  no_show:     "bg-rose-100 text-rose-700",
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
  draft:     "bg-slate-100 text-slate-500",
  open:      "bg-sky-100 text-sky-700",
  ongoing:   "bg-violet-100 text-violet-700",
  closed:    "bg-orange-100 text-orange-700",
  completed: "bg-emerald-100 text-emerald-700",
};

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft", open: "Open", ongoing: "Ongoing", closed: "Closed", completed: "Completed",
};

// ─── Mock Attendance Records ──────────────────────────────────────────────────

const MOCK_RECORDS: AttRecord[] = [
  // pcm-a1 — Day 1
  { id:"ar-001", sessionId:"pcm-a1-d1-s1", eventId:"pcm-a1", studentId:"STU-1042", studentName:"Ahmad Razif bin Musa",     branch:"KL", grade:8,  inviteType:"progress", status:"attended",  coachName:"Ms Jana"  },
  { id:"ar-002", sessionId:"pcm-a1-d1-s1", eventId:"pcm-a1", studentId:"STU-2185", studentName:"Nur Farhana binti Rosli",  branch:"PJ", grade:12, inviteType:"renewal",  status:"attended",  coachName:"Mr Ali"   },
  { id:"ar-003", sessionId:"pcm-a1-d1-s1", eventId:"pcm-a1", studentId:"STU-3371", studentName:"Siti Aminah Mohd Noh",     branch:"SJ", grade:5,  inviteType:"progress", status:"no_show",   coachName:"Ms Jana"  },
  { id:"ar-004", sessionId:"pcm-a1-d1-s2", eventId:"pcm-a1", studentId:"STU-1198", studentName:"Mohd Farid Azlan",         branch:"PJ", grade:10, inviteType:"renewal",  status:"attended",  coachName:"Mr Ali"   },
  { id:"ar-005", sessionId:"pcm-a1-d1-s2", eventId:"pcm-a1", studentId:"STU-2047", studentName:"Tan Wei Ling",             branch:"KL", grade:7,  inviteType:"progress", status:"attended",  coachName:"Ms Jana"  },
  { id:"ar-006", sessionId:"pcm-a1-d1-s2", eventId:"pcm-a1", studentId:"STU-4203", studentName:"Rajan Kumar",              branch:"PG", grade:11, inviteType:"renewal",  status:"attended",  coachName:"Ms Siti"  },
  { id:"ar-007", sessionId:"pcm-a1-d1-s3", eventId:"pcm-a1", studentId:"STU-3108", studentName:"Lim Mei Yi",               branch:"SJ", grade:9,  inviteType:"progress", status:"attended",  coachName:"Ms Siti"  },
  { id:"ar-008", sessionId:"pcm-a1-d1-s3", eventId:"pcm-a1", studentId:"STU-5012", studentName:"Azizul Hakim Ramli",       branch:"JB", grade:6,  inviteType:"progress", status:"no_show",   coachName:"Mr Hafiz" },
  { id:"ar-009", sessionId:"pcm-a1-d1-s4", eventId:"pcm-a1", studentId:"STU-2290", studentName:"Faezah binti Hamid",       branch:"KL", grade:13, inviteType:"renewal",  status:"attended",  coachName:"Ms Rania" },
  { id:"ar-010", sessionId:"pcm-a1-d1-s4", eventId:"pcm-a1", studentId:"STU-1334", studentName:"Chen Yi Xuan",             branch:"PJ", grade:8,  inviteType:"progress", status:"attended",  coachName:"Ms Jana"  },
  { id:"ar-011", sessionId:"pcm-a1-d1-s4", eventId:"pcm-a1", studentId:"STU-4455", studentName:"Muthu Krishnan",           branch:"PG", grade:12, inviteType:"renewal",  status:"attended",  coachName:"Ms Siti"  },
  { id:"ar-012", sessionId:"pcm-a1-d1-s5", eventId:"pcm-a1", studentId:"STU-3214", studentName:"Nurul Izzah Zainudin",     branch:"SJ", grade:7,  inviteType:"progress", status:"attended",  coachName:"Ms Rania" },
  { id:"ar-013", sessionId:"pcm-a1-d1-s5", eventId:"pcm-a1", studentId:"STU-2381", studentName:"Hafizuddin Nor",           branch:"KL", grade:10, inviteType:"renewal",  status:"no_show",   coachName:"Mr Ali"   },
  { id:"ar-014", sessionId:"pcm-a1-d1-s6", eventId:"pcm-a1", studentId:"STU-1507", studentName:"Rashidah binti Omar",      branch:"PJ", grade:9,  inviteType:"progress", status:"attended",  coachName:"Ms Jana"  },
  { id:"ar-015", sessionId:"pcm-a1-d1-s6", eventId:"pcm-a1", studentId:"STU-5129", studentName:"Vinod Anand",              branch:"JB", grade:11, inviteType:"renewal",  status:"attended",  coachName:"Mr Hafiz" },
  // pcm-a1 — Day 2
  { id:"ar-016", sessionId:"pcm-a1-d2-s1", eventId:"pcm-a1", studentId:"STU-2445", studentName:"Afiq Zafran Azman",        branch:"KL", grade:9,  inviteType:"progress", status:"attended",  coachName:"Ms Jana"  },
  { id:"ar-017", sessionId:"pcm-a1-d2-s1", eventId:"pcm-a1", studentId:"STU-1612", studentName:"Hana Yasmin Ahmad",        branch:"PJ", grade:11, inviteType:"renewal",  status:"no_show",   coachName:"Mr Ali"   },
  { id:"ar-018", sessionId:"pcm-a1-d2-s4", eventId:"pcm-a1", studentId:"STU-3320", studentName:"Izwan Nizam",              branch:"SJ", grade:8,  inviteType:"progress", status:"attended",  coachName:"Ms Siti"  },
  { id:"ar-019", sessionId:"pcm-a1-d2-s4", eventId:"pcm-a1", studentId:"STU-4567", studentName:"Salmah binti Daud",        branch:"PG", grade:13, inviteType:"renewal",  status:"attended",  coachName:"Ms Rania" },
  // pcm-a3 — Day 1
  { id:"ar-020", sessionId:"pcm-a3-d1-s1", eventId:"pcm-a3", studentId:"STU-1890", studentName:"Adib Haiqal Zaki",         branch:"PJ", grade:8,  inviteType:"progress", status:"attended",  coachName:"Ms Jana"  },
  { id:"ar-021", sessionId:"pcm-a3-d1-s1", eventId:"pcm-a3", studentId:"STU-2501", studentName:"Umi Kalsom binti Razak",   branch:"KL", grade:13, inviteType:"renewal",  status:"attended",  coachName:"Mr Ali"   },
  { id:"ar-022", sessionId:"pcm-a3-d1-s2", eventId:"pcm-a3", studentId:"STU-3678", studentName:"Fitri Akmal Hassan",       branch:"SJ", grade:10, inviteType:"progress", status:"attended",  coachName:"Ms Siti"  },
  { id:"ar-023", sessionId:"pcm-a3-d1-s2", eventId:"pcm-a3", studentId:"STU-4789", studentName:"Zubaidah Mohd Yusof",      branch:"PG", grade:6,  inviteType:"renewal",  status:"no_show",   coachName:"Ms Rania" },
  { id:"ar-024", sessionId:"pcm-a3-d1-s3", eventId:"pcm-a3", studentId:"STU-5234", studentName:"Hazwan bin Kamaruddin",    branch:"JB", grade:11, inviteType:"renewal",  status:"attended",  coachName:"Mr Hafiz" },
  { id:"ar-025", sessionId:"pcm-a3-d1-s3", eventId:"pcm-a3", studentId:"STU-2112", studentName:"Syakirah Nadia Ahmad",     branch:"KL", grade:7,  inviteType:"progress", status:"attended",  coachName:"Ms Jana"  },
  // pcm-001 — Day 1 (upcoming — confirmed / invited)
  { id:"ar-026", sessionId:"pcm-001-d1-s1", eventId:"pcm-001", studentId:"STU-1756", studentName:"Aidil Fitri Azman",      branch:"PJ", grade:9,  inviteType:"progress", status:"confirmed", coachName:"Ms Jana"  },
  { id:"ar-027", sessionId:"pcm-001-d1-s1", eventId:"pcm-001", studentId:"STU-2834", studentName:"Norhanim binti Ramli",   branch:"KL", grade:12, inviteType:"renewal",  status:"invited",   coachName:"Mr Ali"   },
  { id:"ar-028", sessionId:"pcm-001-d1-s1", eventId:"pcm-001", studentId:"STU-3445", studentName:"Iskandar Arif",          branch:"SJ", grade:10, inviteType:"progress", status:"confirmed", coachName:"Ms Siti"  },
  { id:"ar-029", sessionId:"pcm-001-d1-s1", eventId:"pcm-001", studentId:"STU-5001", studentName:"Rokiah binti Sulaiman",  branch:"JB", grade:8,  inviteType:"renewal",  status:"invited",   coachName:"Mr Hafiz" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeLabel(g: number): string {
  return g <= 12 ? `G${g}` : `GB${g - 12}`;
}

function buildCsv(records: AttRecord[]): string {
  const evById = new Map(MOCK_EVENTS.map(e => [e.id, e]));
  const header = "Event,Day,Session,Start,End,StudentID,Name,Branch,Grade,Type,Status,Coach";
  const rows = records.map(r => {
    const sess = SESSIONS_BY_ID.get(r.sessionId);
    const ev   = evById.get(r.eventId);
    const dayLabel = EVENT_DAY_LABELS[r.eventId]?.[sess?.dayNumber ?? 1] ?? `Day ${sess?.dayNumber}`;
    return [
      ev?.name ?? r.eventId,
      dayLabel,
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
  const [eventId, setEventId]             = useState(MOCK_EVENTS[0].id);
  const [dayFilter, setDayFilter]         = useState<number | "all">("all");
  const [sessionIdFilter, setSessionIdFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter]   = useState<BranchCode | "all">("all");
  const [statusFilter, setStatusFilter]   = useState<AttStatusFilter>("all");
  const [search, setSearch]               = useState("");

  const selectedEvent = useMemo(
    () => MOCK_EVENTS.find(e => e.id === eventId) ?? MOCK_EVENTS[0],
    [eventId],
  );

  const eventSessions = useMemo(
    () => MOCK_SESSIONS
      .filter(s => s.eventId === eventId)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [eventId],
  );

  const filteredSessions = useMemo(
    () => dayFilter === "all" ? eventSessions : eventSessions.filter(s => s.dayNumber === dayFilter),
    [eventSessions, dayFilter],
  );

  const allFilteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MOCK_RECORDS.filter(r => {
      if (r.eventId !== eventId) return false;
      if (r.status === "declined") return false;
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.studentName.toLowerCase().includes(q) && !r.studentId.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [eventId, branchFilter, statusFilter, search]);

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
    const csv  = buildCsv(allFilteredRecords);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `attendance-${selectedEvent.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 py-6 md:px-8 max-w-7xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-slate-400">
        <Link href="/dashboards" className="hover:text-slate-700 transition-colors">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/dashboards/pcm" className="hover:text-slate-700 transition-colors">PCM System</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-700 font-medium">Attendance</span>
      </nav>

      {/* Masthead */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <ClipboardCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track who showed up during each session.</p>
        </div>
      </div>

      {/* Filter card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">

        {/* Row 1: Event · Day · Session */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            <CalendarDays className="w-3.5 h-3.5" /> Event
          </span>
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm flex-1 min-w-[240px]"
            value={eventId}
            onChange={e => {
              setEventId(e.target.value);
              setDayFilter("all");
              setSessionIdFilter("all");
            }}
          >
            {MOCK_EVENTS.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Day</span>
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-44"
            value={dayFilter === "all" ? "all" : String(dayFilter)}
            onChange={e => {
              setDayFilter(e.target.value === "all" ? "all" : Number(e.target.value));
              setSessionIdFilter("all");
            }}
          >
            <option value="all">All days</option>
            {Array.from({ length: selectedEvent.numberOfDays }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>
                {EVENT_DAY_LABELS[eventId]?.[d] ?? `Day ${d}`}
              </option>
            ))}
          </select>

          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm min-w-[260px]"
            value={sessionIdFilter}
            onChange={e => setSessionIdFilter(e.target.value)}
          >
            <option value="all">All sessions</option>
            {filteredSessions.map(s => (
              <option key={s.id} value={s.id}>
                {EVENT_DAY_LABELS[eventId]?.[s.dayNumber] ?? `Day ${s.dayNumber}`} · S{s.sessionNumber} · {s.startTime}–{s.endTime}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Branch · Status · Search */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm min-w-[160px]"
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
          >
            <option value="all">All branches</option>
            {(["PJ", "KL", "SJ", "PG", "JB"] as BranchCode[]).map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm min-w-[200px]"
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
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-slate-100 text-xs">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${EVENT_STATUS_BADGE[selectedEvent.status]}`}>
            {EVENT_STATUS_LABELS[selectedEvent.status]}
          </span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <MapPin className="w-3 h-3 text-slate-400" /> {selectedEvent.venue}
          </span>
          <span><strong className="text-slate-900">{counts.rows}</strong> <span className="text-slate-400">rows</span></span>
          <span className="text-emerald-700"><strong>{counts.attended}</strong> attended</span>
          <span className="text-rose-600"><strong>{counts.absent}</strong> absent</span>
          {counts.awaiting > 0 && <span className="text-amber-600"><strong>{counts.awaiting}</strong> awaiting</span>}
        </div>
      </div>

      {/* Action bar */}
      {allFilteredRecords.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Actions</span>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download CSV
          </button>
        </div>
      )}

      {/* Roster cards */}
      {sessionsToRender.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">No records</h3>
          <p className="text-sm text-slate-500 mt-1">No attendance records match your current filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessionsToRender.map(session => {
            const records    = recordsBySession.get(session.id) ?? [];
            const sessAtt    = records.filter(r => r.status === "attended").length;
            const sessAbs    = records.filter(r => r.status === "no_show").length;
            const sessAwait  = records.filter(r => r.status === "confirmed" || r.status === "invited").length;
            const dayLabel   = EVENT_DAY_LABELS[eventId]?.[session.dayNumber] ?? `Day ${session.dayNumber}`;

            return (
              <div key={session.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Session header */}
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {dayLabel} · Session {session.sessionNumber} · {session.startTime}–{session.endTime}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      {sessAtt > 0   && <span className="text-emerald-700 font-medium">{sessAtt} attended</span>}
                      {sessAbs > 0   && <span className="text-rose-600 font-medium">{sessAbs} absent</span>}
                      {sessAwait > 0 && <span className="text-amber-600 font-medium">{sessAwait} awaiting</span>}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{records.length} student{records.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Student table */}
                {records.length === 0 ? (
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
                        {records.map((r, i) => (
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
