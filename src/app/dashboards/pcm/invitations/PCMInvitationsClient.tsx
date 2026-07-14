"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Home, ChevronRight, ListOrdered, Search,
  Download, Copy, Check, Users,
} from "lucide-react";

type BranchCode = "PJ" | "SA" | "SP" | "KD" | "SE" | "JB";
type InvitationStatus = "invited" | "confirmed" | "attended" | "rescheduled" | "declined" | "no_show";
type InviteType = "progress" | "renewal";

interface PCMMockEvent {
  id: string;
  name: string;
  startLabel: string;
  endLabel: string;
}

interface PCMMockSession {
  id: string;
  eventId: string;
  dayNumber: number;
  dayLabel: string;
  sessionNumber: number;
  startTime: string;
  endTime: string;
}

interface PCMInvitation {
  id: string;
  eventId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  branch: BranchCode;
  grade: number;
  targetGrade: number;
  inviteType: InviteType;
  status: InvitationStatus;
  coachName: string | null;
}

// ─── Mock events ──────────────────────────────────────────────────────────────

const MOCK_EVENTS: PCMMockEvent[] = [
  { id: "pcm-001", name: "PCM Jul 2026 Weekly Showcase", startLabel: "14 Jul",  endLabel: "20 Jul 2026" },
  { id: "pcm-a1",  name: "PCM Jan 2025 Weekly Showcase", startLabel: "6 Jan",   endLabel: "12 Jan 2025" },
  { id: "pcm-a2",  name: "PCM Mar 2026 Weekly Showcase", startLabel: "9 Mar",   endLabel: "15 Mar 2026" },
  { id: "pcm-a3",  name: "PCM May 2026 Weekly Showcase", startLabel: "11 May",  endLabel: "17 May 2026" },
];

// ─── Mock sessions ────────────────────────────────────────────────────────────

const SESSION_TIMES = [
  { n: 1, start: "09:00", end: "10:00" },
  { n: 2, start: "10:00", end: "11:00" },
  { n: 3, start: "11:00", end: "12:00" },
  { n: 4, start: "14:00", end: "15:00" },
  { n: 5, start: "15:00", end: "16:00" },
  { n: 6, start: "16:00", end: "17:00" },
];

const EVENT_DAY_LABELS: Record<string, Record<number, string>> = {
  "pcm-001": { 1: "Mon 14 Jul", 2: "Tue 15 Jul", 3: "Wed 16 Jul", 4: "Thu 17 Jul", 5: "Fri 18 Jul", 6: "Sat 19 Jul", 7: "Sun 20 Jul" },
  "pcm-a1":  { 1: "Mon 6 Jan",  2: "Tue 7 Jan",  3: "Wed 8 Jan",  4: "Thu 9 Jan",  5: "Fri 10 Jan", 6: "Sat 11 Jan", 7: "Sun 12 Jan" },
  "pcm-a2":  { 1: "Mon 9 Mar",  2: "Tue 10 Mar", 3: "Wed 11 Mar", 4: "Thu 12 Mar", 5: "Fri 13 Mar", 6: "Sat 14 Mar", 7: "Sun 15 Mar" },
  "pcm-a3":  { 1: "Mon 11 May", 2: "Tue 12 May", 3: "Wed 13 May", 4: "Thu 14 May", 5: "Fri 15 May", 6: "Sat 16 May", 7: "Sun 17 May" },
};

const MOCK_SESSIONS: PCMMockSession[] = [];
for (const ev of MOCK_EVENTS) {
  const dayLabels = EVENT_DAY_LABELS[ev.id] ?? {};
  for (let d = 1; d <= 7; d++) {
    for (const t of SESSION_TIMES) {
      MOCK_SESSIONS.push({
        id: `${ev.id}-d${d}-s${t.n}`,
        eventId: ev.id,
        dayNumber: d,
        dayLabel: dayLabels[d] ?? `Day ${d}`,
        sessionNumber: t.n,
        startTime: t.start,
        endTime: t.end,
      });
    }
  }
}

// ─── Mock invitations ─────────────────────────────────────────────────────────

const MOCK_INVITATIONS: PCMInvitation[] = [
  // pcm-001 (Jul 2026, upcoming) — invited / confirmed / rescheduled / declined
  { id: "inv-001", eventId: "pcm-001", sessionId: "pcm-001-d1-s1", studentId: "S0001", studentName: "Ahmad Fariz",    branch: "PJ", grade: 5,  targetGrade: 5,  inviteType: "progress", status: "confirmed",   coachName: "Coach Azri" },
  { id: "inv-002", eventId: "pcm-001", sessionId: "pcm-001-d1-s1", studentId: "S0002", studentName: "Nurul Ain",      branch: "PJ", grade: 7,  targetGrade: 7,  inviteType: "progress", status: "invited",     coachName: "Coach Azri" },
  { id: "inv-003", eventId: "pcm-001", sessionId: "pcm-001-d1-s2", studentId: "S0004", studentName: "Hafiz Zain",     branch: "PJ", grade: 3,  targetGrade: 3,  inviteType: "renewal",  status: "confirmed",   coachName: null },
  { id: "inv-004", eventId: "pcm-001", sessionId: "pcm-001-d2-s1", studentId: "S0005", studentName: "Siti Maisarah",  branch: "SA", grade: 8,  targetGrade: 8,  inviteType: "progress", status: "confirmed",   coachName: "Coach Lina" },
  { id: "inv-005", eventId: "pcm-001", sessionId: "pcm-001-d2-s1", studentId: "S0007", studentName: "Alif Rahim",     branch: "SA", grade: 4,  targetGrade: 4,  inviteType: "progress", status: "invited",     coachName: "Coach Lina" },
  { id: "inv-006", eventId: "pcm-001", sessionId: "pcm-001-d2-s2", studentId: "S0010", studentName: "Rina Yusof",     branch: "SA", grade: 6,  targetGrade: 6,  inviteType: "renewal",  status: "rescheduled", coachName: null },
  { id: "inv-007", eventId: "pcm-001", sessionId: "pcm-001-d3-s1", studentId: "S0011", studentName: "Danial Haris",   branch: "SP", grade: 2,  targetGrade: 2,  inviteType: "progress", status: "confirmed",   coachName: "Coach Faiz" },
  { id: "inv-008", eventId: "pcm-001", sessionId: "pcm-001-d3-s2", studentId: "S0012", studentName: "Nadia Karim",    branch: "SP", grade: 9,  targetGrade: 9,  inviteType: "progress", status: "invited",     coachName: "Coach Faiz" },
  { id: "inv-009", eventId: "pcm-001", sessionId: "pcm-001-d4-s1", studentId: "S0013", studentName: "Zafran Idris",   branch: "KD", grade: 5,  targetGrade: 5,  inviteType: "renewal",  status: "declined",    coachName: null },
  { id: "inv-010", eventId: "pcm-001", sessionId: "pcm-001-d4-s2", studentId: "S0014", studentName: "Aisyah Noor",    branch: "KD", grade: 11, targetGrade: 11, inviteType: "progress", status: "confirmed",   coachName: "Coach Razi" },
  { id: "inv-011", eventId: "pcm-001", sessionId: "pcm-001-d4-s3", studentId: "S0015", studentName: "Yasmin Osman",   branch: "PJ", grade: 12, targetGrade: 12, inviteType: "progress", status: "confirmed",   coachName: "Coach Azri" },
  { id: "inv-012", eventId: "pcm-001", sessionId: "pcm-001-d5-s1", studentId: "S0016", studentName: "Rayyan Malik",   branch: "SE", grade: 6,  targetGrade: 6,  inviteType: "renewal",  status: "invited",     coachName: null },
  { id: "inv-013", eventId: "pcm-001", sessionId: "pcm-001-d5-s2", studentId: "S0017", studentName: "Amira Saad",     branch: "SA", grade: 13, targetGrade: 13, inviteType: "progress", status: "confirmed",   coachName: "Coach Lina" },
  { id: "inv-014", eventId: "pcm-001", sessionId: "pcm-001-d6-s1", studentId: "S0018", studentName: "Farah Idris",    branch: "JB", grade: 4,  targetGrade: 4,  inviteType: "progress", status: "invited",     coachName: "Coach Nizam" },
  { id: "inv-015", eventId: "pcm-001", sessionId: "pcm-001-d6-s2", studentId: "S0019", studentName: "Hazwan Faris",   branch: "JB", grade: 7,  targetGrade: 7,  inviteType: "renewal",  status: "confirmed",   coachName: null },
  { id: "inv-016", eventId: "pcm-001", sessionId: "pcm-001-d7-s1", studentId: "S0020", studentName: "Khairul Amin",   branch: "KD", grade: 8,  targetGrade: 8,  inviteType: "progress", status: "invited",     coachName: "Coach Razi" },
  { id: "inv-017", eventId: "pcm-001", sessionId: "pcm-001-d7-s2", studentId: "S0021", studentName: "Liyana Hussin",  branch: "SE", grade: 3,  targetGrade: 3,  inviteType: "renewal",  status: "confirmed",   coachName: null },

  // pcm-a1 (Jan 2025, completed) — mix of attended / no_show
  { id: "inv-a01", eventId: "pcm-a1", sessionId: "pcm-a1-d1-s1", studentId: "S0001", studentName: "Ahmad Fariz",    branch: "PJ", grade: 4,  targetGrade: 4,  inviteType: "progress", status: "attended",  coachName: "Coach Azri" },
  { id: "inv-a02", eventId: "pcm-a1", sessionId: "pcm-a1-d1-s2", studentId: "S0002", studentName: "Nurul Ain",      branch: "PJ", grade: 6,  targetGrade: 6,  inviteType: "progress", status: "attended",  coachName: "Coach Azri" },
  { id: "inv-a03", eventId: "pcm-a1", sessionId: "pcm-a1-d2-s1", studentId: "S0004", studentName: "Hafiz Zain",     branch: "PJ", grade: 2,  targetGrade: 2,  inviteType: "renewal",  status: "no_show",   coachName: null },
  { id: "inv-a04", eventId: "pcm-a1", sessionId: "pcm-a1-d2-s2", studentId: "S0005", studentName: "Siti Maisarah",  branch: "SA", grade: 7,  targetGrade: 7,  inviteType: "progress", status: "attended",  coachName: "Coach Lina" },
  { id: "inv-a05", eventId: "pcm-a1", sessionId: "pcm-a1-d3-s1", studentId: "S0010", studentName: "Rina Yusof",     branch: "SA", grade: 5,  targetGrade: 5,  inviteType: "renewal",  status: "attended",  coachName: null },
  { id: "inv-a06", eventId: "pcm-a1", sessionId: "pcm-a1-d3-s2", studentId: "S0011", studentName: "Danial Haris",   branch: "SP", grade: 1,  targetGrade: 1,  inviteType: "progress", status: "attended",  coachName: "Coach Faiz" },
  { id: "inv-a07", eventId: "pcm-a1", sessionId: "pcm-a1-d4-s1", studentId: "S0013", studentName: "Zafran Idris",   branch: "KD", grade: 4,  targetGrade: 4,  inviteType: "renewal",  status: "no_show",   coachName: null },
  { id: "inv-a08", eventId: "pcm-a1", sessionId: "pcm-a1-d5-s2", studentId: "S0016", studentName: "Rayyan Malik",   branch: "SE", grade: 5,  targetGrade: 5,  inviteType: "renewal",  status: "attended",  coachName: null },
];

// ─── Lookup maps ──────────────────────────────────────────────────────────────

const SESSIONS_BY_ID = new Map<string, PCMMockSession>(MOCK_SESSIONS.map(s => [s.id, s]));

const BRANCH_NAMES: Record<BranchCode, string> = {
  PJ: "Petaling Jaya", SA: "Shah Alam", SP: "Seri Petaling",
  KD: "Kepong Damansara", SE: "Selayang", JB: "Johor Bahru",
};

const BRANCHES: BranchCode[] = ["PJ", "SA", "SP", "KD", "SE", "JB"];

function gradeLabel(g: number): string {
  return g <= 12 ? `G${g}` : `GB${g - 12}`;
}

const STATUS_BADGE: Record<InvitationStatus, string> = {
  invited:     "bg-blue-50 text-blue-700",
  confirmed:   "bg-emerald-50 text-emerald-700",
  attended:    "bg-teal-100 text-teal-800",
  rescheduled: "bg-amber-50 text-amber-700",
  declined:    "bg-rose-50 text-rose-700",
  no_show:     "bg-slate-100 text-slate-500",
};

const STATUS_LABELS: Record<InvitationStatus, string> = {
  invited: "Pending", confirmed: "Confirmed", attended: "Attended",
  rescheduled: "Rescheduled", declined: "Declined", no_show: "No-show",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PCMInvitationsClient() {
  const [eventId, setEventId] = useState<string>(MOCK_EVENTS[0].id);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<number | "all">("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const currentEvent = MOCK_EVENTS.find(e => e.id === eventId);

  const eventSessions = useMemo(
    () => MOCK_SESSIONS.filter(s => s.eventId === eventId)
          .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [eventId],
  );

  const dayNumbers = useMemo(() => {
    const days = new Set(eventSessions.map(s => s.dayNumber));
    return Array.from(days).sort((a, b) => a - b);
  }, [eventSessions]);

  const dayLabelFor = (d: number) =>
    eventSessions.find(s => s.dayNumber === d)?.dayLabel ?? `Day ${d}`;

  const sessionsForDay = useMemo(
    () => dayFilter === "all" ? eventSessions : eventSessions.filter(s => s.dayNumber === dayFilter),
    [eventSessions, dayFilter],
  );

  const rows = useMemo(() => {
    let list = MOCK_INVITATIONS.filter(i => i.eventId === eventId);
    if (branchFilter !== "all") list = list.filter(i => i.branch === branchFilter);
    if (statusFilter !== "all") list = list.filter(i => i.status === statusFilter);
    if (typeFilter !== "all")   list = list.filter(i => i.inviteType === typeFilter);
    if (dayFilter !== "all") {
      list = list.filter(i => SESSIONS_BY_ID.get(i.sessionId)?.dayNumber === dayFilter);
    }
    if (sessionFilter !== "all") list = list.filter(i => i.sessionId === sessionFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i =>
        i.studentName.toLowerCase().includes(q) ||
        i.studentId.toLowerCase().includes(q) ||
        (i.coachName ?? "").toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
      const sa = SESSIONS_BY_ID.get(a.sessionId);
      const sb = SESSIONS_BY_ID.get(b.sessionId);
      if (sa && sb) {
        if (sa.dayNumber !== sb.dayNumber) return sa.dayNumber - sb.dayNumber;
        if (sa.sessionNumber !== sb.sessionNumber) return sa.sessionNumber - sb.sessionNumber;
      }
      return a.studentName.localeCompare(b.studentName);
    });
  }, [eventId, branchFilter, statusFilter, typeFilter, dayFilter, sessionFilter, search]);

  const counts = useMemo(() => {
    let invited = 0, confirmed = 0, attended = 0, absent = 0, rescheduled = 0, progress = 0, renewal = 0;
    for (const i of rows) {
      invited++;
      if (i.status === "confirmed" || i.status === "attended") confirmed++;
      if (i.status === "attended") attended++;
      if (i.status === "no_show" || i.status === "declined") absent++;
      if (i.status === "rescheduled") rescheduled++;
      if (i.inviteType === "progress") progress++;
      if (i.inviteType === "renewal")  renewal++;
    }
    return { invited, confirmed, attended, absent, rescheduled, progress, renewal };
  }, [rows]);

  // ─── Export helpers ──────────────────────────────────────────────────────────

  function buildText(): string {
    if (!currentEvent) return "";
    const lines: string[] = [];
    lines.push(`📋 ${currentEvent.name}`);
    lines.push(`${currentEvent.startLabel} – ${currentEvent.endLabel}`);
    if (branchFilter !== "all") lines.push(`Branch: ${branchFilter}`);
    lines.push("");
    let lastHeader = "";
    let idx = 0;
    for (const inv of rows) {
      const sess = SESSIONS_BY_ID.get(inv.sessionId);
      const header = `${inv.branch} · ${sess?.dayLabel ?? ""} ${sess?.startTime ?? ""}–${sess?.endTime ?? ""}`;
      if (header !== lastHeader) {
        if (lastHeader) lines.push("");
        lines.push(`▸ ${header}`);
        lastHeader = header;
        idx = 0;
      }
      idx++;
      const grade = gradeLabel(inv.targetGrade);
      const tpe = inv.inviteType === "renewal" ? "RENEW" : "PROG";
      const coach = inv.coachName ? ` · Coach ${inv.coachName}` : "";
      lines.push(`  ${idx}. ${inv.studentName} (${grade}, ${tpe})${coach}`);
    }
    if (rows.length === 0) lines.push("(no invitations match these filters)");
    return lines.join("\n");
  }

  function buildCsv(): string {
    const cols = ["Event", "Branch", "Day", "Session", "Start", "End", "Student ID", "Student Name", "Grade", "Type", "Status", "Coach"];
    const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const lines = [cols.join(",")];
    if (!currentEvent) return lines.join("\n");
    for (const inv of rows) {
      const sess = SESSIONS_BY_ID.get(inv.sessionId);
      lines.push([
        currentEvent.name, inv.branch,
        sess ? `${sess.dayLabel} (Day ${sess.dayNumber})` : "",
        sess ? String(sess.sessionNumber) : "",
        sess?.startTime ?? "", sess?.endTime ?? "",
        inv.studentId, inv.studentName,
        gradeLabel(inv.targetGrade), inv.inviteType, inv.status, inv.coachName ?? "",
      ].map(esc).join(","));
    }
    return lines.join("\n");
  }

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(buildText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownload(fmt: "text" | "csv") {
    if (!currentEvent) return;
    const content = fmt === "csv" ? buildCsv() : buildText();
    const mime = fmt === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
    const safeName = currentEvent.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60);
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pcm-invitations-${safeName}.${fmt === "csv" ? "csv" : "txt"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

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
          <span className="text-slate-900 font-medium">Invitations</span>
        </nav>

        {/* Masthead */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">PCM System</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ListOrdered className="w-6 h-6 text-slate-400" aria-hidden="true" />
              Invitation List
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Filter, copy for WhatsApp, or download as CSV.</p>
          </div>
        </div>

        {/* Filter card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          {/* Row 1: event + day + session */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Event</label>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
                value={eventId}
                onChange={e => { setEventId(e.target.value); setDayFilter("all"); setSessionFilter("all"); }}
              >
                {MOCK_EVENTS.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name} ({ev.startLabel})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Day</label>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={dayFilter === "all" ? "all" : String(dayFilter)}
                onChange={e => { const v = e.target.value; setDayFilter(v === "all" ? "all" : Number(v)); setSessionFilter("all"); }}
              >
                <option value="all">All days</option>
                {dayNumbers.map(d => (
                  <option key={d} value={d}>{dayLabelFor(d)}</option>
                ))}
              </select>
            </div>

            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
              value={sessionFilter}
              onChange={e => setSessionFilter(e.target.value)}
            >
              <option value="all">
                {dayFilter === "all" ? "All sessions" : `All sessions on ${dayLabelFor(Number(dayFilter))}`}
              </option>
              {sessionsForDay.map(s => (
                <option key={s.id} value={s.id}>
                  {s.dayLabel.split(" ")[0]} · S{s.sessionNumber} · {s.startTime}–{s.endTime}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: branch + status + type + search */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
            >
              <option value="all">All branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b} — {BRANCH_NAMES[b]}</option>)}
            </select>

            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="invited">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="attended">Attended</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="declined">Declined</option>
              <option value="no_show">No-show</option>
            </select>

            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="progress">Progress</option>
              <option value="renewal">Renewal</option>
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search name, ID, coach…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span><strong className="text-slate-900">{counts.invited}</strong> rows</span>
            <span><strong className="text-emerald-700">{counts.confirmed}</strong> confirmed</span>
            <span><strong className="text-teal-700">{counts.attended}</strong> attended</span>
            <span><strong className="text-rose-600">{counts.absent}</strong> absent</span>
            <span><strong className="text-amber-700">{counts.rescheduled}</strong> rescheduled</span>
            <span className="text-slate-300">·</span>
            <span><strong className="text-violet-700">{counts.progress}</strong> progress</span>
            <span><strong className="text-cyan-700">{counts.renewal}</strong> renewal</span>
          </div>
        </div>

        {/* Export bar */}
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mr-1">Export</span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy as text"}
          </button>
          <button
            type="button"
            onClick={() => handleDownload("text")}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-semibold hover:bg-cyan-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download .txt
          </button>
          <button
            type="button"
            onClick={() => handleDownload("csv")}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download .csv
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            Text format groups by branch + session — paste straight into WhatsApp.
          </span>
        </div>

        {/* Table card */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                {currentEvent ? currentEvent.name : "Pick an event above"}
              </h2>
              {currentEvent && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentEvent.startLabel} – {currentEvent.endLabel}
                </p>
              )}
            </div>
            <span className="text-xs text-slate-400">{rows.length} rows</span>
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto mb-3 flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">No invitations match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["#", "Branch", "Day · Session", "Time", "Student", "Grade", "Type", "Status", "Coach"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((inv, idx) => {
                    const sess = SESSIONS_BY_ID.get(inv.sessionId);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold tracking-wide font-mono">
                            {inv.branch}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">
                          {sess ? `${sess.dayLabel.split(" ")[0]} · S${sess.sessionNumber}` : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {sess ? `${sess.startTime}–${sess.endTime}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{inv.studentName}</div>
                          <div className="text-xs text-slate-400">#{inv.studentId}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700">
                          {gradeLabel(inv.targetGrade)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white ${
                            inv.inviteType === "progress"
                              ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                              : "bg-gradient-to-r from-cyan-500 to-teal-500"
                          }`}>
                            {inv.inviteType === "progress" ? "Progress" : "Renewal"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[inv.status]}`}>
                            {STATUS_LABELS[inv.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {inv.coachName ?? <span className="text-slate-400 italic">—</span>}
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
