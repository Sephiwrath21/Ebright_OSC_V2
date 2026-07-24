"use client";

<<<<<<< Updated upstream
import { useEffect, useState, useCallback, type ReactNode } from "react";
=======
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
>>>>>>> Stashed changes
import {
  UserPlus,
  UserMinus,
  Calendar,
  Activity,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Ticket,
  ClipboardList,
  Compass,
  FileText,
<<<<<<< Updated upstream
=======
  ListTodo,
  TrendingUp,
  ArrowLeft,
  ChevronRight,
>>>>>>> Stashed changes
} from "lucide-react";
import GreetingHeader from "./GreetingHeader";

const TICKET_COLORS: Record<string, string> = {
  LEAD: "#ed1c24",
  LEADS: "#ed1c24",
  AONE: "#4a8fd9",
  CLICKUP: "#79f471",
  PS: "#023497",
  "PROCESS STREET": "#023497",
  OTHERS: "#6b7280",
};

function getTicketColor(name: string): string {
  const upper = name.trim().toUpperCase();
  return TICKET_COLORS[upper] || "#6366f1";
}

interface AttendanceData {
  onboarding: number;
  offboarding: number;
  mc: number;
  al: number;
}

interface ProjectTask {
  id: string;
  text: string;
  deadline: string;
  completed: boolean;
}

interface TicketCategory {
  name: string;
  count: number;
  total: number;
}

interface EventItem {
  id: string;
  name: string;
  status: "upcoming" | "ongoing" | "completed";
}

export default function ODDashboard({
  userName,
  userEmail,
  taskOverview,
}: {
  userName?: string | null;
  userEmail?: string | null;
  /** Server-rendered Task Manager overview section (superadmin org grids) —
   *  rendered full-width below the main dashboard grid. */
  taskOverview?: ReactNode;
}) {
<<<<<<< Updated upstream
  const dummyTickets = [
    { name: "Aone", count: 3, total: 5 },
    { name: "PS", count: 4, total: 8 },
    { name: "Leads", count: 2, total: 6 },
    { name: "Clickup", count: 5, total: 10 },
    { name: "Others", count: 1, total: 4 },
=======
  const dummyDistribution = {
    PENDING: 343,
    COMPLETE: 651,
    "NOT APPLICABLE": 3,
    "N/A": 9,
  };

  const dummyDailyTasks = [
    { id: "86d3g0gcw", name: "1800: Update Daily Intern Logsheet", status: "PENDING", listName: "Management", url: "#" },
    { id: "86d3g0gcy", name: "1730: Meet Iqbal to show the progress", status: "PENDING", listName: "Management", url: "#" },
    { id: "86d3g0gcz", name: "AOne Task verify", status: "PENDING", listName: "AOne (SMS)", url: "#" },
    { id: "86d3g0gd0", name: "Process Street SOP update", status: "COMPLETE", listName: "PS", url: "#" },
    { id: "86d3g0gd1", name: "Daily check of CRM Leads", status: "COMPLETE", listName: "CNS (CRM)", url: "#" },
>>>>>>> Stashed changes
  ];

  const greetName =
    userName?.split(" ")[0] ||
    userEmail?.split("@")[0] ||
    "optimization";

  const [loading, setLoading] = useState(true);

  // --- Attendance State (DB-backed) ---
  const [attendance, setAttendance] = useState<AttendanceData>({
    onboarding: 0,
    offboarding: 0,
    mc: 0,
    al: 0,
  });

  // --- Tickets State (DB-backed) ---
  const [tickets, setTickets] = useState<TicketCategory[]>([]);

  // --- Project Rollout State (localStorage) ---
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");

  // --- Braindump State (localStorage) ---
  const [braindump, setBraindump] = useState("");



  // Load backend stats
  const loadBackend = useCallback(() => {
    fetch("/api/od/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          if (d.attendance) setAttendance(d.attendance);
          if (d.tickets) setTickets(d.tickets);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading OD data:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadBackend();
  }, [loadBackend]);

  // Load from localStorage (Local widgets)
  useEffect(() => {
    const savedTasks = localStorage.getItem("od_project_tasks");
    if (savedTasks) setProjectTasks(JSON.parse(savedTasks));

    const savedBraindump = localStorage.getItem("od_braindump");
    if (savedBraindump) setBraindump(savedBraindump);
  }, []);

  // Save triggers for localStorage widgets
  const saveTasks = (tasks: ProjectTask[]) => {
    setProjectTasks(tasks);
    localStorage.setItem("od_project_tasks", JSON.stringify(tasks));
  };



  // --- Project Rollout Actions ---
  const addProjectTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    const newTask: ProjectTask = {
      id: Date.now().toString(),
      text: newTaskText.trim(),
      deadline: newTaskDeadline || "No deadline",
      completed: false,
    };
    saveTasks([...projectTasks, newTask]);
    setNewTaskText("");
    setNewTaskDeadline("");
  };

  const toggleProjectTask = (id: string) => {
    saveTasks(
      projectTasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const deleteProjectTask = (id: string) => {
    saveTasks(projectTasks.filter((t) => t.id !== id));
  };

  // --- Ticket Actions (Post to DB) ---
  const adjustTicket = async (index: number, type: "inc" | "dec", isTotal = false) => {
    const updated = [...tickets];
    const item = updated[index];
    
    let nextCount = item.count;
    let nextTotal = item.total;

    if (isTotal) {
      nextTotal = Math.max(1, type === "inc" ? item.total + 1 : item.total - 1);
      nextCount = Math.min(item.count, nextTotal);
    } else {
      nextCount = type === "inc" ? Math.min(item.total, item.count + 1) : Math.max(0, item.count - 1);
    }

    // Optimistic update
    item.count = nextCount;
    item.total = nextTotal;
    setTickets(updated);

    try {
      const res = await fetch("/api/od/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "update_ticket",
          name: item.name,
          count: nextCount,
          total: nextTotal,
        }),
      });
      if (!res.ok) throw new Error("Failed to update ticket in database");
    } catch (error) {
      console.error(error);
      // Reload from DB on failure
      loadBackend();
    }
  };



  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-12 space-y-6">

        {/* Header */}
        <div className="mb-6 w-full space-y-2">
          <GreetingHeader name={greetName} style={{ padding: "0 0 4px" }} />
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-slate-500">
              Hi, Optimization Department! Here is your custom executive workspace.
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

            {/* 2. Project Roll Out / Deadline */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-emerald-500" />
                  Project Roll Out / Deadline
                </h2>
                
                {/* Task Add Form */}
                <form onSubmit={addProjectTask} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="New task..."
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="e.g. 23/7"
                    value={newTaskDeadline}
                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                    className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 text-white rounded-xl p-2.5 hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </form>

                {/* Task list */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {projectTasks.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">No tasks added yet.</p>
                  ) : (
                    projectTasks.map((t) => (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all duration-200
                          ${t.completed ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-200 shadow-sm"}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleProjectTask(t.id)}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200
                              ${t.completed ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-slate-300 hover:border-blue-500"}`}
                          >
                            {t.completed && <CheckCircle2 className="w-4 h-4" />}
                          </button>
                          <span className={`truncate font-medium ${t.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                            {t.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 font-bold rounded-lg whitespace-nowrap">
                            📅 {t.deadline}
                          </span>
                          <button
                            onClick={() => deleteProjectTask(t.id)}
                            className="text-slate-400 hover:text-rose-500 p-1 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 3. Braindump Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex-1 flex flex-col">
                <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-500" />
                    Braindump
                  </span>
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    Autosaved
                  </span>
                </h2>
                <textarea
                  value={braindump}
                  onChange={(e) => {
                    setBraindump(e.target.value);
                    localStorage.setItem("od_braindump", e.target.value);
                  }}
                  placeholder="Write down any notes, thoughts, tasks, ideas or ideas to explore here..."
                  className="w-full flex-1 min-h-[160px] border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono leading-relaxed"
                />
              </div>
            </div>

          </div>

          {/* Right Column (Width 5/12) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 4. Tickets Counter - DB BACKED */}
            <Link
              href="/crm/ticket/opportunities"
              className="group bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div>
                <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-indigo-500" />
                    Tickets Counter
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                  </span>
                  {tickets.length > 0 && (
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-wide">
                      Live
                    </span>
                  )}
                </h2>

                {loading ? (
                  // Skeleton while the real data loads — never flash demo numbers.
                  <div className="space-y-3">
                    <div className="h-3 w-40 bg-slate-100 rounded animate-pulse mb-3" />
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center">
                          <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                          <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : tickets.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No ticket data available.</p>
                ) : (
                  <>
                    {(() => {
                      const grandTotal = tickets.reduce((s, t) => s + t.total, 0);
                      const grandSolved = tickets.reduce((s, t) => s + t.count, 0);
                      const pct = grandTotal > 0 ? Math.round((grandSolved / grandTotal) * 100) : 0;
                      return (
                        <p className="text-xs text-slate-500 -mt-2 mb-3">
                          <span className="font-semibold text-slate-700">{grandSolved.toLocaleString()}</span>
                          {" of "}
                          <span className="font-semibold text-slate-700">{grandTotal.toLocaleString()}</span>
                          {" tickets solved "}
                          <span className="text-slate-400">({pct}%)</span>
                        </p>
                      );
                    })()}

                    <div className="space-y-3">
                      {tickets.map((t) => {
                        const percent = t.total > 0 ? Math.round((t.count / t.total) * 100) : 0;
                        return (
                          <div key={t.name} className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-700 uppercase tracking-wide">{t.name === "PS" ? "Process Street" : t.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-mono">
                                  {t.count}/{t.total} ({percent}%)
                                </span>
                              </div>
                            </div>
                            {/* Progress Bar */}
                            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${percent}%`, backgroundColor: getTicketColor(t.name) }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </Link>

          </div>

        </div>

        {/* Task Manager org overview (superadmin) — server-rendered slot,
            full-width below the main dashboard grid. */}
        {taskOverview}

      </div>
    </div>
  );
}
