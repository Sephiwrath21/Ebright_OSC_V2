"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Home, ChevronRight, Search, Plus, MoreHorizontal,
  ArrowDownWideNarrow, ArrowUpWideNarrow, Settings2, X,
  MessageCircle, Calendar,
} from "lucide-react";

// ─── Types (mirror /api/crm/opportunities) ────────────────────────────────────

interface Card {
  id: string;
  contactId: string;
  name: string;
  category: "Junior" | "Mid" | "Senior" | null;
  source: string | null;
  value: number;
  hoursInStage: number;
  tags: string[];
  trialDate: string | null;
  trialTime: string | null;
}
interface Column {
  id: string;
  name: string;
  shortCode: string | null;
  color: string;
  count: number;
  totalValue: number;
  cards: Card[];
}
interface KanbanResponse {
  stages: Column[];
  total: number;
  branches: Array<{ id: string; name: string }>;
}

// ─── Lookup maps ──────────────────────────────────────────────────────────────

const CAT_CLS: Record<string, string> = {
  Junior: "bg-blue-100 text-blue-700",
  Mid:    "bg-amber-100 text-amber-700",
  Senior: "bg-purple-100 text-purple-700",
};

const DOT_CLS: Record<string, string> = {
  blue: "bg-blue-500", indigo: "bg-indigo-500", violet: "bg-violet-500",
  emerald: "bg-emerald-500", green: "bg-green-600", amber: "bg-amber-500",
  yellow: "bg-yellow-500", cyan: "bg-cyan-500", red: "bg-red-500",
  slate: "bg-slate-400", purple: "bg-purple-500",
};
function dotClass(color: string) { return DOT_CLS[color] ?? "bg-slate-400"; }

// Source chip: known sources get a branded chip, others a neutral pill.
const SRC_CHIP: Record<string, { label: string; cls: string }> = {
  tiktok:   { label: "tt",   cls: "bg-slate-900 text-white" },
  meta:     { label: "fb",   cls: "bg-blue-600 text-white" },
  facebook: { label: "fb",   cls: "bg-blue-600 text-white" },
  referral: { label: "ref",  cls: "bg-emerald-100 text-emerald-700" },
  "walk-in":{ label: "walk", cls: "bg-slate-100 text-slate-600" },
  whatsapp: { label: "wa",   cls: "bg-green-500 text-white" },
  website:  { label: "web",  cls: "bg-indigo-100 text-indigo-700" },
  wix:      { label: "wix",  cls: "bg-indigo-100 text-indigo-700" },
};
function srcChip(source: string | null): { label: string; cls: string } {
  if (!source) return { label: "—", cls: "bg-slate-100 text-slate-500" };
  const key = source.toLowerCase();
  return SRC_CHIP[key] ?? { label: source.slice(0, 6).toLowerCase(), cls: "bg-slate-100 text-slate-600" };
}

function ageBorder(h: number) {
  if (h < 24) return "border-l-green-400";
  if (h < 48) return "border-l-amber-400";
  return "border-l-red-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KanbanCard({ card }: { card: Card }) {
  const src = srcChip(card.source);
  return (
    <Link
      href={`/crm/contacts/${card.contactId}`}
      className={`block bg-white border border-slate-200 border-l-4 ${ageBorder(card.hoursInStage)} rounded-xl p-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-slate-900 leading-snug">{card.name}</span>
        {card.category && (
          <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${CAT_CLS[card.category]}`}>{card.category}</span>
        )}
      </div>

      {card.trialDate && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
            <Calendar className="w-3 h-3" />
            {card.trialDate}{card.trialTime ? ` @ ${card.trialTime}` : ""}
          </span>
        </div>
      )}

      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.tags.slice(0, 3).map(t => (
            <span key={t} className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium leading-none ${src.cls}`}>{src.label}</span>
          {card.value > 0 && <span className="text-xs text-slate-500">MYR {card.value.toLocaleString()}</span>}
        </div>
        <span className="text-xs text-slate-400">
          {card.hoursInStage < 24 ? `${card.hoursInStage}h ago` : `${Math.floor(card.hoursInStage / 24)}d ago`}
        </span>
      </div>
    </Link>
  );
}

function KanbanColumn({ stage, filterCards }: { stage: Column; filterCards: (c: Card[]) => Card[] }) {
  const [asc, setAsc] = useState(false);
  const shown = useMemo(() => {
    const f = filterCards(stage.cards);
    return [...f].sort((a, b) => (asc ? a.hoursInStage - b.hoursInStage : b.hoursInStage - a.hoursInStage));
  }, [stage.cards, filterCards, asc]);
  const extra = stage.count - stage.cards.length;

  return (
    <div className="flex flex-col w-[17rem] shrink-0">
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 mb-1.5 flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass(stage.color)}`} />
        <span className="text-sm font-medium text-slate-800 truncate flex-1" title={stage.name}>{stage.name}</span>
        <span className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-medium shrink-0">{stage.count.toLocaleString()}</span>
        <button onClick={() => setAsc(!asc)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Toggle sort">
          {asc ? <ArrowUpWideNarrow className="w-3.5 h-3.5" /> : <ArrowDownWideNarrow className="w-3.5 h-3.5" />}
        </button>
      </div>

      {stage.totalValue > 0 && (
        <p className="text-xs text-slate-400 px-1 mb-1.5">MYR {stage.totalValue.toLocaleString()} total</p>
      )}

      <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 272px)" }}>
        {shown.map(c => <KanbanCard key={c.id} card={c} />)}
        {extra > 0 && (
          <p className="text-center text-[11px] text-slate-400 py-2">+{extra.toLocaleString()} more not shown</p>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SEL = "h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function OpportunitiesBoard() {
  const [scope,  setScope]  = useState("all");   // 'all' | branchId
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [age,    setAge]    = useState("");

  const [data, setData]       = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const onSearch = (v: string) => {
    setSearch(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedSearch(v.trim()), 350);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/crm/opportunities?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      setData((await res.json()) as KanbanResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load opportunities");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scope, debouncedSearch]);

  useEffect(() => { void load(); }, [load]);

  const branches = data?.branches ?? [];
  const stages = data?.stages ?? [];
  const total = data?.total ?? 0;

  // Client-side source / age filters applied to the (capped) visible cards.
  const filterCards = useCallback((cards: Card[]) => cards.filter((c) => {
    if (source && (c.source ?? "").toLowerCase() !== source) return false;
    if (age && c.category?.toLowerCase() !== age) return false;
    return true;
  }), [source, age]);

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <div className="px-6 pt-4 pb-3 shrink-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors rounded">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-700">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Opportunities</span>
        </nav>

        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Opportunities</h1>
            <p className="text-sm text-slate-500 mt-0.5">{loading ? "Loading…" : `${total.toLocaleString()} opportunities`}</p>
          </div>
          <div className="flex items-center gap-2">
            <button disabled title="Read-only view" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
              <MessageCircle className="w-4 h-4" /> WhatsApp Leads
            </button>
            <button disabled title="Read-only view" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-300 px-3 py-2 text-sm font-medium text-white cursor-not-allowed">
              <Plus className="w-4 h-4" /> New Opportunity
            </button>
            <button disabled title="Read-only view" className="p-2 rounded-lg border border-slate-200 bg-white cursor-not-allowed">
              <MoreHorizontal className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={scope} onChange={e => setScope(e.target.value)} className={SEL}>
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <div className="relative w-48 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search contacts…"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => onSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select value={source} onChange={e => setSource(e.target.value)} className={SEL}>
            <option value="">All platforms</option>
            <option value="tiktok">TikTok</option>
            <option value="meta">Meta</option>
            <option value="others">Others</option>
            <option value="website">Website</option>
            <option value="wix">Wix</option>
            <option value="whatsapp">WhatsApp</option>
          </select>

          <select value={age} onChange={e => setAge(e.target.value)} className={SEL}>
            <option value="">All ages</option>
            <option value="junior">Junior (7–9)</option>
            <option value="mid">Mid (10–12)</option>
            <option value="senior">Senior (13–16)</option>
          </select>

          <div className="ml-auto">
            <button disabled title="Read-only view" className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-400 cursor-not-allowed">
              <Settings2 className="w-4 h-4" /> Manage Fields
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-6 mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load opportunities: {error}
          <button type="button" onClick={() => void load()} className="ml-3 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100">Retry</button>
        </div>
      ) : (
        <div className="overflow-x-auto px-6 pb-6">
          <div className="flex gap-3 pt-2" style={{ minWidth: "max-content" }}>
            {loading && stages.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-[17rem] shrink-0">
                    <div className="h-12 animate-pulse rounded-xl bg-white mb-1.5" />
                    <div className="h-40 animate-pulse rounded-xl bg-white/60" />
                  </div>
                ))
              : stages.map(s => <KanbanColumn key={s.id} stage={s} filterCards={filterCards} />)}
          </div>
        </div>
      )}
    </div>
  );
}
