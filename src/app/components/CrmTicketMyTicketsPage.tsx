"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Home, ChevronRight, Search, Plus, Eye,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";

interface ApiTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  studentName: string | null;
  submitterName: string | null;
  platform: string;
  accentColor: string | null;
  branchName: string | null;
  branchCode: string | null;
  status: TicketStatus;
  createdAt: string;
}
interface ApiResponse {
  data: ApiTicket[];
  total: number;
  counts: Record<"All" | TicketStatus, number>;
}

const STATUS_BADGE: Record<TicketStatus, string> = {
  "Open":        "bg-amber-100 text-amber-700",
  "In Progress": "bg-violet-100 text-violet-700",
  "Resolved":    "bg-emerald-100 text-emerald-700",
  "Closed":      "bg-slate-100 text-slate-500",
};

const STATUS_TABS: (TicketStatus | "All")[] = ["All", "Open", "In Progress", "Resolved", "Closed"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}
function ageOf(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketMyTicketsPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TicketStatus | "All">("All");
  const [resp, setResp] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read-only: superadmin sees every ticket. Status tab + search drive the query.
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const qs = new URLSearchParams({ pageSize: "100" });
    if (activeTab !== "All") qs.set("status", activeTab);
    if (search.trim()) qs.set("search", search.trim());
    const handle = setTimeout(() => {
      fetch(`/api/crm/tickets?${qs.toString()}`, { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) {
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? `Request failed (${r.status})`);
          }
          return r.json() as Promise<ApiResponse>;
        })
        .then((d) => { if (!ignore) { setResp(d); setError(null); } })
        .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Failed to load"); })
        .finally(() => { if (!ignore) setLoading(false); });
    }, 250);
    return () => { ignore = true; clearTimeout(handle); };
  }, [activeTab, search]);

  const tickets = useMemo(() => resp?.data ?? [], [resp]);
  const counts = resp?.counts;
  const countByStatus = (s: TicketStatus | "All") => counts?.[s] ?? 0;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700">Ticket</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 font-medium">My Tickets</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Tickets</h1>
            <p className="text-sm text-slate-500 mt-0.5">All support tickets across branches.</p>
          </div>
          <Link
            href="/crm/ticket/new"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Ticket
          </Link>
        </div>

        {/* Search + Tabs */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 px-5 pt-4 pb-3 border-b border-slate-100">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ticket #, student, submitter…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex gap-1 px-5 py-2 border-b border-slate-100 overflow-x-auto">
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {countByStatus(tab)}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-2.5 text-left font-semibold">Ticket #</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Request</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Platform</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Branch</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Created</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Age</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center">
                    <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                    <p className="text-sm text-slate-400">Loading tickets…</p>
                  </td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-red-500">Couldn&apos;t load tickets: {error}</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400">No tickets found.</td></tr>
                ) : tickets.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{t.ticketNumber}</td>
                    <td className="px-5 py-3 max-w-[240px]">
                      <p className="font-medium text-slate-800 text-xs truncate">{t.subject}</p>
                      <p className="text-[11px] text-slate-400 truncate">{t.studentName ?? t.submitterName ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-600 text-[11px]">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.accentColor ?? "#94a3b8" }} />
                        {t.platform}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {t.branchCode || t.branchName ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {t.branchCode ?? t.branchName}
                        </span>
                      ) : <span className="text-[11px] text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                    <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">{ageOf(t.createdAt)}</td>
                    <td className="px-5 py-3">
                      <button className="rounded-lg p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400">
            Showing {tickets.length}{resp && resp.total > tickets.length ? ` of ${resp.total}` : ""} tickets
          </div>
        </div>

      </div>
    </div>
  );
}
