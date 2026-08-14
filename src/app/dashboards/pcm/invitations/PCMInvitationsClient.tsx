"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Home, ChevronRight, ListOrdered, Search,
  Download, Copy, Check, Users, Loader2,
} from "lucide-react";
import {
  BRANCHES as PCM_BRANCHES, gradeLabel,
  type FAEvent as RawEvent, type Session as RawSession, type Invitation as RawInvitation,
} from "@/lib/pcm/types";

type BranchCode = string;
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

interface PCMDataBundle {
  events: RawEvent[];
  sessions: RawSession[];
  invitations: RawInvitation[];
}

const BRANCH_NAMES: Record<string, string> = Object.fromEntries(PCM_BRANCHES.map(b => [b.code, b.name]));
const BRANCHES: string[] = PCM_BRANCHES.map(b => b.code);

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function dayMon(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS_SHORT[m - 1]}` : iso;
}
function dayMonYear(iso: string): string {
  const [y] = iso.split("-").map(Number);
  return `${dayMon(iso)} ${y}`;
}

function toEvents(data: PCMDataBundle): PCMMockEvent[] {
  return data.events.map(e => ({
    id: e.id, name: e.name,
    startLabel: dayMon(e.startDate), endLabel: dayMonYear(e.endDate),
  }));
}
function toSessions(data: PCMDataBundle): PCMMockSession[] {
  return data.sessions.map(s => ({
    id: s.id, eventId: s.eventId, dayNumber: s.dayNumber,
    dayLabel: s.label || `Day ${s.dayNumber}`,
    sessionNumber: s.sessionNumber, startTime: s.startTime, endTime: s.endTime,
  }));
}
function toInvitations(data: PCMDataBundle): PCMInvitation[] {
  return data.invitations.map(i => ({
    id: i.id, eventId: i.eventId, sessionId: i.sessionId,
    studentId: i.studentId,
    studentName: i.studentName || `#${i.studentId}`,
    branch: i.branch,
    grade: i.targetGrade, targetGrade: i.targetGrade,
    inviteType: (i.inviteType === "renewal" ? "renewal" : "progress"),
    status: i.status,
    coachName: i.coachName ?? null,
  }));
}

const STATUS_BADGE: Record<InvitationStatus, string> = {
  invited:     "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  confirmed:   "bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  attended:    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
  rescheduled: "bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  declined:    "bg-rose-50 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  no_show:     "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABELS: Record<InvitationStatus, string> = {
  invited: "Pending", confirmed: "Confirmed", attended: "Attended",
  rescheduled: "Rescheduled", declined: "Declined", no_show: "No-show",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PCMInvitationsClient() {
  const [eventId, setEventId] = useState<string>("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<number | "all">("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const [events, setEvents]           = useState<PCMMockEvent[]>([]);
  const [sessions, setSessions]       = useState<PCMMockSession[]>([]);
  const [invitations, setInvitations] = useState<PCMInvitation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/pcm/data", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load invitations (${res.status})`);
        const data = (await res.json()) as PCMDataBundle;
        if (!alive) return;
        // Events sorted soonest-first, matching the events page ordering.
        const evs = toEvents(data).sort((a, b) => {
          const ea = data.events.find(e => e.id === a.id)?.startDate ?? "";
          const eb = data.events.find(e => e.id === b.id)?.startDate ?? "";
          return ea.localeCompare(eb);
        });
        setEvents(evs);
        setSessions(toSessions(data));
        setInvitations(toInvitations(data));
        // Default to the most recent event that has invitations.
        const withInv = [...evs].reverse().find(e => data.invitations.some(i => i.eventId === e.id));
        setEventId(withInv?.id ?? evs[0]?.id ?? "");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load invitations");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const SESSIONS_BY_ID = useMemo(
    () => new Map<string, PCMMockSession>(sessions.map(s => [s.id, s])),
    [sessions],
  );

  const currentEvent = events.find(e => e.id === eventId);

  const eventSessions = useMemo(
    () => sessions.filter(s => s.eventId === eventId)
          .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [sessions, eventId],
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
    let list = invitations.filter(i => i.eventId === eventId);
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
  }, [invitations, SESSIONS_BY_ID, eventId, branchFilter, statusFilter, typeFilter, dayFilter, sessionFilter, search]);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 md:px-6 py-8 space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/dashboards" className="hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> Home
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
          <Link href="/dashboards/pcm" className="hover:text-slate-900 dark:hover:text-slate-100">PCM System</Link>
          <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Invitations</span>
        </nav>

        {/* Masthead */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">PCM System</p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <ListOrdered className="w-6 h-6 text-slate-400" aria-hidden="true" />
              Invitation List
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Filter, copy for WhatsApp, or download as CSV.</p>
          </div>
        </div>

        {/* Filter card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          {/* Row 1: event + day + session */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Event</label>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px] dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
                value={eventId}
                onChange={e => { setEventId(e.target.value); setDayFilter("all"); setSessionFilter("all"); }}
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name} ({ev.startLabel})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Day</label>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
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
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px] dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
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
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
            >
              <option value="all">All branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b} — {BRANCH_NAMES[b]}</option>)}
            </select>

            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
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
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
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
                className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
                placeholder="Search name, ID, coach…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span><strong className="text-slate-900 dark:text-slate-100">{counts.invited}</strong> rows</span>
            <span><strong className="text-emerald-700 dark:text-emerald-300">{counts.confirmed}</strong> confirmed</span>
            <span><strong className="text-teal-700 dark:text-teal-300">{counts.attended}</strong> attended</span>
            <span><strong className="text-rose-600 dark:text-rose-300">{counts.absent}</strong> absent</span>
            <span><strong className="text-amber-700 dark:text-amber-300">{counts.rescheduled}</strong> rescheduled</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span><strong className="text-violet-700 dark:text-violet-300">{counts.progress}</strong> progress</span>
            <span><strong className="text-cyan-700 dark:text-cyan-300">{counts.renewal}</strong> renewal</span>
          </div>
        </div>

        {/* Export bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mr-1">Export</span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:border-violet-700 dark:bg-violet-900 dark:text-violet-300 dark:hover:bg-violet-800"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy as text"}
          </button>
          <button
            type="button"
            onClick={() => handleDownload("text")}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-semibold hover:bg-cyan-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:border-cyan-700 dark:bg-cyan-900 dark:text-cyan-300 dark:hover:bg-cyan-800"
          >
            <Download className="w-3.5 h-3.5" /> Download .txt
          </button>
          <button
            type="button"
            onClick={() => handleDownload("csv")}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-800"
          >
            <Download className="w-3.5 h-3.5" /> Download .csv
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            Text format groups by branch + session — paste straight into WhatsApp.
          </span>
        </div>

        {/* Table card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
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

          {loading ? (
            <div className="p-12 flex flex-col items-center text-center">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading invitations…</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center"><p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto mb-3 flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">No invitations match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {["#", "Branch", "Day · Session", "Time", "Student", "Grade", "Type", "Status", "Coach"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((inv, idx) => {
                    const sess = SESSIONS_BY_ID.get(inv.sessionId);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold tracking-wide font-mono dark:bg-violet-900 dark:text-violet-300">
                            {inv.branch}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {sess ? `${sess.dayLabel.split(" ")[0]} · S${sess.sessionNumber}` : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {sess ? `${sess.startTime}–${sess.endTime}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{inv.studentName}</div>
                          <div className="text-xs text-slate-400">#{inv.studentId}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">
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
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
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
