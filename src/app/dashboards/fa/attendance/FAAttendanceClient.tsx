"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Home, ChevronRight, Filter,
  ClipboardCheck, Users,
} from "lucide-react";
import {
  BRANCHES, MOCK_ATT_EVENTS, MOCK_ATT_STUDENTS,
  AttendanceStatus, BranchCode,
} from "./_mock";

type StatusFilter = "all" | "present" | "absent" | "late" | "unrecorded";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All",        value: "all"        },
  { label: "Present",    value: "present"    },
  { label: "Absent",     value: "absent"     },
  { label: "Late",       value: "late"       },
  { label: "Unrecorded", value: "unrecorded" },
];

const ATT_STYLES: Record<AttendanceStatus, { dot: string; text: string; bg: string }> = {
  present: { dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50"  },
  absent:  { dot: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50"    },
  late:    { dot: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50"  },
};

function AttBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Unrecorded
      </span>
    );
  }
  const s = ATT_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function AttToggle({
  value,
  onChange,
}: {
  value: AttendanceStatus | null;
  onChange: (s: AttendanceStatus | null) => void;
}) {
  const options: { label: string; val: AttendanceStatus }[] = [
    { label: "Present", val: "present" },
    { label: "Late",    val: "late"    },
    { label: "Absent",  val: "absent"  },
  ];
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
      {options.map(o => (
        <button
          key={o.val}
          type="button"
          onClick={() => onChange(value === o.val ? null : o.val)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            value === o.val
              ? o.val === "present"
                ? "bg-green-600 text-white"
                : o.val === "late"
                ? "bg-amber-500 text-white"
                : "bg-red-500 text-white"
              : "text-slate-600 hover:bg-white hover:shadow-sm"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatPill({
  label, count, color,
}: {
  label: string; count: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xl font-bold ${color}`}>{count}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

export default function FAAttendanceClient() {
  const [eventId,      setEventId]      = useState(MOCK_ATT_EVENTS[0].id);
  const [branch,       setBranch]       = useState<BranchCode | "all">("all");
  const [session,      setSession]      = useState("all");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus | null>>(new Map());

  function getStatus(studentId: string, defaultStatus: AttendanceStatus | null) {
    return overrides.has(studentId) ? overrides.get(studentId)! : defaultStatus;
  }
  function setStatus(studentId: string, status: AttendanceStatus | null) {
    setOverrides(prev => new Map(prev).set(studentId, status));
  }

  const selectedEvent = MOCK_ATT_EVENTS.find(e => e.id === eventId)!;

  const eventStudents = useMemo(
    () => MOCK_ATT_STUDENTS.filter(s => s.eventId === eventId),
    [eventId],
  );

  const sessions = useMemo(() => {
    const set = new Set(eventStudents.map(s => s.session));
    return Array.from(set).sort();
  }, [eventStudents]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eventStudents.filter(s => {
      const eff = getStatus(s.id, s.status);
      if (branch !== "all" && s.branch !== branch) return false;
      if (session !== "all" && s.session !== session) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "unrecorded") { if (eff !== null) return false; }
        else { if (eff !== statusFilter) return false; }
      }
      if (q) {
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.studentId.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventStudents, branch, session, statusFilter, search, overrides]);

  const counts = useMemo(() => {
    let present = 0, absent = 0, late = 0, unrecorded = 0;
    for (const s of eventStudents) {
      const eff = getStatus(s.id, s.status);
      if (eff === "present")  present++;
      else if (eff === "absent")   absent++;
      else if (eff === "late")     late++;
      else                         unrecorded++;
    }
    return { present, absent, late, unrecorded, total: eventStudents.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventStudents, overrides]);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  }

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
          <span className="text-slate-800 font-medium">Attendance</span>
        </nav>

        {/* Page header */}
        <div className="flex items-end justify-between gap-4 mb-1">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">FA Attendance</h1>
            <p className="text-sm text-slate-500 mt-1">
              {selectedEvent.name} · {fmtDate(selectedEvent.startDate)}
              {selectedEvent.startDate !== selectedEvent.endDate && ` – ${fmtDate(selectedEvent.endDate)}`}
              {" · "}{selectedEvent.venue}
            </p>
          </div>

          {/* Summary pills */}
          <div className="hidden sm:flex items-center gap-5 shrink-0 mb-0.5">
            <StatPill label="present"    count={counts.present}    color="text-green-600" />
            <div className="w-px h-6 bg-slate-200" />
            <StatPill label="late"       count={counts.late}       color="text-amber-500" />
            <div className="w-px h-6 bg-slate-200" />
            <StatPill label="absent"     count={counts.absent}     color="text-red-500" />
            <div className="w-px h-6 bg-slate-200" />
            <StatPill label="unrecorded" count={counts.unrecorded} color="text-slate-400" />
          </div>
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />

          {/* Event select */}
          <select
            value={eventId}
            onChange={e => { setEventId(e.target.value); setSession("all"); }}
            className="py-2 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ minWidth: 240 }}
          >
            {MOCK_ATT_EVENTS.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({fmtDate(ev.startDate)})
              </option>
            ))}
          </select>

          {/* Session select */}
          {sessions.length > 1 && (
            <select
              value={session}
              onChange={e => setSession(e.target.value)}
              className="py-2 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ minWidth: 140 }}
            >
              <option value="all">All sessions</option>
              {sessions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Branch select */}
          <select
            value={branch}
            onChange={e => setBranch(e.target.value as BranchCode | "all")}
            className="py-2 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ minWidth: 160 }}
          >
            <option value="all">All branches</option>
            {BRANCHES.map(b => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>

          {/* Status pill toggle */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === f.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-slate-400 shrink-0">
            {rows.length} student{rows.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-10">

        {/* Mobile summary bar */}
        <div className="sm:hidden bg-white border border-slate-200 rounded-2xl p-4 mb-5 flex items-center justify-around">
          <StatPill label="present"    count={counts.present}    color="text-green-600" />
          <div className="w-px h-6 bg-slate-200" />
          <StatPill label="late"       count={counts.late}       color="text-amber-500" />
          <div className="w-px h-6 bg-slate-200" />
          <StatPill label="absent"     count={counts.absent}     color="text-red-500" />
          <div className="w-px h-6 bg-slate-200" />
          <StatPill label="unrecorded" count={counts.unrecorded} color="text-slate-400" />
        </div>

        {/* Progress bar */}
        {counts.total > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Attendance Progress
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {counts.present + counts.late + counts.absent} / {counts.total} recorded
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(counts.present / counts.total) * 100}%` }}
              />
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${(counts.late / counts.total) * 100}%` }}
              />
              <div
                className="h-full bg-red-400 transition-all"
                style={{ width: `${(counts.absent / counts.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center">
            <Users className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No students match your filters.</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the session, branch, or status filters.</p>
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
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Session</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">Mark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => {
                    const eff = getStatus(row.id, row.status);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 whitespace-nowrap">{row.name}</div>
                          <div className="text-xs text-slate-400 font-mono">#{row.studentId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {row.branch}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-700">
                          G{row.grade}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {row.session}
                        </td>
                        <td className="px-4 py-3">
                          <AttBadge status={eff} />
                        </td>
                        <td className="px-4 py-3">
                          <AttToggle
                            value={eff}
                            onChange={s => setStatus(row.id, s)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {rows.length} student{rows.length !== 1 ? "s" : ""} shown
              </span>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span><span className="font-semibold text-green-600">{counts.present}</span> present</span>
                <span><span className="font-semibold text-amber-500">{counts.late}</span> late</span>
                <span><span className="font-semibold text-red-500">{counts.absent}</span> absent</span>
                <span><span className="font-semibold text-slate-400">{counts.unrecorded}</span> unrecorded</span>
              </div>
            </div>
          </div>
        )}

        {/* Save notice */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
          Changes are saved locally (mock only — backend not connected yet).
        </div>
      </div>
    </div>
  );
}
