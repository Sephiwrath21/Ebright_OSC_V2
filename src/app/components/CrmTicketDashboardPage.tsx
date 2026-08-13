"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home, ChevronRight, Ticket, CheckCircle2, Clock,
  AlertCircle, BarChart2, RefreshCw, Eye, TrendingDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";

interface RecentTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  studentName: string | null;
  submitterName: string | null;
  platform: string;
  accentColor: string | null;
  branchCode: string | null;
  branchName: string | null;
  status: TicketStatus;
  createdAt: string;
}
interface DashboardResponse {
  totals: { all: number; open: number; inProgress: number; resolved: number; closed: number };
  avgResolutionHours: number;
  categories: Array<{ label: string; subType: string; count: number; pct: number }>;
  byPlatform: Array<{ id: string; name: string; slug: string | null; accent: string | null; count: number }>;
  recent: RecentTicket[];
}

const STATUS_BADGE: Record<TicketStatus, string> = {
  "Open":        "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  "In Progress": "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200",
  "Resolved":    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  "Closed":      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const CAT_COLORS = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-red-400", "bg-violet-500", "bg-slate-400"];

function ageOf(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "<1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch("/api/crm/tickets/dashboard", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<DashboardResponse>;
      })
      .then((d) => { if (!ignore) { setData(d); setError(null); } })
      .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!ignore) { setLoading(false); setSpinning(false); } });
    return () => { ignore = true; };
  }, [nonce]);

  function refresh() { setSpinning(true); setNonce(n => n + 1); }

  const t = data?.totals;
  const STATS = [
    { label: "Total Tickets", value: t?.all ?? 0,        icon: Ticket,       bg: "bg-blue-50 dark:bg-blue-900",   border: "border-blue-200 dark:border-blue-700",   text: "text-blue-700 dark:text-blue-200" },
    { label: "Open",          value: t?.open ?? 0,       icon: AlertCircle,  bg: "bg-amber-50 dark:bg-amber-900",  border: "border-amber-200 dark:border-amber-700",  text: "text-amber-700 dark:text-amber-200" },
    { label: "In Progress",   value: t?.inProgress ?? 0, icon: Clock,        bg: "bg-violet-50 dark:bg-violet-900", border: "border-violet-200 dark:border-violet-700", text: "text-violet-700 dark:text-violet-200" },
    { label: "Resolved",      value: t?.resolved ?? 0,   icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-900",border: "border-emerald-200 dark:border-emerald-700",text: "text-emerald-700 dark:text-emerald-200" },
    { label: "Closed",        value: t?.closed ?? 0,     icon: TrendingDown, bg: "bg-slate-50 dark:bg-slate-800",  border: "border-slate-200 dark:border-slate-700",  text: "text-slate-600 dark:text-slate-300" },
    { label: "Avg Response",  value: data ? `${data.avgResolutionHours.toFixed(1)}h` : "—", icon: BarChart2, bg: "bg-sky-50 dark:bg-sky-900", border: "border-sky-200 dark:border-sky-700", text: "text-sky-700 dark:text-sky-200" },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700 dark:text-slate-300">Ticket</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Dashboard</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ticket Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Overview of all support tickets across branches.</p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-700 dark:bg-red-900 dark:text-red-300">
            Couldn&apos;t load ticket dashboard: {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {STATS.map(({ label, value, icon: Icon, bg, border, text }) => (
            <div key={label} className={`rounded-2xl border ${border} ${bg} px-4 py-3 flex flex-col gap-1`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${text}`}>{label}</span>
                <Icon className={`w-4 h-4 ${text}`} />
              </div>
              <span className={`text-2xl font-bold ${text}`}>{loading ? "…" : value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Recent tickets */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Tickets</h2>
              <Link href="/crm/ticket/my-tickets" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                View all <Eye className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-2.5 text-left font-semibold">ID</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Request</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Platform</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Branch</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">Loading…</td></tr>
                  ) : (data?.recent.length ?? 0) === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">No tickets.</td></tr>
                  ) : data!.recent.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-5 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.ticketNumber}</td>
                      <td className="px-5 py-3 max-w-[240px]">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-xs truncate">{t.subject}</p>
                        <p className="text-[11px] text-slate-400 truncate">{t.studentName ?? t.submitterName ?? "—"}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.accentColor ?? "#94a3b8" }} />
                          {t.platform}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {t.branchCode || t.branchName ? (
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                            {t.branchCode ?? t.branchName}
                          </span>
                        ) : <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[t.status]}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">{ageOf(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Tickets by Request Type</h2>
            <div className="space-y-3">
              {loading ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : (data?.categories ?? []).map((cat, i) => (
                <div key={cat.subType || cat.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-700 dark:text-slate-300">{cat.label}</span>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{cat.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${CAT_COLORS[i % CAT_COLORS.length]} transition-all`} style={{ width: `${cat.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Platform summary */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">By Platform</h3>
              <div className="grid grid-cols-2 gap-2">
                {(data?.byPlatform ?? []).map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.accent ?? "#94a3b8" }} />
                    <div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{p.name}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{p.count}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
