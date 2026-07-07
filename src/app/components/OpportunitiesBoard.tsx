"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home, ChevronRight, Search, Plus, MoreHorizontal,
  ArrowDownWideNarrow, ArrowUpWideNarrow, Settings2, X,
  MessageCircle, Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = "Junior" | "Mid" | "Senior";
type Source   = "TikTok" | "Meta" | "Referral" | "Walk-in" | "WhatsApp" | "Website";

interface Card {
  id: string;
  childName: string;
  category: Category;
  source: Source;
  value: number;
  hoursInStage: number;
  tags: string[];
  trialDate?: string;
  trialTime?: string;
}

interface Stage {
  id: string;
  code: string;
  name: string;
  dot: string;
  cards: Card[];
}

// ─── Lookup maps ──────────────────────────────────────────────────────────────

const CAT_CLS: Record<Category, string> = {
  Junior: "bg-blue-100 text-blue-700",
  Mid:    "bg-amber-100 text-amber-700",
  Senior: "bg-purple-100 text-purple-700",
};

const SRC_CHIP: Record<Source, { label: string; cls: string }> = {
  TikTok:   { label: "tt",   cls: "bg-slate-900 text-white" },
  Meta:     { label: "fb",   cls: "bg-blue-600 text-white" },
  Referral: { label: "ref",  cls: "bg-emerald-100 text-emerald-700" },
  "Walk-in":{ label: "walk", cls: "bg-slate-100 text-slate-600" },
  WhatsApp: { label: "wa",   cls: "bg-green-500 text-white" },
  Website:  { label: "web",  cls: "bg-indigo-100 text-indigo-700" },
};

function ageBorder(h: number) {
  if (h < 24) return "border-l-green-400";
  if (h < 48) return "border-l-amber-400";
  return "border-l-red-400";
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const STAGES: Stage[] = [
  {
    id: "nl", code: "NL", name: "New Lead", dot: "bg-blue-500",
    cards: [
      { id: "nl1", childName: "Adam Bin Nik",  category: "Junior", source: "TikTok",   value: 0, hoursInStage: 2,  tags: [] },
      { id: "nl2", childName: "Sara Lim",       category: "Mid",    source: "Meta",     value: 0, hoursInStage: 18, tags: ["ADHD"] },
      { id: "nl3", childName: "Darren Tan",     category: "Senior", source: "Referral", value: 0, hoursInStage: 52, tags: [] },
      { id: "nl4", childName: "Nurul Ain",      category: "Junior", source: "WhatsApp", value: 0, hoursInStage: 5,  tags: [] },
    ],
  },
  {
    id: "fu1", code: "FU1", name: "Follow-Up 1", dot: "bg-indigo-500",
    cards: [
      { id: "fu11", childName: "Rania Alya",    category: "Mid",    source: "TikTok",  value: 0, hoursInStage: 30, tags: [] },
      { id: "fu12", childName: "Jason Wong",    category: "Senior", source: "Meta",    value: 0, hoursInStage: 72, tags: ["VIP"] },
      { id: "fu13", childName: "Aishah Nabila", category: "Junior", source: "Walk-in", value: 0, hoursInStage: 10, tags: [] },
    ],
  },
  {
    id: "fu2", code: "FU2", name: "Follow-Up 2", dot: "bg-violet-500",
    cards: [
      { id: "fu21", childName: "Ethan Loh",     category: "Mid",    source: "Website", value: 0, hoursInStage: 48, tags: [] },
      { id: "fu22", childName: "Mirabel Chong", category: "Junior", source: "TikTok",  value: 0, hoursInStage: 90, tags: [] },
      { id: "fu23", childName: "Iqbal Hakim",   category: "Senior", source: "Meta",    value: 0, hoursInStage: 20, tags: [] },
    ],
  },
  {
    id: "ct", code: "CT", name: "Confirmed Trial", dot: "bg-emerald-500",
    cards: [
      { id: "ct1", childName: "Priya Nair",    category: "Junior", source: "Referral", value: 480,  hoursInStage: 6,  tags: [],      trialDate: "Sat 28 Jun", trialTime: "10:00 AM" },
      { id: "ct2", childName: "Luqman Hariz",  category: "Mid",    source: "TikTok",   value: 480,  hoursInStage: 22, tags: [],      trialDate: "Sun 29 Jun", trialTime: "11:00 AM" },
      { id: "ct3", childName: "Chloe Ng",      category: "Senior", source: "Meta",     value: 480,  hoursInStage: 48, tags: ["VIP"], trialDate: "Mon 30 Jun", trialTime: "2:00 PM"  },
    ],
  },
  {
    id: "enr", code: "ENR", name: "Enrolled", dot: "bg-green-600",
    cards: [
      { id: "enr1", childName: "Aryan Kumar",  category: "Mid",    source: "Referral", value: 2880, hoursInStage: 100, tags: [] },
      { id: "enr2", childName: "Fatin Husna",  category: "Junior", source: "WhatsApp", value: 1440, hoursInStage: 55,  tags: [] },
    ],
  },
  {
    id: "rsd", code: "RSD", name: "Rescheduled", dot: "bg-amber-500",
    cards: [
      { id: "rsd1", childName: "Marcus Tee",   category: "Junior", source: "TikTok", value: 0, hoursInStage: 24, tags: [] },
      { id: "rsd2", childName: "Zara Aqilah",  category: "Mid",    source: "Meta",   value: 0, hoursInStage: 60, tags: [] },
    ],
  },
  {
    id: "cl", code: "CL", name: "Cold Lead", dot: "bg-slate-400",
    cards: [
      { id: "cl1", childName: "Bryan Foo",     category: "Senior", source: "Walk-in", value: 0, hoursInStage: 200, tags: [] },
      { id: "cl2", childName: "Humaira Zain",  category: "Junior", source: "TikTok",  value: 0, hoursInStage: 180, tags: [] },
    ],
  },
];

const PIPELINES = [
  "All Branches",
  "00 Ebright (OD)", "01 Online", "02 Subang Taipan", "03 Setia Alam",
  "04 Sri Petaling", "05 Kota Damansara",
];

const TOTAL = STAGES.reduce((s, st) => s + st.cards.length, 0);

// ─── Sub-components ───────────────────────────────────────────────────────────

function KanbanCard({ card }: { card: Card }) {
  const src = SRC_CHIP[card.source];
  return (
    <div
      className={`bg-white border border-slate-200 border-l-4 ${ageBorder(card.hoursInStage)} rounded-xl p-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150`}
    >
      {/* Name + category */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-slate-900 leading-snug">{card.childName}</span>
        <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${CAT_CLS[card.category]}`}>
          {card.category}
        </span>
      </div>

      {/* Trial pill */}
      {card.trialDate && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
            <Calendar className="w-3 h-3" />
            {card.trialDate} @ {card.trialTime}
          </span>
        </div>
      )}

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.tags.map(t => (
            <span key={t} className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">{t}</span>
          ))}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium leading-none ${src.cls}`}>
            {src.label}
          </span>
          {card.value > 0 && (
            <span className="text-xs text-slate-500">MYR {card.value.toLocaleString()}</span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {card.hoursInStage < 24
            ? `${card.hoursInStage}h ago`
            : `${Math.floor(card.hoursInStage / 24)}d ago`}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({ stage }: { stage: Stage }) {
  const [asc, setAsc] = useState(false);
  const totalValue = stage.cards.reduce((s, c) => s + c.value, 0);

  return (
    <div className="flex flex-col w-[17rem] shrink-0">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 mb-1.5 flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${stage.dot}`} />
        <span className="text-sm font-medium text-slate-800 truncate flex-1" title={stage.name}>
          {stage.name}
        </span>
        <span className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-medium shrink-0">
          {stage.cards.length}
        </span>
        <button
          onClick={() => setAsc(!asc)}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Toggle sort"
        >
          {asc
            ? <ArrowUpWideNarrow className="w-3.5 h-3.5" />
            : <ArrowDownWideNarrow className="w-3.5 h-3.5" />}
        </button>
        <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Value summary */}
      {totalValue > 0 && (
        <p className="text-xs text-slate-400 px-1 mb-1.5">
          MYR {totalValue.toLocaleString()} total
        </p>
      )}

      {/* Cards */}
      <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 272px)" }}>
        {stage.cards.map(c => <KanbanCard key={c.id} card={c} />)}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SEL = "h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function OpportunitiesBoard() {
  const [pipeline, setPipeline] = useState("All Branches");
  const [search,   setSearch]   = useState("");
  const [week,     setWeek]     = useState("this_week");
  const [source,   setSource]   = useState("");
  const [age,      setAge]      = useState("");

  return (
    <div className="flex flex-col min-h-full bg-slate-50">

      {/* ── Top section ────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-3 shrink-0">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors rounded">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-700">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Opportunities</span>
        </nav>

        {/* Title + actions */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Opportunities</h1>
            <p className="text-sm text-slate-500 mt-0.5">{TOTAL} opportunities</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <MessageCircle className="w-4 h-4" />
              WhatsApp Leads
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" />
              New Opportunity
            </button>
            <button className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors">
              <MoreHorizontal className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Pipeline */}
          <select value={pipeline} onChange={e => setPipeline(e.target.value)} className={SEL}>
            {PIPELINES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Search */}
          <div className="relative w-48 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Week */}
          <select value={week} onChange={e => setWeek(e.target.value)} className={SEL}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This week</option>
            <option value="next_week">Next week</option>
            <option value="last_week">Last week</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All</option>
          </select>

          {/* Platform */}
          <select value={source} onChange={e => setSource(e.target.value)} className={SEL}>
            <option value="">All platforms</option>
            <option value="tiktok">TikTok</option>
            <option value="meta">Meta</option>
            <option value="referral">Referral</option>
            <option value="walk-in">Walk-in</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="website">Website</option>
          </select>

          {/* Age class */}
          <select value={age} onChange={e => setAge(e.target.value)} className={SEL}>
            <option value="">All ages</option>
            <option value="junior">Junior (7–9)</option>
            <option value="mid">Mid (10–12)</option>
            <option value="senior">Senior (13–16)</option>
          </select>

          <div className="ml-auto">
            <button className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <Settings2 className="w-4 h-4" />
              Manage Fields
            </button>
          </div>
        </div>
      </div>

      {/* ── Kanban board ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto px-6 pb-6">
        <div className="flex gap-3 pt-2" style={{ minWidth: "max-content" }}>
          {STAGES.map(s => <KanbanColumn key={s.id} stage={s} />)}
        </div>
      </div>
    </div>
  );
}
