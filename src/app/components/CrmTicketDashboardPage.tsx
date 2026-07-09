"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home, ChevronRight, Ticket, CheckCircle2, Clock,
  AlertCircle, BarChart2, MessageSquare, Phone, Mail,
  Camera, RefreshCw, Eye, TrendingDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "Urgent" | "High" | "Medium" | "Low";
type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";

// ─── Mock data ────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Total Tickets", value: "47",  icon: Ticket,        bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700" },
  { label: "Open",          value: "12",  icon: AlertCircle,   bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700" },
  { label: "In Progress",   value: "8",   icon: Clock,         bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700" },
  { label: "Resolved",      value: "21",  icon: CheckCircle2,  bg: "bg-emerald-50",border: "border-emerald-200",text: "text-emerald-700" },
  { label: "Closed",        value: "6",   icon: TrendingDown,  bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-600" },
  { label: "Avg Response",  value: "2.4h",icon: BarChart2,     bg: "bg-sky-50",    border: "border-sky-200",    text: "text-sky-700" },
];

const PRIORITY_BADGE: Record<Priority, string> = {
  Urgent: "bg-red-100 text-red-700",
  High:   "bg-orange-100 text-orange-700",
  Medium: "bg-amber-100 text-amber-700",
  Low:    "bg-slate-100 text-slate-600",
};

const STATUS_BADGE: Record<TicketStatus, string> = {
  "Open":        "bg-amber-100 text-amber-700",
  "In Progress": "bg-violet-100 text-violet-700",
  "Resolved":    "bg-emerald-100 text-emerald-700",
  "Closed":      "bg-slate-100 text-slate-500",
};

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  Email:     <Mail className="w-3.5 h-3.5" />,
  WhatsApp:  <MessageSquare className="w-3.5 h-3.5" />,
  Phone:     <Phone className="w-3.5 h-3.5" />,
  Instagram: <Camera className="w-3.5 h-3.5" />,
};

const RECENT_TICKETS: {
  id: string; subject: string; requester: string;
  platform: string; priority: Priority; status: TicketStatus; age: string;
}[] = [
  { id: "TK-0047", subject: "Trial class booking — Desa Aman Puri",       requester: "Nur Aisyah bt Razak",     platform: "WhatsApp",  priority: "High",   status: "Open",       age: "2h ago" },
  { id: "TK-0046", subject: "Fee structure query for Term 3",               requester: "Ahmad Firdaus Zainudin",  platform: "Email",     priority: "Medium", status: "In Progress",age: "4h ago" },
  { id: "TK-0045", subject: "Request to reschedule trial — Shah Alam",      requester: "Priya Nair",              platform: "WhatsApp",  priority: "Medium", status: "Open",       age: "6h ago" },
  { id: "TK-0044", subject: "Complaint: classroom noise level",             requester: "Tan Wei Liang",           platform: "Email",     priority: "Urgent", status: "In Progress",age: "1d ago" },
  { id: "TK-0043", subject: "Inquiry about Year 2 syllabus",                requester: "Fatimah Zahra bt Ismail", platform: "Instagram", priority: "Low",    status: "Resolved",   age: "1d ago" },
  { id: "TK-0042", subject: "Missing trial booking confirmation",           requester: "Kelvin Lim Boon Keat",    platform: "Phone",     priority: "High",   status: "Resolved",   age: "2d ago" },
  { id: "TK-0041", subject: "PTPTN / financing options question",           requester: "Siti Nabilah bt Hassan",  platform: "Email",     priority: "Low",    status: "Closed",     age: "3d ago" },
  { id: "TK-0040", subject: "Trial follow-up — Subang Jaya branch",        requester: "Mohamad Izzat Ghani",     platform: "WhatsApp",  priority: "Medium", status: "Closed",     age: "3d ago" },
];

const CATEGORIES = [
  { label: "Trial Booking",  count: 14, pct: 30, color: "bg-blue-500" },
  { label: "Fee Inquiry",    count: 10, pct: 21, color: "bg-amber-500" },
  { label: "Enrollment",     count: 9,  pct: 19, color: "bg-emerald-500" },
  { label: "Complaint",      count: 6,  pct: 13, color: "bg-red-400" },
  { label: "Schedule Change",count: 5,  pct: 11, color: "bg-violet-500" },
  { label: "General",        count: 3,  pct: 6,  color: "bg-slate-400" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketDashboardPage() {
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 700);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">

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
          <span className="text-slate-900 font-medium">Dashboard</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ticket Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Overview of all support tickets across branches.</p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {STATS.map(({ label, value, icon: Icon, bg, border, text }) => (
            <div key={label} className={`rounded-2xl border ${border} ${bg} px-4 py-3 flex flex-col gap-1`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${text}`}>{label}</span>
                <Icon className={`w-4 h-4 ${text}`} />
              </div>
              <span className={`text-2xl font-bold ${text}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Recent tickets */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Recent Tickets</h2>
              <Link href="/crm/ticket/my-tickets" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                View all <Eye className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-2.5 text-left font-semibold">ID</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Subject</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Platform</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Priority</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {RECENT_TICKETS.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{t.id}</td>
                      <td className="px-5 py-3 max-w-[240px]">
                        <p className="font-medium text-slate-800 text-xs truncate">{t.subject}</p>
                        <p className="text-[11px] text-slate-400 truncate">{t.requester}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 text-slate-600 text-[11px]">
                          {PLATFORM_ICON[t.platform] ?? null}
                          {t.platform}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_BADGE[t.priority]}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[t.status]}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">{t.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Tickets by Category</h2>
            <div className="space-y-3">
              {CATEGORIES.map(cat => (
                <div key={cat.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-700">{cat.label}</span>
                    <span className="text-xs font-semibold text-slate-600">{cat.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${cat.color} transition-all`} style={{ width: `${cat.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Platform summary */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">By Platform</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "WhatsApp",  count: 19, icon: <MessageSquare className="w-4 h-4" />, color: "text-emerald-600" },
                  { name: "Email",     count: 14, icon: <Mail className="w-4 h-4" />,          color: "text-blue-600" },
                  { name: "Phone",     count: 8,  icon: <Phone className="w-4 h-4" />,         color: "text-violet-600" },
                  { name: "Instagram", count: 6,  icon: <Camera className="w-4 h-4" />,        color: "text-pink-500" },
                ].map(p => (
                  <div key={p.name} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span className={p.color}>{p.icon}</span>
                    <div>
                      <p className="text-[10px] text-slate-500">{p.name}</p>
                      <p className="text-sm font-bold text-slate-800">{p.count}</p>
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
