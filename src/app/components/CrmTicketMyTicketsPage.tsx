"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  Home, ChevronRight, Search, Plus, MessageSquare, Mail,
  Phone, Camera, Eye, Pencil, Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "Urgent" | "High" | "Medium" | "Low";
type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";

interface MyTicket {
  id: string;
  subject: string;
  requester: string;
  platform: string;
  priority: Priority;
  status: TicketStatus;
  branch: string;
  created: string;
  age: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

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

const ALL_TICKETS: MyTicket[] = [
  { id: "TK-0047", subject: "Trial class booking — Desa Aman Puri",       requester: "Nur Aisyah bt Razak",     platform: "WhatsApp",  priority: "High",   status: "Open",       branch: "A", created: "26 Jun",  age: "2h" },
  { id: "TK-0046", subject: "Fee structure query for Term 3",               requester: "Ahmad Firdaus Zainudin",  platform: "Email",     priority: "Medium", status: "In Progress",branch: "A", created: "26 Jun",  age: "4h" },
  { id: "TK-0045", subject: "Request to reschedule trial — Shah Alam",      requester: "Priya Nair",              platform: "WhatsApp",  priority: "Medium", status: "Open",       branch: "B", created: "26 Jun",  age: "6h" },
  { id: "TK-0044", subject: "Complaint: classroom noise level",             requester: "Tan Wei Liang",           platform: "Email",     priority: "Urgent", status: "In Progress",branch: "C", created: "25 Jun",  age: "1d" },
  { id: "TK-0043", subject: "Inquiry about Year 2 syllabus",                requester: "Fatimah Zahra bt Ismail", platform: "Instagram", priority: "Low",    status: "Resolved",   branch: "A", created: "25 Jun",  age: "1d" },
  { id: "TK-0042", subject: "Missing trial booking confirmation",           requester: "Kelvin Lim Boon Keat",    platform: "Phone",     priority: "High",   status: "Resolved",   branch: "B", created: "24 Jun",  age: "2d" },
  { id: "TK-0041", subject: "PTPTN / financing options question",           requester: "Siti Nabilah bt Hassan",  platform: "Email",     priority: "Low",    status: "Closed",     branch: "C", created: "23 Jun",  age: "3d" },
  { id: "TK-0040", subject: "Trial follow-up — Subang Jaya branch",        requester: "Mohamad Izzat Ghani",     platform: "WhatsApp",  priority: "Medium", status: "Closed",     branch: "B", created: "23 Jun",  age: "3d" },
  { id: "TK-0039", subject: "Walk-in inquiry — no appointment",            requester: "Leong Jia Wen",           platform: "Phone",     priority: "Low",    status: "Open",       branch: "A", created: "23 Jun",  age: "3d" },
  { id: "TK-0038", subject: "Follow-up after campus visit",                requester: "Lee Jia Xin",             platform: "Phone",     priority: "Medium", status: "In Progress",branch: "B", created: "22 Jun",  age: "4d" },
  { id: "TK-0037", subject: "Sibling enrollment discount query",           requester: "Rohani bt Abdullah",      platform: "WhatsApp",  priority: "Medium", status: "Open",       branch: "C", created: "22 Jun",  age: "4d" },
  { id: "TK-0036", subject: "Placement test schedule confirmation",        requester: "Amirul Hakim Roslan",     platform: "Email",     priority: "High",   status: "Resolved",   branch: "A", created: "21 Jun",  age: "5d" },
];

const STATUS_TABS: (TicketStatus | "All")[] = ["All", "Open", "In Progress", "Resolved", "Closed"];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketMyTicketsPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TicketStatus | "All">("All");
  const [tickets, setTickets] = useState<MyTicket[]>(ALL_TICKETS);

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      const matchesTab = activeTab === "All" || t.status === activeTab;
      const q = search.toLowerCase();
      const matchesSearch = !q || t.subject.toLowerCase().includes(q) || t.requester.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [tickets, activeTab, search]);

  function deleteTicket(id: string) {
    setTickets(prev => prev.filter(t => t.id !== id));
  }

  const countByStatus = (s: TicketStatus | "All") =>
    s === "All" ? tickets.length : tickets.filter(t => t.status === s).length;

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
          <span className="text-slate-900 font-medium">My Tickets</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Tickets</h1>
            <p className="text-sm text-slate-500 mt-0.5">All support tickets assigned to you.</p>
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
                placeholder="Search tickets…"
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
                  <th className="px-5 py-2.5 text-left font-semibold">Subject</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Platform</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Branch</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Priority</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Created</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Age</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-400">No tickets found.</td>
                  </tr>
                )}
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{t.id}</td>
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
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.branch === "A" ? "bg-rose-100 text-rose-700" :
                        t.branch === "B" ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      }`}>{t.branch}</span>
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
                    <td className="px-5 py-3 text-[11px] text-slate-500 whitespace-nowrap">{t.created}</td>
                    <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">{t.age}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button className="rounded-lg p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button className="rounded-lg p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTicket(t.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400">
            Showing {filtered.length} of {tickets.length} tickets
          </div>
        </div>

      </div>
    </div>
  );
}
