"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home, ChevronRight, User,
} from "lucide-react";

// ─── Day filter ───────────────────────────────────────────────────────────────

type RangeKey = "all" | "today" | "yesterday" | "last7" | "month" | "custom";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7",     label: "Last 7 Days" },
  { key: "month",     label: "This Month" },
  { key: "custom",    label: "Custom" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketCard {
  id: string;
  ticketNumber: string;
  subject: string;
  studentName: string | null;
  submitterName: string | null;
  platform: string;
  accentColor: string | null;
  branchCode: string | null;
  branchName: string | null;
  createdAt: string;
}
interface KanbanColumn { key: string; label: string; count: number; cards: TicketCard[] }
interface KanbanResponse { columns: KanbanColumn[]; total: number }

// Column styling keyed by real ticket status.
const STATUS_STYLE: Record<string, { header: string; dot: string; count: string }> = {
  received:    { header: "bg-slate-100 text-slate-700",   dot: "bg-slate-400",   count: "bg-slate-200 text-slate-700" },
  in_progress: { header: "bg-blue-50 text-blue-700",      dot: "bg-blue-500",    count: "bg-blue-100 text-blue-700" },
  approved:    { header: "bg-violet-50 text-violet-700",  dot: "bg-violet-500",  count: "bg-violet-100 text-violet-700" },
  complete:    { header: "bg-emerald-50 text-emerald-700",dot: "bg-emerald-500", count: "bg-emerald-100 text-emerald-700" },
  rejected:    { header: "bg-red-50 text-red-700",        dot: "bg-red-400",     count: "bg-red-100 text-red-700" },
};
const FALLBACK_STYLE = { header: "bg-slate-100 text-slate-700", dot: "bg-slate-400", count: "bg-slate-200 text-slate-700" };

function ageOf(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "<1h ago";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketOpportunitiesPage() {
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    // For a custom range, wait until both ends are chosen before querying.
    if (range === "custom" && (!customFrom || !customTo)) return;

    let ignore = false;
    setLoading(true);
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    fetch(`/api/crm/tickets/kanban?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<KanbanResponse>;
      })
      .then((d) => { if (!ignore) { setData(d); setError(null); } })
      .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [range, customFrom, customTo]);

  const columns = data?.columns ?? [];

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
          <span className="text-slate-900 font-medium">Opportunities</span>
        </nav>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ticket Opportunities</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Tickets grouped by status{data ? ` · ${data.total.toLocaleString()} total` : ""}.
            </p>
          </div>

          {/* Day filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              {RANGE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setRange(o.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    range === o.key
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {range === "custom" && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="From date"
                />
                <span className="text-xs text-slate-400">→</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="To date"
                />
              </div>
            )}
          </div>
        </div>

        {range === "custom" && (!customFrom || !customTo) ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-16 text-center shadow-sm">
            <p className="text-sm text-slate-400">Pick a start and end date to view tickets in that range.</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            Couldn&apos;t load tickets: {error}
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm">
            <div className="mx-auto mb-2 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <p className="text-sm text-slate-400">Loading board…</p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map(col => {
              const style = STATUS_STYLE[col.key] ?? FALLBACK_STYLE;
              return (
                <div key={col.key} className="flex flex-col shrink-0 w-64">
                  {/* Column header */}
                  <div className={`flex items-center justify-between rounded-xl px-3 py-2 mb-2 ${style.header}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span className="text-xs font-semibold">{col.label}</span>
                    </div>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${style.count}`}>
                      {col.count.toLocaleString()}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2 min-h-[120px] rounded-xl p-1.5">
                    {col.cards.map(card => (
                      <div
                        key={card.id}
                        className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all"
                      >
                        <p className="text-xs font-semibold text-slate-800 leading-snug mb-0.5">{card.subject}</p>
                        <p className="text-[10px] text-slate-400 font-mono mb-1.5">{card.ticketNumber}</p>
                        <div className="flex items-center gap-1.5 mb-2">
                          <User className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] text-slate-500 truncate">{card.studentName ?? card.submitterName ?? "—"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: card.accentColor ?? "#94a3b8" }} />
                              {card.platform}
                            </span>
                            {(card.branchCode || card.branchName) && (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {card.branchCode ?? card.branchName}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">{ageOf(card.createdAt)}</span>
                        </div>
                      </div>
                    ))}

                    {col.cards.length === 0 && (
                      <div className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed border-slate-200">
                        <span className="text-[11px] text-slate-400">No tickets</span>
                      </div>
                    )}

                    {col.count > col.cards.length && (
                      <div className="text-center text-[10px] text-slate-400 py-1">
                        + {(col.count - col.cards.length).toLocaleString()} more
                      </div>
                    )}
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
