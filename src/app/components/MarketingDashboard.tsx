"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import GreetingHeader from "@/app/components/GreetingHeader";
import {
  Compass,
  Calendar,
  Activity,
  UserPlus,
  UserMinus,
  FileText,
  Sparkles,
  Trash2,
  Plus,
  TrendingUp,
} from "lucide-react";

interface AttendanceData {
  onboarding: number;
  offboarding: number;
  mc: number;
  al: number;
}

interface EventItem {
  id: string;
  name: string;
  status: "upcoming" | "ongoing" | "completed";
}

export default function MarketingDashboard({
  userName,
  userEmail,
  taskOverview,
}: {
  userName?: string | null;
  userEmail?: string | null;
  /** Server-rendered REAL Task Manager status for this department —
   *  replaces the legacy DEMO-MODE ClickUp widget (2026-07-28). */
  taskOverview?: ReactNode;
}) {
  const greetName =
    userName?.split(" ")[0] ||
    userEmail?.split("@")[0] ||
    "marketing";

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceData>({
    onboarding: 0,
    offboarding: 0,
    mc: 0,
    al: 0,
  });
  const [events, setEvents] = useState<EventItem[]>([
    { id: "e1", name: "Q3 Campaign Plan", status: "upcoming" },
    { id: "e2", name: "TikTok Content Shoots", status: "ongoing" },
    { id: "e3", name: "Newsletter Send-Out", status: "completed" },
  ]);
  const [newEventName, setNewEventName] = useState("");
  const [newEventStatus, setNewEventStatus] = useState<"upcoming" | "ongoing" | "completed">("upcoming");
  const [braindump, setBraindump] = useState("");

  // Load backend stats
  const loadBackend = useCallback(() => {
    setLoading(true);
    fetch("/api/marketing/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          if (d.attendance) setAttendance(d.attendance);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading Marketing dashboard data:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadBackend();
  }, [loadBackend]);

  // Load local state from localStorage
  useEffect(() => {
    const savedBraindump = localStorage.getItem("marketing_braindump");
    if (savedBraindump) setBraindump(savedBraindump);

    const savedEvents = localStorage.getItem("marketing_events");
    if (savedEvents) setEvents(JSON.parse(savedEvents));
  }, []);

  // Save triggers for events
  const saveEvents = (evs: EventItem[]) => {
    setEvents(evs);
    localStorage.setItem("marketing_events", JSON.stringify(evs));
  };

  // --- Event Actions ---
  const addEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    const item: EventItem = {
      id: Date.now().toString(),
      name: newEventName.trim(),
      status: newEventStatus,
    };
    saveEvents([...events, item]);
    setNewEventName("");
  };

  const moveEvent = (id: string, nextStatus: "upcoming" | "ongoing" | "completed") => {
    saveEvents(
      events.map((ev) => (ev.id === id ? { ...ev, status: nextStatus } : ev))
    );
  };

  const deleteEvent = (id: string) => {
    saveEvents(events.filter((ev) => ev.id !== id));
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6">
        
        {/* Header */}
        <div className="mb-6 w-full space-y-2">
          <GreetingHeader name={greetName} style={{ padding: "8px 0 4px" }} />
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-slate-500">
              Hi, Marketing Department! Here is your custom executive workspace.
            </p>
            {loading && (
              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 animate-pulse font-medium">
                Syncing databases...
              </span>
            )}
          </div>
        </div>

        {/* --- MAIN GRID SECTION --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (Width 7/12) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* 1. Attendance Tracker */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Compass className="w-5 h-5 text-blue-500" />
                Attendance Tracker
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {/* Onboarding */}
                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-blue-600/80 uppercase tracking-wider">Onboarding</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.onboarding}</p>
                  </div>
                </div>

                {/* Offboarding */}
                <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white">
                    <UserMinus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-orange-600/80 uppercase tracking-wider">Offboarding</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.offboarding}</p>
                  </div>
                </div>

                {/* Annual Leave */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-600/80 uppercase tracking-wider">Annual Leave</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.al}</p>
                  </div>
                </div>

                {/* Medical Leave */}
                <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-rose-600/80 uppercase tracking-wider">Medical Leave (MC)</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.mc}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Event Tracker Kanban */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-orange-500" />
                  Event Tracker
                </h2>

                {/* Event Add Form */}
                <form onSubmit={addEvent} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="New event name..."
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={newEventStatus}
                    onChange={(e) => setNewEventStatus(e.target.value as "upcoming" | "ongoing" | "completed")}
                    className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 animate-none"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-orange-500 text-white rounded-xl p-2.5 hover:bg-orange-600 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </form>

                {/* columns */}
                <div className="grid grid-cols-3 gap-2">
                  {(["upcoming", "ongoing", "completed"] as const).map((col) => {
                    const filtered = events.filter((ev) => ev.status === col);
                    const title = col === "upcoming" ? "Upcoming" : col === "ongoing" ? "Ongoing" : "Completed";
                    const borderCol = col === "upcoming" ? "border-slate-100 bg-slate-50" : col === "ongoing" ? "border-amber-100 bg-amber-50/20" : "border-emerald-100 bg-emerald-50/20";
                    const textCol = col === "upcoming" ? "text-slate-500" : col === "ongoing" ? "text-amber-700" : "text-emerald-700";

                    return (
                      <div key={col} className={`p-2 rounded-xl border ${borderCol}`}>
                        <p className={`text-[10px] font-black uppercase tracking-wider text-center border-b pb-1 mb-2 ${textCol}`}>
                          {title}
                        </p>
                        <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                          {filtered.map((ev) => (
                            <div key={ev.id} className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm text-xs flex flex-col gap-1.5">
                              <span className="font-semibold text-slate-700 break-words leading-tight">{ev.name}</span>
                              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 mt-0.5">
                                {col !== "completed" ? (
                                  <button
                                    onClick={() => moveEvent(ev.id, col === "upcoming" ? "ongoing" : "completed")}
                                    className="text-[9px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                                  >
                                    Move ➔
                                  </button>
                                ) : (
                                  <span className="text-[9px] text-slate-400">Done</span>
                                )}
                                <button
                                  onClick={() => deleteEvent(ev.id)}
                                  className="text-slate-400 hover:text-rose-500 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (Width 5/12) */}
          <div className="lg:col-span-5 space-y-6">

            {/* 4. Braindump Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex-1 flex flex-col">
                <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-500" />
                    Braindump
                  </span>
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1 font-mono">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    Autosaved
                  </span>
                </h2>
                <textarea
                  value={braindump}
                  onChange={(e) => {
                    setBraindump(e.target.value);
                    localStorage.setItem("marketing_braindump", e.target.value);
                  }}
                  placeholder="Write down any campaign notes, ad ideas, newsletter topics or goals here..."
                  className="w-full flex-1 min-h-[160px] border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono leading-relaxed"
                />
              </div>
            </div>

          </div>

        </div>

        {/* Real department Task Manager status (server-rendered slot) —
            ALWAYS the LAST section on Home, for every account type
            (2026-07-28 placement decision). */}
        {taskOverview}
      </div>
    </div>
  );
}
