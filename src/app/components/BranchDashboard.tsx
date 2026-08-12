"use client";

import { useEffect, useState, useCallback } from "react";
import GreetingHeader from "./GreetingHeader";
import { Compass, UserCheck, UserX, Activity, Calendar, Megaphone, Bell, Trash2, Plus } from "lucide-react";

interface BranchDashboardProps {
  userName?: string | null;
  userEmail?: string | null;
  branchName?: string | null;
}

interface EventItem {
  id: string;
  name: string;
  status: "upcoming" | "ongoing" | "completed";
}

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "0.5px solid var(--status-track)",
  borderRadius: 12,
  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
};

const DEFAULT_TASKS = [
  { id: "t1", title: "Submit weekly enrolment report", done: false },
  { id: "t2", title: "Follow up 3 CRM opportunities", done: false },
  { id: "t3", title: "Approve staff MC application", done: true },
  { id: "t4", title: "Confirm townhall headcount", done: false },
];

const DEFAULT_EVENTS = [
  { date: "16 Jul", title: "Townhall session", tone: "#185FA5" },
  { date: "20 Jul", title: "BPR meeting", tone: "#3C3489" },
  { date: "24 Jul", title: "Scrum Review", tone: "#0F6E56" },
];

const DEFAULT_ANNOUNCEMENTS = [
  "Q3 enrolment push — target review on Friday.",
  "New onboarding SOP published in ClickUp.",
];

function formatRM(n: number): string {
  return "RM " + n.toLocaleString("en-MY");
}

// ── Reusable section shell ───────────────────────────────────────────────────
function Panel({
  title,
  icon,
  children,
  style,
  bodyStyle,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}) {
  return (
    <section style={{ ...card, display: "flex", flexDirection: "column", ...style }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "0.5px solid var(--border-subtle)",
        }}
      >
        {icon && <span style={{ color: "var(--text-muted-strong)", display: "inline-flex" }}>{icon}</span>}
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {title}
        </h2>
      </header>
      <div style={{ padding: 14, flex: 1, ...bodyStyle }}>{children}</div>
    </section>
  );
}

// ── 1. CRM / SMS metrics ─────────────────────────────────────────────────────
function MetricRow({
  rowLabel,
  metrics,
}: {
  rowLabel: string;
  metrics: { key: string; value: number }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "64px repeat(4, 1fr)",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-sunken)",
          border: "0.5px solid var(--border-subtle)",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-strong)",
        }}
      >
        {rowLabel}
      </div>
      {metrics.map((m) => (
        <div key={m.key} style={{ textAlign: "center", padding: "6px 0" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.03em",
              color: "var(--status-neutral-fg)",
            }}
          >
            {m.key}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#185FA5", lineHeight: 1.2 }}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 4. ClickUp donut ─────────────────────────────────────────────────────────
function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 42;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={110} height={110} viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
        <g transform="rotate(-90 55 55)">
          {data.map((d) => {
            const frac = d.value / total;
            const dash = frac * circ;
            const seg = (
              <circle
                key={d.label}
                cx={55}
                cy={55}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={16}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
        <text
          x={55}
          y={50}
          textAnchor="middle"
          style={{ fontSize: 20, fontWeight: 700, fill: "var(--text-primary)" }}
        >
          {total}
        </text>
        <text
          x={55}
          y={66}
          textAnchor="middle"
          style={{ fontSize: 9, fill: "var(--status-neutral-fg)", letterSpacing: "0.05em" }}
        >
          TASKS
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: d.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: "var(--status-neutral-fg-strong)" }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginLeft: "auto" }}>
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BranchDashboard({
  userName,
  userEmail,
  branchName: sessionBranchName,
}: BranchDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [currentBranchName, setCurrentBranchName] = useState(sessionBranchName || "Klang");
  const [currentBranchCode, setCurrentBranchCode] = useState("KLG");
  const [crmMetrics, setCrmMetrics] = useState([
    { key: "NL", value: 0 },
    { key: "CT", value: 0 },
    { key: "SU", value: 0 },
    { key: "ENR", value: 0 },
  ]);
  const [smsMetrics, setSmsMetrics] = useState([
    { key: "AS", value: 0 },
    { key: "FS", value: 0 },
    { key: "RS", value: 0 },
    { key: "EXP", value: 0 },
  ]);
  const [attendance, setAttendance] = useState([
    { label: "Present", value: 0, color: "#0F6E56", bg: "#E1F5EE" },
    { label: "Absent", value: 0, color: "#A32D2D", bg: "#FCEBEB" },
    { label: "MC", value: 0, color: "#854F0B", bg: "#FAEEDA" },
    { label: "Annual Leave", value: 0, color: "#185FA5", bg: "#E6F1FB" },
  ]);
  const [revenueRanking, setRevenueRanking] = useState<{ rank: number; name: string; code: string; revenue: number }[]>([]);

  // Clickup status distribution
  const clickupData = [
    { label: "Complete", value: 24, color: "#0F6E56" },
    { label: "In Progress", value: 11, color: "#185FA5" },
    { label: "To Do", value: 8, color: "#854F0B" },
    { label: "Overdue", value: 3, color: "#A32D2D" },
  ];

  // Load live data from branch dashboard API
  const loadDashboardData = useCallback(() => {
    setLoading(true);
    fetch("/api/branch/dashboard")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          if (data.branchName) setCurrentBranchName(data.branchName);
          if (data.branchCode) setCurrentBranchCode(data.branchCode);
          if (data.crmMetrics) setCrmMetrics(data.crmMetrics);
          if (data.smsMetrics) setSmsMetrics(data.smsMetrics);
          if (data.attendanceToday) setAttendance(data.attendanceToday);
          if (data.revenueRankings) setRevenueRanking(data.revenueRankings);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load branch metrics:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Brain dump — persisted per user in localStorage.
  const noteKey = `branch-braindump:${userEmail ?? "anon"}`;
  const [note, setNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);

  useEffect(() => {
    try {
      setNote(localStorage.getItem(noteKey) ?? "");
    } catch {
      /* ignore */
    }
    setNoteLoaded(true);
  }, [noteKey]);

  useEffect(() => {
    if (!noteLoaded) return;
    try {
      localStorage.setItem(noteKey, note);
    } catch {
      /* ignore */
    }
  }, [note, noteKey, noteLoaded]);

  // Pending tasks list — persisted per user in localStorage
  const tasksKey = `branch-tasks:${userEmail ?? "anon"}`;
  const [tasks, setTasks] = useState<{ id: string; title: string; done: boolean }[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(tasksKey);
      if (saved) {
        setTasks(JSON.parse(saved));
      } else {
        setTasks(DEFAULT_TASKS);
      }
    } catch {
      setTasks(DEFAULT_TASKS);
    }
    setTasksLoaded(true);
  }, [tasksKey]);

  useEffect(() => {
    if (!tasksLoaded) return;
    try {
      localStorage.setItem(tasksKey, JSON.stringify(tasks));
    } catch {
      /* ignore */
    }
  }, [tasks, tasksKey, tasksLoaded]);

  const toggleTask = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const t = { id: Date.now().toString(), title: newTaskTitle.trim(), done: false };
    setTasks((prev) => [...prev, t]);
    setNewTaskTitle("");
  };

  // Events list — persisted per user in localStorage
  const eventsKey = `branch-events:${userEmail ?? "anon"}`;
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [newEventStatus, setNewEventStatus] = useState<"upcoming" | "ongoing" | "completed">("upcoming");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(eventsKey);
      if (saved) {
        setEvents(JSON.parse(saved));
      } else {
        setEvents([
          { id: "e1", name: "Q3 Campaign Plan", status: "upcoming" },
          { id: "e2", name: "TikTok Content Shoots", status: "ongoing" },
          { id: "e3", name: "Newsletter Send-Out", status: "completed" },
        ]);
      }
    } catch {
      setEvents([]);
    }
    setEventsLoaded(true);
  }, [eventsKey]);

  useEffect(() => {
    if (!eventsLoaded) return;
    try {
      localStorage.setItem(eventsKey, JSON.stringify(events));
    } catch {
      /* ignore */
    }
  }, [events, eventsKey, eventsLoaded]);

  const addEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    const item: EventItem = {
      id: Date.now().toString(),
      name: newEventName.trim(),
      status: newEventStatus,
    };
    setEvents((prev) => [...prev, item]);
    setNewEventName("");
  };

  const moveEvent = (id: string, nextStatus: "upcoming" | "ongoing" | "completed") => {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === id ? { ...ev, status: nextStatus } : ev))
    );
  };

  const deleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  };

  const pendingCount = tasks.filter((t) => !t.done).length;

  const myRank = revenueRanking.find(
    (b) => b.code.toUpperCase() === currentBranchCode.toUpperCase()
  );

  const greetName = `${currentBranchName} Branch`;

  return (
    <div
      style={{
        minHeight: "100%",
        background: "var(--surface-sunken)",
        fontFamily: fontStack,
        color: "var(--text-primary)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <GreetingHeader name={greetName} style={{ padding: "4px 0 0" }} />
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--status-neutral-fg)", background: "var(--border-subtle)", padding: "3px 6px", borderRadius: 4, letterSpacing: "0.05em" }}>
                SYNCING BRANCH DATABASE...
              </span>
            </div>
          )}
        </div>

        {/* ── Priority band: 1) metrics, 2) ranking, 3) attendance ─────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.15fr 1fr",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          {/* 1) Attendance Today (Left) */}
          <Panel title="Attendance Today" icon={<Compass style={{ width: 14, height: 14 }} />}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {attendance.map((a) => {
                let bg = "var(--tint-blue)";
                let border = "1px solid var(--status-blue-bg)";
                let iconBg = "var(--accent-blue)";
                let iconColor = "var(--surface)";
                let labelColor = "var(--accent-blue)";
                let IconComponent = UserCheck;

                if (a.label === "Present") {
                  bg = "var(--tint-green)";
                  border = "1px solid var(--status-green-bg)";
                  iconBg = "var(--accent-green)";
                  labelColor = "var(--accent-green-strong)";
                  IconComponent = UserCheck;
                } else if (a.label === "Absent") {
                  bg = "var(--tint-red)";
                  border = "1px solid var(--tint-red-strong)";
                  iconBg = "var(--accent-red)";
                  labelColor = "var(--accent-red-strong)";
                  IconComponent = UserX;
                } else if (a.label === "MC") {
                  bg = "var(--tint-amber)";
                  border = "1px solid var(--status-amber-bg-strong)";
                  iconBg = "var(--accent-amber)";
                  labelColor = "var(--accent-amber-strong)";
                  IconComponent = Activity;
                } else if (a.label === "Annual Leave") {
                  bg = "var(--tint-blue)";
                  border = "1px solid var(--status-blue-bg)";
                  iconBg = "var(--accent-blue)";
                  labelColor = "var(--accent-blue)";
                  IconComponent = Calendar;
                }

                return (
                  <div
                    key={a.label}
                    style={{
                      background: bg,
                      border: border,
                      borderRadius: 12,
                      padding: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: iconBg,
                        color: iconColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <IconComponent style={{ width: 18, height: 18 }} />
                    </div>
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          color: labelColor,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {a.label}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 20,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          lineHeight: 1.1,
                        }}
                      >
                        {a.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* 2) CRM & SMS Metrics (Middle) */}
          <Panel
            title="CRM & SMS Metrics"
            bodyStyle={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <MetricRow rowLabel="CRM" metrics={crmMetrics} />
            <div style={{ height: 0.5, background: "var(--border-subtle)" }} />
            <MetricRow rowLabel="SMS" metrics={smsMetrics} />
          </Panel>

          {/* 3) Branch revenue & rank (Right) */}
          <Panel title="Revenue & Rank">
            {myRank ? (() => {
              const revVal = myRank.revenue;
              const rankVal = myRank.rank;
              const isTop10 = rankVal <= 10;
              
              // Calculate values beneath the medal
              const expenseVal = Math.round(revVal * 0.65);
              const profitVal = revVal - expenseVal;

              return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "4px 0" }}>
                  {/* Above the medal: Revenue label */}
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#185FA5", textAlign: "center" }}>
                    Rev. {formatRM(revVal)}
                  </div>

                  {/* Medal Area (No Box) */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--status-neutral-fg-strong)", letterSpacing: "0.05em" }}>
                      {currentBranchCode.toUpperCase()}
                    </span>

                    {/* Medal Graphic for Top 10, otherwise Rank Text */}
                    {isTop10 ? (
                      <div style={{ position: "relative", width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
                          {/* Ribbon */}
                          <polygon points="35,50 15,95 38,95 50,75" fill="var(--accent-red)" />
                          <polygon points="65,50 85,95 62,95 50,75" fill="var(--status-red-fg)" />
                          {/* Medal body */}
                          <circle cx="50" cy="50" r="34" fill="#FBBF24" stroke="#D97706" strokeWidth="4" />
                          <circle cx="50" cy="50" r="28" fill="#FCD34D" />
                        </svg>
                        <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 16, fontWeight: 800, color: "var(--accent-amber-strong)" }}>
                          {rankVal}
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: "var(--text-muted-strong)",
                          background: "var(--border-subtle)",
                          borderRadius: 8,
                          padding: "4px 10px",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        #{rankVal}
                      </div>
                    )}
                  </div>

                  {/* Beneath the medal: Detailed metrics */}
                  <div
                    style={{
                      width: "100%",
                      borderTop: "0.5px solid var(--border-subtle)",
                      paddingTop: 10,
                      marginTop: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted-strong)", fontWeight: 500 }}>Revenue:</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{formatRM(revVal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted-strong)", fontWeight: 500 }}>Expense:</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{formatRM(expenseVal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted-strong)", fontWeight: 500 }}>Profit:</span>
                      <span style={{ color: "var(--accent-green-strong)", fontWeight: 700 }}>{formatRM(profitVal)}</span>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: "var(--status-neutral-fg)", fontSize: 13 }}>
                No ranking data available
              </div>
            )}
          </Panel>
        </div>

        {/* ── Secondary band: 4) ClickUp, 5) events, 6) brain dump, 7) tasks ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          {/* 4) Monthly tasks pie (mock data — label updated with the ClickUp feature's removal) */}
          <Panel title="Monthly Tasks">
            <Donut data={clickupData} />
          </Panel>

          {/* 7) Pending tasks */}
          <Panel
            title={`Pending Tasks · ${pendingCount}`}
          >
            <form onSubmit={handleAddTask} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="New task..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                style={{
                  flex: 1,
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  background: "#185FA5",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </form>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 110, overflowY: "auto" }}>
              {tasks.map((t) => (
                <label
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "3px 4px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTask(t.id)}
                    style={{ width: 14, height: 14, accentColor: "#185FA5", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      color: t.done ? "var(--text-muted)" : "var(--text-primary)",
                      textDecoration: t.done ? "line-through" : "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t.title}
                  </span>
                </label>
              ))}
            </div>
          </Panel>

          {/* 6) Brain dump */}
          <Panel
            title="Brain Dump"
            bodyStyle={{ display: "flex" }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Jot anything down — saved automatically on this device."
              style={{
                width: "100%",
                minHeight: 120,
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: fontStack,
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--text-primary)",
              }}
            />
          </Panel>
        </div>

        {/* 5) Events & announcements — full width footer band */}
        <Panel title="Events & Announcements" icon={<Bell style={{ width: 14, height: 14 }} />}>
          <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 18 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--status-neutral-fg)",
                  letterSpacing: "0.04em",
                  marginBottom: 8,
                }}
              >
                EVENT TRACKER
              </div>
              
              {/* Event Add Form */}
              <form onSubmit={addEvent} style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="New event name..."
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  style={{
                    flex: 1,
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    padding: "5px 10px",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <select
                  value={newEventStatus}
                  onChange={(e) => setNewEventStatus(e.target.value as "upcoming" | "ongoing" | "completed")}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    padding: "5px 6px",
                    fontSize: 11,
                    outline: "none",
                    background: "var(--surface)",
                  }}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
                <button
                  type="submit"
                  style={{
                    background: "#185FA5",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Plus style={{ width: 14, height: 14 }} />
                </button>
              </form>

              {/* columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {(["upcoming", "ongoing", "completed"] as const).map((col) => {
                  const filtered = events.filter((ev) => ev.status === col);
                  const title = col === "upcoming" ? "Upcoming" : col === "ongoing" ? "Ongoing" : "Completed";
                  const borderCol = col === "upcoming" ? "0.5px solid var(--border-subtle)" : col === "ongoing" ? "0.5px solid var(--status-amber-bg-strong)" : "0.5px solid var(--status-green-bg)";
                  const bgCol = col === "upcoming" ? "var(--surface-sunken)" : col === "ongoing" ? "var(--tint-amber)" : "var(--tint-green)";
                  const textCol = col === "upcoming" ? "var(--status-neutral-fg-strong)" : col === "ongoing" ? "var(--accent-amber-strong)" : "var(--accent-green-strong)";

                  return (
                    <div key={col} style={{ border: borderCol, background: bgCol, borderRadius: 10, padding: 8 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderBottom: "0.5px solid rgba(0,0,0,0.05)", paddingBottom: 4, color: textCol }}>
                        {title}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto", paddingRight: 2 }}>
                        {filtered.map((ev) => (
                          <div key={ev.id} style={{ padding: 8, background: "var(--surface)", border: "0.5px solid var(--border-subtle)", borderRadius: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontWeight: 600, color: "var(--text-strong)", wordBreak: "break-all", lineHeight: 1.25 }}>{ev.name}</span>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "0.5px solid var(--status-neutral-bg)", paddingTop: 6, marginTop: 2 }}>
                              {col !== "completed" ? (
                                <button
                                  onClick={() => moveEvent(ev.id, col === "upcoming" ? "ongoing" : "completed")}
                                  style={{ background: "none", border: "none", color: "var(--accent-blue)", fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}
                                >
                                  Move ➔
                                </button>
                              ) : (
                                <span style={{ fontSize: 9, color: "var(--status-neutral-fg)", fontWeight: 700 }}>Done</span>
                              )}
                              <button
                                onClick={() => deleteEvent(ev.id)}
                                style={{ background: "none", border: "none", color: "var(--status-neutral-fg)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                              >
                                <Trash2 style={{ width: 13, height: 13 }} />
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
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--status-neutral-fg)",
                  letterSpacing: "0.04em",
                  marginBottom: 8,
                }}
              >
                ANNOUNCEMENTS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto", paddingRight: 2 }}>
                {DEFAULT_ANNOUNCEMENTS.map((a) => (
                  <div
                    key={a}
                    style={{
                      display: "flex",
                      alignItems: "start",
                      gap: 8,
                      padding: "8px 10px",
                      background: "var(--tint-blue)",
                      border: "0.5px solid var(--status-blue-bg)",
                      borderRadius: 8,
                    }}
                  >
                    <Megaphone style={{ width: 13, height: 13, color: "var(--accent-blue)", marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--accent-blue)", lineHeight: 1.4 }}>
                      {a}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
