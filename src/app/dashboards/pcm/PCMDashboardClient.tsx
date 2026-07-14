"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp, Users, CheckCircle2, XCircle, CalendarClock, Calendar,
  CalendarRange, BadgeCheck, Receipt, ChevronRight, X,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type BranchCode = "PJ" | "KL" | "SJ" | "PG" | "JB";
type InviteType = "progress" | "renewal";
type DashStatus = "invited" | "confirmed" | "attended" | "no_show" | "rescheduled" | "declined";
type RangePreset = "thisWeek" | "thisMonth" | "thisYear" | "custom" | "all";
type Accent = "violet" | "indigo" | "emerald" | "rose" | "amber" | "cyan";

interface DashRecord {
  eventId: string;
  branch: BranchCode;
  inviteType: InviteType;
  status: DashStatus;
  paid: boolean;
}

interface MockEvent {
  id: string;
  name: string;
  startDate: string;
}

interface RenewalRow {
  studentName: string;
  studentId: string;
  branch: BranchCode;
  grade: string;
  coachName: string;
  amount: number;
  date: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_EVENTS: MockEvent[] = [
  { id: "pcm-001", name: "PCM Jul 2026", startDate: "2026-07-14" },
  { id: "pcm-a3",  name: "PCM May 2026", startDate: "2026-05-19" },
  { id: "pcm-a2",  name: "PCM Mar 2026", startDate: "2026-03-10" },
  { id: "pcm-a1",  name: "PCM Jan 2025", startDate: "2025-01-06" },
];

// [eventId, branch, inviteType, status, paid]
const RAW: [string, BranchCode, InviteType, DashStatus, boolean][] = [
  // pcm-a1 (Jan 2025)
  ["pcm-a1","PJ","progress","attended",  false],
  ["pcm-a1","PJ","renewal", "attended",  true ],
  ["pcm-a1","PJ","renewal", "attended",  true ],
  ["pcm-a1","PJ","progress","no_show",   false],
  ["pcm-a1","PJ","renewal", "confirmed", false],
  ["pcm-a1","KL","progress","attended",  false],
  ["pcm-a1","KL","progress","attended",  false],
  ["pcm-a1","KL","renewal", "attended",  true ],
  ["pcm-a1","KL","renewal", "no_show",   false],
  ["pcm-a1","SJ","renewal", "attended",  true ],
  ["pcm-a1","SJ","renewal", "attended",  true ],
  ["pcm-a1","SJ","progress","no_show",   false],
  ["pcm-a1","SJ","progress","no_show",   false],
  ["pcm-a1","PG","renewal", "attended",  true ],
  ["pcm-a1","PG","renewal", "attended",  true ],
  ["pcm-a1","PG","renewal", "attended",  true ],
  ["pcm-a1","PG","renewal", "invited",   false],
  ["pcm-a1","JB","progress","attended",  false],
  ["pcm-a1","JB","renewal", "attended",  true ],
  ["pcm-a1","JB","renewal", "no_show",   false],
  // pcm-a2 (Mar 2026)
  ["pcm-a2","PJ","progress","attended",    false],
  ["pcm-a2","PJ","renewal", "attended",    true ],
  ["pcm-a2","PJ","renewal", "attended",    true ],
  ["pcm-a2","PJ","renewal", "no_show",     false],
  ["pcm-a2","PJ","progress","rescheduled", false],
  ["pcm-a2","KL","progress","attended",    false],
  ["pcm-a2","KL","renewal", "attended",    true ],
  ["pcm-a2","KL","progress","no_show",     false],
  ["pcm-a2","KL","renewal", "confirmed",   false],
  ["pcm-a2","SJ","progress","attended",    false],
  ["pcm-a2","SJ","renewal", "attended",    true ],
  ["pcm-a2","SJ","renewal", "attended",    true ],
  ["pcm-a2","SJ","progress","no_show",     false],
  ["pcm-a2","PG","renewal", "attended",    true ],
  ["pcm-a2","PG","renewal", "attended",    false],
  ["pcm-a2","PG","progress","confirmed",   false],
  ["pcm-a2","JB","progress","attended",    false],
  ["pcm-a2","JB","renewal", "invited",     false],
  // pcm-a3 (May 2026)
  ["pcm-a3","PJ","progress","attended",    false],
  ["pcm-a3","PJ","renewal", "attended",    true ],
  ["pcm-a3","PJ","renewal", "no_show",     false],
  ["pcm-a3","PJ","progress","rescheduled", false],
  ["pcm-a3","KL","progress","attended",    false],
  ["pcm-a3","KL","renewal", "attended",    true ],
  ["pcm-a3","KL","renewal", "attended",    true ],
  ["pcm-a3","KL","progress","no_show",     false],
  ["pcm-a3","SJ","renewal", "attended",    true ],
  ["pcm-a3","SJ","progress","attended",    false],
  ["pcm-a3","SJ","progress","confirmed",   false],
  ["pcm-a3","PG","renewal", "attended",    true ],
  ["pcm-a3","PG","progress","no_show",     false],
  ["pcm-a3","PG","renewal", "no_show",     false],
  ["pcm-a3","JB","progress","attended",    false],
  ["pcm-a3","JB","renewal", "attended",    true ],
  // pcm-001 (Jul 2026 — upcoming)
  ["pcm-001","PJ","progress","confirmed",false],
  ["pcm-001","PJ","renewal", "invited",  false],
  ["pcm-001","PJ","progress","confirmed",false],
  ["pcm-001","KL","renewal", "confirmed",false],
  ["pcm-001","KL","progress","invited",  false],
  ["pcm-001","KL","renewal", "confirmed",false],
  ["pcm-001","SJ","progress","invited",  false],
  ["pcm-001","SJ","progress","confirmed",false],
  ["pcm-001","PG","renewal", "invited",  false],
  ["pcm-001","PG","renewal", "confirmed",false],
  ["pcm-001","JB","progress","invited",  false],
  ["pcm-001","JB","progress","confirmed",false],
];

const MOCK_RECORDS: DashRecord[] = RAW.map(([eventId, branch, inviteType, status, paid]) => ({
  eventId, branch, inviteType, status, paid,
}));

const BRANCH_STUDENT_COUNTS: Record<BranchCode, number> = {
  PJ: 84, KL: 72, SJ: 60, PG: 48, JB: 36,
};

const BRANCHES: { code: BranchCode; name: string }[] = [
  { code: "PJ", name: "Petaling Jaya"  },
  { code: "KL", name: "Kuala Lumpur"   },
  { code: "SJ", name: "Subang Jaya"    },
  { code: "PG", name: "Penang"         },
  { code: "JB", name: "Johor Bahru"    },
];

const MOCK_RENEWAL_ROWS: RenewalRow[] = [
  { studentName:"Nur Farhana binti Rosli",   studentId:"STU-2185", branch:"PJ", grade:"G12",  coachName:"Mr Ali",   amount:1800, date:"2025-01-08" },
  { studentName:"Rajan Kumar",               studentId:"STU-4203", branch:"PG", grade:"G11",  coachName:"Ms Siti",  amount:1600, date:"2025-01-08" },
  { studentName:"Faezah binti Hamid",        studentId:"STU-2290", branch:"KL", grade:"GB1",  coachName:"Ms Rania", amount:2000, date:"2025-01-09" },
  { studentName:"Muthu Krishnan",            studentId:"STU-4455", branch:"PG", grade:"G12",  coachName:"Ms Siti",  amount:1800, date:"2025-01-09" },
  { studentName:"Vinod Anand",               studentId:"STU-5129", branch:"JB", grade:"G11",  coachName:"Mr Hafiz", amount:1600, date:"2025-01-10" },
  { studentName:"Salmah binti Daud",         studentId:"STU-4567", branch:"PG", grade:"GB1",  coachName:"Ms Rania", amount:2000, date:"2025-01-10" },
  { studentName:"Umi Kalsom binti Razak",    studentId:"STU-2501", branch:"KL", grade:"GB1",  coachName:"Mr Ali",   amount:2000, date:"2026-05-21" },
  { studentName:"Hazwan bin Kamaruddin",     studentId:"STU-5234", branch:"JB", grade:"G11",  coachName:"Mr Hafiz", amount:1600, date:"2026-05-21" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(preset: RangePreset, customStart: string, customEnd: string): { start: Date; end: Date } | null {
  const now = new Date();
  if (preset === "all") return null;
  if (preset === "custom") {
    if (!customStart || !customEnd) return null;
    return { start: new Date(customStart), end: new Date(customEnd + "T23:59:59") };
  }
  if (preset === "thisWeek") {
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { start: mon, end: sun };
  }
  if (preset === "thisMonth") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (preset === "thisYear") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end:   new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return null;
}

function getRangeLabel(preset: RangePreset, customStart: string, customEnd: string): string {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const now = new Date();
  if (preset === "all")       return "All events on record";
  if (preset === "thisWeek")  return "This week";
  if (preset === "thisMonth") return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  if (preset === "thisYear")  return String(now.getFullYear());
  if (preset === "custom")    return customStart && customEnd ? `${customStart} → ${customEnd}` : "Custom range";
  return "";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ACCENTS: Record<Accent, { strip: string; text: string; bg: string; iconBg: string }> = {
  violet:  { strip:"bg-violet-500",  text:"text-violet-700",  bg:"bg-violet-50/60",  iconBg:"bg-violet-100 text-violet-600"  },
  indigo:  { strip:"bg-indigo-500",  text:"text-indigo-700",  bg:"bg-indigo-50/60",  iconBg:"bg-indigo-100 text-indigo-600"  },
  emerald: { strip:"bg-emerald-500", text:"text-emerald-700", bg:"bg-emerald-50/60", iconBg:"bg-emerald-100 text-emerald-600" },
  rose:    { strip:"bg-rose-500",    text:"text-rose-700",    bg:"bg-rose-50/60",    iconBg:"bg-rose-100 text-rose-600"      },
  amber:   { strip:"bg-amber-500",   text:"text-amber-700",   bg:"bg-amber-50/60",   iconBg:"bg-amber-100 text-amber-600"    },
  cyan:    { strip:"bg-cyan-500",    text:"text-cyan-700",    bg:"bg-cyan-50/60",    iconBg:"bg-cyan-100 text-cyan-600"      },
};

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: number; icon: React.ElementType; accent: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <div className={`relative rounded-xl ${a.bg} border border-slate-200 shadow-sm p-4 overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.strip}`} />
      <div className="flex items-start justify-between pl-2">
        <div className={`text-[10px] font-semibold uppercase tracking-wider ${a.text}`}>{label}</div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${a.iconBg}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-3xl font-black text-slate-900 mt-2 pl-2">{value}</div>
    </div>
  );
}

function TypeSplitCard({ label, invited, attended, totalAttended, accent, onViewDetails }: {
  label: string; invited: number; attended: number; totalAttended: number;
  accent: Accent; onViewDetails?: () => void;
}) {
  const internalPct     = invited > 0 ? Math.round((attended / invited) * 100) : 0;
  const shareOfAttended = totalAttended > 0 ? Math.round((attended / totalAttended) * 100) : 0;
  const a = ACCENTS[accent];
  return (
    <div className={`relative rounded-xl ${a.bg} border border-slate-200 shadow-sm overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.strip}`} />
      <div className="p-4 pl-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-base font-bold ${a.text}`}>{label}</h3>
          <div className="flex items-center gap-2">
            {onViewDetails && (
              <button
                onClick={onViewDetails}
                className={`inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-0.5 text-[10px] font-semibold ${a.text} hover:bg-white/60 transition-colors`}
              >
                <Receipt className="w-3 h-3" /> View renewals
              </button>
            )}
            <span className={`text-[10px] font-bold ${a.text}`}>{internalPct}%</span>
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-black text-slate-900">{invited}</span>
          <span className="text-sm text-slate-500">invited</span>
          <span className="text-slate-300 mx-1">·</span>
          <span className="text-2xl font-bold text-slate-900">{attended}</span>
          <span className="text-sm text-slate-500">attended</span>
        </div>
        <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-slate-200">
          <div className={`h-full ${a.strip} rounded-full transition-all`} style={{ width: `${internalPct}%` }} />
        </div>
        <div className="text-[11px] text-slate-500 mt-2">
          {shareOfAttended}% of total attended is {label.replace("PCM ", "")}
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PCMDashboardClient() {
  const [rangePreset, setRangePreset]   = useState<RangePreset>("all");
  const [customStart, setCustomStart]   = useState("");
  const [customEnd, setCustomEnd]       = useState("");
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">("all");
  const [outcomeScope, setOutcomeScope] = useState<"overall" | "renewal">("overall");
  const [renewalOpen, setRenewalOpen]   = useState(false);

  const range = useMemo(
    () => getDateRange(rangePreset, customStart, customEnd),
    [rangePreset, customStart, customEnd],
  );

  const eventsInRange = useMemo(() => {
    if (!range) return MOCK_EVENTS;
    return MOCK_EVENTS.filter(e => {
      const d = new Date(e.startDate);
      return d >= range.start && d <= range.end;
    });
  }, [range]);

  const eventIdsInRange = useMemo(
    () => new Set(eventsInRange.map(e => e.id)),
    [eventsInRange],
  );

  const filteredRecords = useMemo(() => {
    return MOCK_RECORDS.filter(r => {
      if (!eventIdsInRange.has(r.eventId)) return false;
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      return true;
    });
  }, [eventIdsInRange, branchFilter]);

  const stats = useMemo(() => {
    const invited     = filteredRecords.length;
    const confirmed   = filteredRecords.filter(r => r.status === "confirmed" || r.status === "attended").length;
    const attended    = filteredRecords.filter(r => r.status === "attended").length;
    const absent      = filteredRecords.filter(r => r.status === "no_show" || r.status === "declined").length;
    const rescheduled = filteredRecords.filter(r => r.status === "rescheduled").length;

    const progressInvs    = filteredRecords.filter(r => r.inviteType === "progress");
    const renewalInvs     = filteredRecords.filter(r => r.inviteType === "renewal");
    const progressAttended = progressInvs.filter(r => r.status === "attended").length;
    const renewalAttended  = renewalInvs.filter(r => r.status === "attended").length;
    const attendancePct    = invited > 0 ? Math.round((attended / invited) * 100) : 0;

    return {
      invited, confirmed, attended, absent, rescheduled,
      progressInvited: progressInvs.length, progressAttended,
      renewalInvited:  renewalInvs.length,  renewalAttended,
      attendancePct,
    };
  }, [filteredRecords]);

  const outcomeInvs = useMemo(
    () => outcomeScope === "renewal" ? filteredRecords.filter(r => r.inviteType === "renewal") : filteredRecords,
    [filteredRecords, outcomeScope],
  );

  const outcomeStats = useMemo(() => {
    const paid   = outcomeInvs.filter(r => r.paid);
    const unpaid = outcomeInvs.filter(r => !r.paid);
    const isAtt  = (r: DashRecord) => r.status === "attended";
    return {
      invited:          outcomeInvs.length,
      paid:             paid.length,
      unpaid:           unpaid.length,
      paidPct:          outcomeInvs.length > 0 ? Math.round((paid.length / outcomeInvs.length) * 100) : 0,
      unpaidPct:        outcomeInvs.length > 0 ? Math.round((unpaid.length / outcomeInvs.length) * 100) : 0,
      paidAttended:     paid.filter(isAtt).length,
      paidNotAttended:  paid.filter(r => !isAtt(r)).length,
      unpaidAttended:   unpaid.filter(isAtt).length,
      unpaidNotAttended:unpaid.filter(r => !isAtt(r)).length,
    };
  }, [outcomeInvs]);

  const branchCards = useMemo(() => {
    return BRANCHES
      .filter(b => branchFilter === "all" || b.code === branchFilter)
      .map(b => {
        const totalStudents = BRANCH_STUDENT_COUNTS[b.code];
        const shouldInvite  = Math.round(totalStudents / 12);
        const invited       = filteredRecords.filter(r => r.branch === b.code).length;
        const pct           = shouldInvite > 0 ? Math.round((invited / shouldInvite) * 100) : 0;
        return { code: b.code, name: b.name, totalStudents, shouldInvite, invited, pct };
      });
  }, [filteredRecords, branchFilter]);

  const rangeLabel = getRangeLabel(rangePreset, customStart, customEnd);

  return (
    <div className="px-4 py-6 md:px-8 max-w-7xl mx-auto space-y-5">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-slate-400">
        <Link href="/dashboards" className="hover:text-slate-700 transition-colors">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-700 font-medium">PCM System</span>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <TrendingUp className="absolute -right-4 -top-4 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="text-[10px] font-semibold uppercase tracking-widest text-white/70 mb-1">PCM · Dashboard</div>
        <h1 className="text-3xl font-bold tracking-tight">Performance Overview</h1>
        <p className="text-white/80 text-sm mt-1.5">
          {rangeLabel}
          {branchFilter !== "all" && <> · Branch {branchFilter}</>}
        </p>
      </div>

      {/* Range + Branch filter */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-violet-500 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Show</span>
          <div className="inline-flex p-1 rounded-lg bg-slate-100 border border-slate-200">
            {([
              { id:"thisWeek",  label:"This week"  },
              { id:"thisMonth", label:"This month" },
              { id:"thisYear",  label:"This year"  },
              { id:"custom",    label:"Custom"     },
              { id:"all",       label:"All time"   },
            ] as { id: RangePreset; label: string }[]).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRangePreset(opt.id)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  rangePreset === opt.id
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {rangePreset === "custom" && (
            <div className="flex items-center gap-2">
              <CalendarRange className="w-3.5 h-3.5 text-violet-500" />
              <input type="date" className="h-8 rounded-lg border border-slate-200 px-2 text-xs" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span className="text-xs text-slate-400">→</span>
              <input type="date" className="h-8 rounded-lg border border-slate-200 px-2 text-xs" value={customEnd} min={customStart} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Branch</span>
            <select
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs min-w-[160px]"
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Invited"     value={stats.invited}     icon={Users}         accent="violet"  />
        <StatCard label="Confirmed"   value={stats.confirmed}   icon={BadgeCheck}    accent="indigo"  />
        <StatCard label="Attended"    value={stats.attended}    icon={CheckCircle2}  accent="emerald" />
        <StatCard label="Absent"      value={stats.absent}      icon={XCircle}       accent="rose"    />
        <StatCard label="Rescheduled" value={stats.rescheduled} icon={CalendarClock} accent="amber"   />
      </div>

      {/* Type split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TypeSplitCard
          label="PCM Progress"
          invited={stats.progressInvited}
          attended={stats.progressAttended}
          totalAttended={stats.attended}
          accent="violet"
        />
        <TypeSplitCard
          label="PCM Renewal"
          invited={stats.renewalInvited}
          attended={stats.renewalAttended}
          totalAttended={stats.attended}
          accent="cyan"
          onViewDetails={() => setRenewalOpen(true)}
        />
      </div>

      {/* Renewal modal */}
      {renewalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRenewalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600 mb-0.5">PCM Renewal</div>
                <h2 className="text-lg font-bold text-slate-900">Who renewed — coach &amp; amount</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Renewals on record · {branchFilter === "all" ? "all branches" : branchFilter}
                </p>
              </div>
              <button onClick={() => setRenewalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-slate-500">Total renewals: <strong className="text-slate-900">
                RM {MOCK_RENEWAL_ROWS.reduce((s, r) => s + r.amount, 0).toLocaleString("en-MY", { minimumFractionDigits:2 })}
              </strong></span>
              <span className="text-slate-400 text-xs">{MOCK_RENEWAL_ROWS.length} student rows</span>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Coach</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Branch</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Amount (RM)</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MOCK_RENEWAL_ROWS.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.studentName}</div>
                        <div className="text-xs text-slate-400 font-mono">#{r.studentId} · {r.grade}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.coachName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-bold">
                          {r.branch}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {r.amount.toLocaleString("en-MY", { minimumFractionDigits:2 })}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Payment breakdown */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-900">Outcome breakdown</h3>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-semibold">
              {(["overall", "renewal"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setOutcomeScope(s)}
                  className={`px-3 py-1 transition-colors ${
                    outcomeScope === s ? "bg-violet-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {s === "overall" ? "Overall" : "PCM Renewal"}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-slate-500">
            across {outcomeStats.invited} {outcomeScope === "renewal" ? "renewal" : "invited"} student{outcomeStats.invited !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Stacked bar */}
        <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-100 border border-slate-200 mb-3">
          {outcomeStats.paid > 0 && (
            <div className="h-full bg-emerald-500" style={{ width:`${outcomeStats.paidPct}%` }} title={`Paid: ${outcomeStats.paid}`} />
          )}
          {outcomeStats.unpaid > 0 && (
            <div className="h-full bg-rose-400" style={{ width:`${outcomeStats.unpaidPct}%` }} title={`Unpaid: ${outcomeStats.unpaid}`} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Paid */}
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Paid</span>
            </div>
            <div className="text-3xl font-black text-slate-900 leading-none">{outcomeStats.paid}</div>
            <div className="text-[11px] text-slate-500 mt-1">{outcomeStats.paidPct}% of invited</div>
            <div className="text-[11px] text-slate-500 mt-0.5">└ {outcomeStats.paidAttended} attended · {outcomeStats.paidNotAttended} not attended</div>
          </div>
          {/* Unpaid */}
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Unpaid</span>
            </div>
            <div className="text-3xl font-black text-slate-900 leading-none">{outcomeStats.unpaid}</div>
            <div className="text-[11px] text-slate-500 mt-1">{outcomeStats.unpaidPct}% of invited</div>
            <div className="text-[11px] text-slate-500 mt-0.5">└ {outcomeStats.unpaidAttended} attended · {outcomeStats.unpaidNotAttended} not attended</div>
          </div>
        </div>
      </div>

      {/* Attendance rate */}
      <div className="rounded-2xl bg-white shadow-sm border border-violet-200 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-100 to-indigo-100 px-5 py-2 border-b border-violet-200">
          <div className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Attendance rate</div>
        </div>
        <div className="p-6 flex items-center gap-6 flex-wrap">
          <div className="text-6xl font-black text-violet-700 leading-none">{stats.attendancePct}%</div>
          <div className="text-sm text-slate-500">
            <strong className="text-slate-900">{stats.attended}</strong> attended /
            <strong className="text-slate-900 ml-1">{stats.invited}</strong> invited
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
                style={{ width:`${stats.attendancePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Branch coverage */}
      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-3 flex items-center justify-between border-b border-slate-200">
          <h2 className="text-base font-semibold text-violet-900">Invite coverage by branch</h2>
          <span className="text-xs text-slate-500">
            Target = total students ÷ 12 · {branchCards.length} branch{branchCards.length !== 1 ? "es" : ""}
          </span>
        </div>
        {branchCards.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">No branch data for this range.</div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {branchCards.map(c => {
              const met  = c.shouldInvite > 0 && c.invited >= c.shouldInvite;
              const tone = met ? "emerald" : c.pct >= 50 ? "amber" : "rose";
              const head = tone === "emerald" ? "from-emerald-500 to-emerald-600"
                         : tone === "amber"   ? "from-amber-500 to-amber-600"
                         :                       "from-rose-500 to-rose-600";
              const bar  = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-rose-500";
              return (
                <div key={c.code} className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                  <div className={`bg-gradient-to-r ${head} px-3 py-2 flex items-center justify-between`}>
                    <span className="font-mono text-xs font-bold uppercase text-white" title={c.name}>{c.code}</span>
                    <span className="text-[11px] font-bold text-white/90">{c.pct}%</span>
                  </div>
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900 leading-none">{c.invited}</span>
                      <span className="text-base text-slate-300 font-semibold leading-none">/ {c.shouldInvite}</span>
                    </div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mt-1">Invited / Target</div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                      <div className={`h-full ${bar} rounded-full transition-all`} style={{ width:`${Math.min(100, c.pct)}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 border-t border-slate-100">
                    <div className="px-3 py-2 text-center border-r border-slate-100">
                      <div className="text-lg font-bold text-slate-900 leading-none">{c.totalStudents}</div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mt-1">Total students</div>
                    </div>
                    <div className="px-3 py-2 text-center">
                      <div className="text-lg font-bold text-violet-700 leading-none">{c.shouldInvite}</div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mt-1">Should invite</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
