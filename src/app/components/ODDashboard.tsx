"use client";

import { useEffect, useState, useCallback } from "react";
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
  ListTodo,
  TrendingUp,
} from "lucide-react";
import GreetingHeader from "./GreetingHeader";

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

interface ClickUpTask {
  id: string;
  name: string;
  status: string;
  listName: string;
  url: string;
  completed: boolean;
}

interface EventItem {
  id: string;
  name: string;
  status: "upcoming" | "ongoing" | "completed";
}

export default function ODDashboard({
  userName,
  userEmail,
}: {
  userName?: string | null;
  userEmail?: string | null;
}) {
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

  // --- ClickUp Tasks State (ClickUp API-backed) ---
  const [clickupTasks, setClickupTasks] = useState<ClickUpTask[]>([]);
  const [clickupConfigured, setClickupConfigured] = useState(false);

  // --- Project Rollout State (localStorage) ---
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");

  // --- Braindump State (localStorage) ---
  const [braindump, setBraindump] = useState("");

  // --- Events State (localStorage) ---
  const [events, setEvents] = useState<EventItem[]>([
    { id: "e1", name: "Q3 Planning Session", status: "upcoming" },
    { id: "e2", name: "Docker Deployment Sync", status: "ongoing" },
    { id: "e3", name: "Leave Calendar Hotfix", status: "completed" },
  ]);
  const [newEventName, setNewEventName] = useState("");
  const [newEventStatus, setNewEventStatus] = useState<"upcoming" | "ongoing" | "completed">("upcoming");

  // Load backend stats
  const loadBackend = useCallback(() => {
    fetch("/api/od/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          if (d.attendance) setAttendance(d.attendance);
          if (d.tickets) setTickets(d.tickets);
          if (d.clickup) {
            setClickupConfigured(d.clickup.configured);
            setClickupTasks(d.clickup.tasks);
          }
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

    const savedEvents = localStorage.getItem("od_events");
    if (savedEvents) setEvents(JSON.parse(savedEvents));
  }, []);

  // Save triggers for localStorage widgets
  const saveTasks = (tasks: ProjectTask[]) => {
    setProjectTasks(tasks);
    localStorage.setItem("od_project_tasks", JSON.stringify(tasks));
  };

  const saveEvents = (evs: EventItem[]) => {
    setEvents(evs);
    localStorage.setItem("od_events", JSON.stringify(evs));
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

  // --- ClickUp Actions (Post to ClickUp API) ---
  const toggleClickupTask = async (taskId: string, currentCompleted: boolean) => {
    const nextCompleted = !currentCompleted;

    // Optimistic update
    setClickupTasks(
      clickupTasks.map((t) => (t.id === taskId ? { ...t, completed: nextCompleted } : t))
    );

    try {
      const res = await fetch("/api/od/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "update_clickup_task",
          taskId,
          completed: nextCompleted,
        }),
      });
      if (!res.ok) throw new Error("Failed to update task in ClickUp");
    } catch (error) {
      console.error(error);
      // Reload on failure
      loadBackend();
    }
  };

  const completedClickupTasksCount = clickupTasks.filter((t) => t.completed).length;
  const clickupPercentage = clickupTasks.length > 0 ? Math.round((completedClickupTasksCount / clickupTasks.length) * 100) : 0;

  // Circular progress properties
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clickupPercentage / 100) * circumference;

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
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-12 space-y-6">
        
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <GreetingHeader name={greetName} style={{ padding: "8px 0 4px" }} />
            <p className="text-sm text-slate-500 mt-2">
              Hi, Optimization Department! Here is your custom executive workspace.
            </p>
          </div>
          {loading && (
            <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 animate-pulse font-medium">
              Syncing databases...
            </span>
          )}
        </div>

        {/* --- MAIN GRID SECTION --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* 1. Attendance Tracker (Top Left) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
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

          {/* 2. Tickets Counter (Top Right) - DB BACKED */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-indigo-500" />
                  Tickets Counter
                </span>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-wide">
                  Database Active
                </span>
              </h2>
              
              <div className="space-y-3">
                {tickets.length === 0 ? (
                  <div className="py-6 flex items-center justify-center"><div className="h-5 w-40 bg-slate-100 rounded animate-pulse" /></div>
                ) : (
                  tickets.map((t, idx) => {
                    const percent = t.total > 0 ? Math.round((t.count / t.total) * 100) : 0;
                    return (
                      <div key={t.name} className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-700 uppercase tracking-wide">{t.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-mono">
                              {t.count}/{t.total} ({percent}%)
                            </span>
                            {/* Controls */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => adjustTicket(idx, "dec")}
                                className="w-5 h-5 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-black flex items-center justify-center text-[10px] shadow-sm"
                              >
                                -
                              </button>
                              <button
                                onClick={() => adjustTicket(idx, "inc")}
                                className="w-5 h-5 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-black flex items-center justify-center text-[10px] shadow-sm"
                              >
                                +
                              </button>
                              <span className="w-[1px] h-3 bg-slate-200 mx-0.5" />
                              <button
                                onClick={() => adjustTicket(idx, "dec", true)}
                                className="w-5 h-5 bg-white border border-slate-200 rounded hover:bg-slate-100 text-rose-500 font-black flex items-center justify-center text-[10px] shadow-sm"
                                title="Decrease Total"
                              >
                                T-
                              </button>
                              <button
                                onClick={() => adjustTicket(idx, "inc", true)}
                                className="w-5 h-5 bg-white border border-slate-200 rounded hover:bg-slate-100 text-emerald-500 font-black flex items-center justify-center text-[10px] shadow-sm"
                                title="Increase Total"
                              >
                                T+
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 3. Project Roll Out / Deadline (Middle Left) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
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

          {/* 4. ClickUp Optimization Progress (Middle Right) - CLICKUP API BACKED */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ListTodo className="w-5 h-5 text-teal-500" />
                  ClickUp (Weekly Optimisation)
                </span>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-wide">
                  API Connected
                </span>
              </h2>

              <div className="flex flex-col md:flex-row items-center gap-6 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                {/* SVG Radial Tracker */}
                <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      className="text-slate-200"
                      strokeWidth="8"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      className="text-teal-500 transition-all duration-500"
                      strokeWidth="8"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                    />
                  </svg>
                  <span className="absolute text-base font-extrabold text-slate-700">{clickupPercentage}%</span>
                </div>

                {/* Subtask Toggles */}
                <div className="flex-1 w-full space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {!clickupConfigured ? (
                    <div className="text-xs text-slate-400 text-center py-4">ClickUp integration is not configured.</div>
                  ) : clickupTasks.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-4">No weekly tasks due in ClickUp.</div>
                  ) : (
                    clickupTasks.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-start gap-2.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer select-none bg-white p-2 rounded-lg border border-slate-100 shadow-sm"
                      >
                        <input
                          type="checkbox"
                          checked={t.completed}
                          onChange={() => toggleClickupTask(t.id, t.completed)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer mt-0.5"
                        />
                        <div className="flex-1 flex flex-col min-w-0">
                          <span className={`font-medium ${t.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                            {t.name}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                            List: {t.listName}
                          </span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 5. Braindump Section (Bottom Left) */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
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

          {/* 6. Event Tracker Kanban (Bottom Right) */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
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
                  className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-0.5">
                        {filtered.map((ev) => (
                          <div key={ev.id} className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm text-xs flex flex-col gap-1.5">
                            <span className="font-semibold text-slate-700 break-words">{ev.name}</span>
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

      </div>
    </div>
  );
}
