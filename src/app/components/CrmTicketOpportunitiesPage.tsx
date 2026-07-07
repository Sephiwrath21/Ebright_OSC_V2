"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home, ChevronRight, MessageSquare, Mail, Phone,
  Camera, Plus, User,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "New Inquiry" | "Contacted" | "Trial Booked" | "Enrolled" | "Closed/Lost";

interface OpportunityCard {
  id: string;
  subject: string;
  requester: string;
  platform: string;
  branch: string;
  stage: Stage;
  age: string;
  value?: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const STAGES: Stage[] = ["New Inquiry", "Contacted", "Trial Booked", "Enrolled", "Closed/Lost"];

const STAGE_STYLE: Record<Stage, { header: string; dot: string; count: string }> = {
  "New Inquiry":  { header: "bg-slate-100 text-slate-700",  dot: "bg-slate-400",   count: "bg-slate-200 text-slate-700" },
  "Contacted":    { header: "bg-blue-50 text-blue-700",     dot: "bg-blue-500",    count: "bg-blue-100 text-blue-700" },
  "Trial Booked": { header: "bg-violet-50 text-violet-700", dot: "bg-violet-500",  count: "bg-violet-100 text-violet-700" },
  "Enrolled":     { header: "bg-emerald-50 text-emerald-700",dot:"bg-emerald-500", count: "bg-emerald-100 text-emerald-700" },
  "Closed/Lost":  { header: "bg-red-50 text-red-700",       dot: "bg-red-400",     count: "bg-red-100 text-red-700" },
};

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  WhatsApp:  <MessageSquare className="w-3 h-3" />,
  Email:     <Mail className="w-3 h-3" />,
  Phone:     <Phone className="w-3 h-3" />,
  Instagram: <Camera className="w-3 h-3" />,
};

const BRANCH_BADGE: Record<string, string> = {
  "A": "bg-rose-100 text-rose-700",
  "B": "bg-amber-100 text-amber-700",
  "C": "bg-emerald-100 text-emerald-700",
};

const INITIAL_CARDS: OpportunityCard[] = [
  { id: "TK-0047", subject: "Trial class booking — Desa Aman Puri",    requester: "Nur Aisyah bt Razak",     platform: "WhatsApp",  branch: "A", stage: "New Inquiry",  age: "2h ago" },
  { id: "TK-0051", subject: "Year 1 enrollment inquiry",               requester: "Hairul Nizam Bakar",      platform: "Instagram", branch: "B", stage: "New Inquiry",  age: "3h ago" },
  { id: "TK-0053", subject: "Wants to start next month",               requester: "Chua Mei Lin",            platform: "Email",     branch: "C", stage: "New Inquiry",  age: "5h ago" },
  { id: "TK-0046", subject: "Fee structure query for Term 3",          requester: "Ahmad Firdaus Zainudin",  platform: "Email",     branch: "A", stage: "Contacted",    age: "4h ago" },
  { id: "TK-0049", subject: "Sibling enrollment — 2 children",        requester: "Rohani bt Abdullah",      platform: "WhatsApp",  branch: "B", stage: "Contacted",    age: "1d ago" },
  { id: "TK-0045", subject: "Request to reschedule trial — Shah Alam", requester: "Priya Nair",             platform: "WhatsApp",  branch: "A", stage: "Trial Booked", age: "6h ago" },
  { id: "TK-0043", subject: "Inquiry about Year 2 syllabus",          requester: "Fatimah Zahra bt Ismail", platform: "Instagram", branch: "C", stage: "Trial Booked", age: "1d ago" },
  { id: "TK-0038", subject: "Follow-up after campus visit",           requester: "Lee Jia Xin",             platform: "Phone",     branch: "B", stage: "Trial Booked", age: "2d ago" },
  { id: "TK-0036", subject: "Placement test result — ready to enroll",requester: "Amirul Hakim Roslan",     platform: "WhatsApp",  branch: "A", stage: "Enrolled",     age: "3d ago", value: "RM 480" },
  { id: "TK-0033", subject: "Confirmed enrollment — term 2 intake",   requester: "Nurul Hidayah Md Zain",   platform: "Email",     branch: "C", stage: "Enrolled",     age: "4d ago", value: "RM 480" },
  { id: "TK-0031", subject: "Family relocated — cannot proceed",      requester: "Raj Subramaniam",         platform: "Phone",     branch: "B", stage: "Closed/Lost",  age: "5d ago" },
  { id: "TK-0028", subject: "Price too high — declined to proceed",   requester: "Wong Kai Sheng",          platform: "WhatsApp",  branch: "A", stage: "Closed/Lost",  age: "1w ago" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketOpportunitiesPage() {
  const [cards, setCards] = useState<OpportunityCard[]>(INITIAL_CARDS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  function onDragStart(id: string) { setDraggingId(id); }
  function onDragOver(e: React.DragEvent, stage: Stage) { e.preventDefault(); setOverStage(stage); }
  function onDrop(stage: Stage) {
    if (!draggingId) return;
    setCards(prev => prev.map(c => c.id === draggingId ? { ...c, stage } : c));
    setDraggingId(null);
    setOverStage(null);
  }

  const byStage = (s: Stage) => cards.filter(c => c.stage === s);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-[1400px] mx-auto px-6 pt-4 pb-10">

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
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ticket Opportunities</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track inquiry tickets through the enrollment pipeline. Drag cards to update stage.</p>
          </div>
          <Link
            href="/crm/ticket/new"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Ticket
          </Link>
        </div>

        {/* Kanban board */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageCards = byStage(stage);
            const style = STAGE_STYLE[stage];
            const isOver = overStage === stage;

            return (
              <div
                key={stage}
                className="flex flex-col shrink-0 w-64"
                onDragOver={e => onDragOver(e, stage)}
                onDrop={() => onDrop(stage)}
              >
                {/* Column header */}
                <div className={`flex items-center justify-between rounded-xl px-3 py-2 mb-2 ${style.header}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className="text-xs font-semibold">{stage}</span>
                  </div>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${style.count}`}>
                    {stageCards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className={`flex flex-col gap-2 min-h-[120px] rounded-xl p-1.5 transition-colors ${isOver ? "bg-blue-50 ring-2 ring-blue-200" : ""}`}>
                  {stageCards.map(card => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => onDragStart(card.id)}
                      onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                      className={`bg-white rounded-xl border border-slate-200 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggingId === card.id ? "opacity-40" : ""}`}
                    >
                      <p className="text-xs font-semibold text-slate-800 leading-snug mb-1">{card.subject}</p>
                      <div className="flex items-center gap-1.5 mb-2">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] text-slate-500 truncate">{card.requester}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {PLATFORM_ICON[card.platform]} {card.platform}
                          </span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${BRANCH_BADGE[card.branch] ?? "bg-slate-100 text-slate-600"}`}>
                            {card.branch}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">{card.age}</span>
                      </div>
                      {card.value && (
                        <div className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 text-center">
                          {card.value}
                        </div>
                      )}
                    </div>
                  ))}

                  {stageCards.length === 0 && (
                    <div className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed border-slate-200">
                      <span className="text-[11px] text-slate-400">Drop here</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
