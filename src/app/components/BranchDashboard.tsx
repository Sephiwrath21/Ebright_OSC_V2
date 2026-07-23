"use client";

import { useEffect, useState } from "react";
import GreetingHeader from "./GreetingHeader";

/**
 * Home view for the `branch` role (role_id = 4).
 *
 * Bento layout tuned to fit roughly one viewport (minimal scroll). Section
 * priority follows the brief — the top band holds the three most important
 * (1) CRM & SMS metrics, (2) branch revenue ranking, (3) attendance — and the
 * remaining sections (ClickUp pie, events/announcements, brain dump, pending
 * tasks) fill the band below.
 *
 * All figures are MOCK placeholders shaped for a later API swap; they mirror
 * the static approach already used by HrPersonalizedDashboard.
 */

interface BranchDashboardProps {
  userName?: string | null;
  userEmail?: string | null;
  branchName?: string | null;
}

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "0.5px solid #E5E7EB",
  borderRadius: 12,
};

// ── Mock data — TODO: replace with real branch API ──────────────────────────
const CRM_METRICS = [
  { key: "NL", value: 5 },
  { key: "CT", value: 3 },
  { key: "SU", value: 2 },
  { key: "ENR", value: 1 },
];
const SMS_METRICS = [
  { key: "AS", value: 150 },
  { key: "FS", value: 3 },
  { key: "RS", value: 5 },
  { key: "EXP", value: 2 },
];

const REVENUE_RANKING = [
  { rank: 1, name: "Kuala Lumpur", revenue: 2_450_000 },
  { rank: 2, name: "Putrajaya", revenue: 1_960_000 },
  { rank: 3, name: "Shah Alam", revenue: 1_720_000 },
  { rank: 4, name: "Penang", revenue: 1_180_000 },
  { rank: 5, name: "Johor Bahru", revenue: 980_000 },
];

const ATTENDANCE = [
  { label: "Present", value: 18, color: "#0F6E56", bg: "#E1F5EE" },
  { label: "Absent", value: 2, color: "#A32D2D", bg: "#FCEBEB" },
  { label: "MC", value: 1, color: "#854F0B", bg: "#FAEEDA" },
  { label: "Annual Leave", value: 1, color: "#185FA5", bg: "#E6F1FB" },
];

const CLICKUP = [
  { label: "Complete", value: 24, color: "#0F6E56" },
  { label: "In Progress", value: 11, color: "#185FA5" },
  { label: "To Do", value: 8, color: "#854F0B" },
  { label: "Overdue", value: 3, color: "#A32D2D" },
];

const EVENTS = [
  { date: "06 Jun", title: "Townhall session", tone: "#185FA5" },
  { date: "10 Jun", title: "BPR meeting", tone: "#3C3489" },
  { date: "13 Jun", title: "Scrum", tone: "#0F6E56" },
];
const ANNOUNCEMENTS = [
  "Q2 enrolment push — target review on Friday.",
  "New onboarding SOP published in ClickUp.",
];

const DEFAULT_TASKS = [
  { id: "t1", title: "Submit weekly enrolment report", done: false },
  { id: "t2", title: "Follow up 3 CNS opportunities", done: false },
  { id: "t3", title: "Approve staff MC application", done: true },
  { id: "t4", title: "Confirm townhall headcount", done: false },
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
          borderBottom: "0.5px solid #F1F1F1",
        }}
      >
        {icon && <span style={{ color: "#6B7280", display: "inline-flex" }}>{icon}</span>}
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#374151",
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
          background: "#F8FAFC",
          border: "0.5px solid #EEF1F4",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          color: "#334155",
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
              color: "#94A3B8",
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
          style={{ fontSize: 20, fontWeight: 700, fill: "#111827" }}
        >
          {total}
        </text>
        <text
          x={55}
          y={66}
          textAnchor="middle"
          style={{ fontSize: 9, fill: "#94A3B8", letterSpacing: "0.05em" }}
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
            <span style={{ fontSize: 12, color: "#475569" }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginLeft: "auto" }}>
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
  branchName,
}: BranchDashboardProps) {
  const greetName = branchName || userName?.split(" ")[0] || userEmail?.split("@")[0] || "";

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

  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const toggleTask = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const pendingCount = tasks.filter((t) => !t.done).length;

  const myRank = REVENUE_RANKING.find(
    (b) => branchName && b.name.toLowerCase() === branchName.toLowerCase(),
  );

  return (
    <div
      style={{
        minHeight: "100%",
        background: "#F3F4F6",
        fontFamily: fontStack,
        color: "#111827",
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
        <GreetingHeader name={greetName} style={{ padding: "4px 0 0" }} />

        {/* ── Priority band: 1) metrics, 2) ranking, 3) attendance ─────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 1fr 1fr",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          {/* 1) CRM & SMS metrics */}
          <Panel
            title="CNS & SMS Metrics"
            icon={<i className="ti ti-layout-grid" />}
            bodyStyle={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <MetricRow rowLabel="CNS" metrics={CRM_METRICS} />
            <div style={{ height: 0.5, background: "#EEF1F4" }} />
            <MetricRow rowLabel="SMS" metrics={SMS_METRICS} />
          </Panel>

          {/* 2) Branch revenue ranking */}
          <Panel title="Revenue Ranking" icon={<i className="ti ti-trophy" />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {REVENUE_RANKING.map((b) => {
                const mine =
                  branchName && b.name.toLowerCase() === branchName.toLowerCase();
                return (
                  <div
                    key={b.rank}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 8px",
                      borderRadius: 7,
                      background: mine ? "#E6F1FB" : "transparent",
                      border: mine ? "0.5px solid #BBD7F2" : "0.5px solid transparent",
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        fontSize: 12,
                        fontWeight: 700,
                        color: b.rank <= 3 ? "#185FA5" : "#94A3B8",
                      }}
                    >
                      {b.rank}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: mine ? 700 : 500,
                        color: "#1F2937",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {b.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
                      {formatRM(b.revenue)}
                    </span>
                  </div>
                );
              })}
            </div>
            {myRank && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                Your branch is ranked{" "}
                <strong style={{ color: "#185FA5" }}>#{myRank.rank}</strong> of{" "}
                {REVENUE_RANKING.length}.
              </div>
            )}
          </Panel>

          {/* 3) Attendance */}
          <Panel title="Attendance Today" icon={<i className="ti ti-users" />}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                height: "100%",
              }}
            >
              {ATTENDANCE.map((a) => (
                <div
                  key={a.label}
                  style={{
                    background: a.bg,
                    borderRadius: 8,
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, color: a.color, lineHeight: 1 }}>
                    {a.value}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: a.color, marginTop: 4 }}>
                    {a.label}
                  </div>
                </div>
              ))}
            </div>
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
          {/* 4) Monthly ClickUp pie */}
          <Panel title="Monthly Tasks" icon={<i className="ti ti-chart-pie" />}>
            <Donut data={CLICKUP} />
          </Panel>

          {/* 7) Pending tasks */}
          <Panel
            title={`Pending Tasks · ${pendingCount}`}
            icon={<i className="ti ti-checklist" />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tasks.map((t) => (
                <label
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "5px 4px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTask(t.id)}
                    style={{ width: 15, height: 15, accentColor: "#185FA5", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: t.done ? "#9CA3AF" : "#1F2937",
                      textDecoration: t.done ? "line-through" : "none",
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
            icon={<i className="ti ti-notes" />}
            bodyStyle={{ display: "flex" }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Jot anything down — saved automatically on this device."
              style={{
                width: "100%",
                minHeight: 130,
                resize: "vertical",
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: fontStack,
                fontSize: 13,
                lineHeight: 1.5,
                color: "#1F2937",
              }}
            />
          </Panel>
        </div>

        {/* 5) Events & announcements — full width footer band */}
        <Panel title="Events & Announcements" icon={<i className="ti ti-calendar-event" />}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#94A3B8",
                  letterSpacing: "0.04em",
                  marginBottom: 8,
                }}
              >
                UPCOMING EVENTS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {EVENTS.map((e) => (
                  <div key={e.title} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        background: e.tone,
                        borderRadius: 6,
                        padding: "3px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.date}
                    </span>
                    <span style={{ fontSize: 13, color: "#1F2937" }}>{e.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#94A3B8",
                  letterSpacing: "0.04em",
                  marginBottom: 8,
                }}
              >
                ANNOUNCEMENTS
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                {ANNOUNCEMENTS.map((a) => (
                  <li key={a} style={{ fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
