"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toPie, type DeptDataset } from "@/lib/clickup";
import ClickUpPieModal from "./ClickUpPieModal";
import DepartmentWidgets from "./DepartmentWidgets";
import Announcements from "./Announcements";

interface DepartmentDashboardProps {
  departmentName: string;
  slug: string;
  dataset: DeptDataset;
  attendance: {
    present: number;
    absent: number;
    mc: number;
    annualLeave: number;
    presentNames: string[];
    absentNames: string[];
    mcNames: string[];
    annualLeaveNames: string[];
  };
  events: {
    id: string;
    date: string;
    title: string;
    venue: string;
    tone: string;
    status: EventStatus;
  }[];
  userName?: string | null;
  userEmail?: string | null;
}

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "0.5px solid var(--status-track)",
  borderRadius: 12,
};

type EventStatus = "upcoming" | "ongoing" | "completed";

const EVENT_TABS: { key: EventStatus; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "ongoing", label: "Ongoing" },
  { key: "completed", label: "Completed" },
];

// ── Reusable section shell ───────────────────────────────────────────────────
function Panel({
  title,
  icon,
  children,
  style,
  bodyStyle,
  onClick,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <section
      onClick={onClick}
      style={{
        ...card,
        display: "flex",
        flexDirection: "column",
        ...(onClick ? { cursor: "pointer" } : null),
        ...style,
      }}
    >
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

// ── Donut chart ──────────────────────────────────────────────────────────────
function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 42;
  const circ = 2 * Math.PI * r;

  // Precompute segment offsets without mutating state during render.
  const segments: { label: string; color: string; dash: number; offset: number }[] = [];
  let running = 0;
  for (const d of data) {
    const dash = (d.value / total) * circ;
    segments.push({ label: d.label, color: d.color, dash, offset: running });
    running += dash;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={110} height={110} viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
        <g transform="rotate(-90 55 55)">
          {segments.map((s) => (
            <circle
              key={s.label}
              cx={55}
              cy={55}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={16}
              strokeDasharray={`${s.dash} ${circ - s.dash}`}
              strokeDashoffset={-s.offset}
            />
          ))}
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

// Attendance stat card: hover to preview the names; click to hold it open
// (pinned). Click again or the ✕ to close.
function AttendanceCard({
  label,
  value,
  names,
  color,
  bg,
}: {
  label: string;
  value: number;
  names: string[];
  color: string;
  bg: string;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => setPinned((p) => !p)}
      title={pinned ? "Click to unpin" : "Click to keep open"}
      style={{
        position: "relative",
        background: bg,
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: 92,
        cursor: "pointer",
        outline: pinned ? `2px solid ${color}` : "none",
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color,
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {label}
        {pinned && <i className="ti ti-pin-filled" style={{ fontSize: 12 }} />}
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            cursor: "default",
            marginTop: 10,
            maxHeight: 150,
            overflowY: "auto",
            borderTop: "0.5px solid rgba(0,0,0,0.08)",
            paddingTop: 8,
          }}
        >
          {names.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted-strong)" }}>None.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {names.map((n, i) => (
                <div key={`${n}-${i}`} style={{ fontSize: 12, color: "var(--text-primary)" }}>
                  {n}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DepartmentDashboard({
  departmentName,
  slug,
  dataset,
  attendance,
  events,
  userName,
  userEmail,
}: DepartmentDashboardProps) {
  const router = useRouter();

  // HQ attendance today (from HRFS), in the 2×2 card order.
  // Exact match to globals.css's --cat-* categorical pairs (built for this
  // kind of light-tint attendance chip and fully theme-aware, dark values
  // included) — tokenised so these flip with theme instead of the
  // "off-table brand colour, leave literal" treatment that applies when
  // #185FA5 is used as a one-off accent elsewhere in this file.
  const attendanceCards = [
    { label: "Present", value: attendance.present, names: attendance.presentNames, color: "var(--cat-green-fg)", bg: "var(--cat-green-bg)" },
    { label: "Absent", value: attendance.absent, names: attendance.absentNames, color: "var(--cat-red-fg)", bg: "var(--cat-red-bg)" },
    { label: "MC", value: attendance.mc, names: attendance.mcNames, color: "var(--cat-amber-fg)", bg: "var(--cat-amber-bg)" },
    { label: "Annual Leave", value: attendance.annualLeave, names: attendance.annualLeaveNames, color: "var(--cat-blue-fg)", bg: "var(--cat-blue-bg)" },
  ];

  // ── Events filter ──────────────────────────────────────────────────────────
  const [eventTab, setEventTab] = useState<EventStatus>("upcoming");
  const visibleEvents = events.filter((e) => e.status === eventTab);

  const [pieOpen, setPieOpen] = useState(false);

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
        {/* ── Header: back + department name ────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
          <button
            type="button"
            onClick={() => router.push("/clickup-task")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              border: "0.5px solid var(--status-track)",
              borderRadius: 8,
              background: "var(--surface)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <i className="ti ti-arrow-left" />
            Back
          </button>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
            {departmentName}
          </h1>
        </div>

        {/* ── Row 1: Attendance (big, 2/3) + Announcements (1/3) ────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <Panel
            title="Attendance Today"
            icon={<i className="ti ti-users" />}
            style={{ gridColumn: "span 2" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                alignItems: "start",
              }}
            >
              {attendanceCards.map((a) => (
                <AttendanceCard
                  key={a.label}
                  label={a.label}
                  value={a.value}
                  names={a.names}
                  color={a.color}
                  bg={a.bg}
                />
              ))}
            </div>
          </Panel>

          <Panel title="Highlights" icon={<i className="ti ti-speakerphone" />}>
            <Announcements />
          </Panel>
        </div>

        {/* ── Row 2: Events with filter (2/3) + Department pie (1/3) ────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <Panel
            title="Events"
            icon={<i className="ti ti-calendar-event" />}
            style={{ gridColumn: "span 2" }}
            bodyStyle={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {/* Segmented filter: Upcoming / Ongoing / Completed */}
            <div
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                background: "var(--status-neutral-bg)",
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}
            >
              {EVENT_TABS.map((tab) => {
                const active = eventTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setEventTab(tab.key)}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      padding: "5px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      // #185FA5 is the ebright brand blue (off-table, kept
                      // literal per the brand-colour rule) — a one-off
                      // "selected tab" accent, not paired with a category bg.
                      background: active ? "var(--surface)" : "transparent",
                      color: active ? "#185FA5" : "var(--status-neutral-fg-strong)",
                      boxShadow: active ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Filtered list — shows ~6 rows, scrolls for more */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 270,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {visibleEvents.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--status-neutral-fg)", padding: "4px 0" }}>
                  No {eventTab} events.
                </div>
              ) : (
                visibleEvents.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                        {e.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--status-neutral-fg)",
                          marginTop: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <i className="ti ti-map-pin" />
                        {e.venue}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        background: e.tone,
                        borderRadius: 6,
                        padding: "3px 8px",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {e.date}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel
            title="Weekly ClickUp"
            icon={<i className="ti ti-chart-pie" />}
            onClick={() => setPieOpen(true)}
          >
            <Donut data={toPie(dataset.week)} />
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                fontWeight: 600,
                // Brand blue accent (off-table, kept literal — see the
                // Events tab comment above).
                color: "#185FA5",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Click to expand <i className="ti ti-arrows-maximize" />
            </div>
          </Panel>
        </div>

        {/* Expanded interactive pie */}
        {pieOpen && (
          <ClickUpPieModal
            departmentName={departmentName}
            dataset={dataset}
            onClose={() => setPieOpen(false)}
            onViewMembers={() => router.push(`/clickup-task/${slug}/members`)}
            onSelectMember={(id) =>
              router.push(`/clickup-task/${slug}/members?member=${id}`)
            }
          />
        )}

        <DepartmentWidgets
          slug={slug}
          departmentName={departmentName}
          userName={userName}
          userEmail={userEmail}
        />
      </div>
    </div>
  );
}
