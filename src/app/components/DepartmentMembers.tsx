"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CLICKUP_DAYS as DAYS,
  type DeptDataset,
  type MemberWeek,
  type Stats,
  type TaskList,
} from "@/lib/clickup";
import DepartmentWidgets from "./DepartmentWidgets";

interface DepartmentMembersProps {
  departmentName: string;
  slug: string;
  dataset: DeptDataset;
  initialMember?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

type Day = (typeof DAYS)[number];

// Today's weekday in Malaysia time (UTC+8); "week" when today isn't Tue–Sun (Monday).
function currentMalaysiaDay(): Day | "week" {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "long",
  }).format(new Date());
  return (DAYS as readonly string[]).includes(today) ? (today as Day) : "week";
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function PercentRing({ percent }: { percent: number }) {
  const size = 96;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#EEF1F4" strokeWidth={stroke} />
      <g transform={`rotate(-90 ${c} ${c})`}>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="#0F6E56"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
        />
      </g>
      <text
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 18, fontWeight: 700, fill: "#185FA5" }}
      >
        {percent}%
      </text>
    </svg>
  );
}

function StatChip({
  value,
  label,
  color,
  bg,
}: {
  value: number;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: bg,
        borderRadius: 8,
        padding: "8px 4px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Accordion({
  label,
  count,
  color,
  bg,
  tasks,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
  tasks: string[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ background: bg, borderRadius: 8, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i className={open ? "ti ti-caret-down-filled" : "ti ti-caret-right-filled"} style={{ color, fontSize: 12 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{label}</span>
        </span>
        <span
          style={{
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            borderRadius: 999,
            background: color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {count}
        </span>
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 10px 10px 26px", display: "flex", flexDirection: "column", gap: 5 }}>
          {tasks.length === 0 ? (
            <li style={{ fontSize: 12, color: "#94A3B8" }}>Nothing here.</li>
          ) : (
            tasks.map((t, i) => (
              <li key={`${t}-${i}`} style={{ fontSize: 12, color: "#475569" }}>
                • {t}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function MemberCard({ m, stats, tasks }: { m: MemberWeek; stats: Stats; tasks: TaskList }) {
  const [open, setOpen] = useState<"completed" | "pending" | "na" | null>(null);
  const { done, pending, notApplicable, total } = stats;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ height: 6, background: "linear-gradient(90deg, #4F46E5, #7C3AED)" }} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Member header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "#EEF2FF",
              color: "#4F46E5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initialsOf(m.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#111827",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {m.name}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{m.role}</div>
          </div>
        </div>

        {/* Donut */}
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <PercentRing percent={percent} />
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 6 }}>
          <StatChip value={done} label="Done" color="#0F6E56" bg="#E1F5EE" />
          <StatChip value={pending} label="Pending" color="#DC2626" bg="#FEE2E2" />
          <StatChip value={notApplicable} label="N/A" color="#CA8A04" bg="#FEF9C3" />
          <StatChip value={total} label="Total" color="#3C3489" bg="#EEEDFE" />
        </div>

        {/* Completed / Pending / Not Applicable */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Accordion
            label="Completed"
            count={tasks.complete.length}
            color="#0F6E56"
            bg="#F0FAF6"
            tasks={tasks.complete}
            open={open === "completed"}
            onToggle={() => setOpen((o) => (o === "completed" ? null : "completed"))}
          />
          <Accordion
            label="Pending"
            count={tasks.pending.length}
            color="#DC2626"
            bg="#FEF2F2"
            tasks={tasks.pending}
            open={open === "pending"}
            onToggle={() => setOpen((o) => (o === "pending" ? null : "pending"))}
          />
          <Accordion
            label="Not Applicable"
            count={tasks.notApplicable.length}
            color="#CA8A04"
            bg="#FEFCE8"
            tasks={tasks.notApplicable}
            open={open === "na"}
            onToggle={() => setOpen((o) => (o === "na" ? null : "na"))}
          />
        </div>
      </div>
    </div>
  );
}

export default function DepartmentMembers({
  departmentName,
  slug,
  dataset,
  initialMember,
  userName,
  userEmail,
}: DepartmentMembersProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "completion" | "pending">("name");
  const [memberId, setMemberId] = useState<string | null>(initialMember ?? null);
  // Defaults to today (Malaysia time); "Weekly" shows every task.
  const [day, setDay] = useState<Day | "week">(() => currentMalaysiaDay());

  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withStats = dataset.members.map((m) => ({
      m,
      stats: day === "week" ? m.week : m.days[DAYS.indexOf(day)],
      tasks: day === "week" ? m.weekTasks : m.dayTasks[DAYS.indexOf(day)],
    }));
    const scoped = memberId ? withStats.filter(({ m }) => m.id === memberId) : withStats;
    const filtered = q
      ? scoped.filter(
          ({ m }) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q),
        )
      : scoped;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "name") return a.m.name.localeCompare(b.m.name);
      if (sort === "completion") {
        const pa = a.stats.total ? a.stats.done / a.stats.total : 0;
        const pb = b.stats.total ? b.stats.done / b.stats.total : 0;
        return pb - pa;
      }
      return b.stats.total - b.stats.done - (a.stats.total - a.stats.done);
    });
    return sorted;
  }, [query, sort, memberId, dataset, day]);

  return (
    <div
      style={{
        minHeight: "100%",
        background: "#F3F4F6",
        fontFamily: fontStack,
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Top bar */}
        <div
          style={{
            background: "#FFFFFF",
            border: "0.5px solid #E5E7EB",
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => router.push(`/clickup-task/${slug}`)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              border: "0.5px solid #E5E7EB",
              borderRadius: 8,
              background: "#FFFFFF",
              color: "#374151",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <i className="ti ti-arrow-left" />
            Back
          </button>
          <h1 style={{ flex: 1, textAlign: "center", margin: 0, fontSize: 16, fontWeight: 700 }}>
            All Members — ClickUp Overview
          </h1>
          <span
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              background: "#EEEDFE",
              color: "#3C3489",
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {departmentName}
          </span>
        </div>

        {/* Controls: search + day selector + sort in one bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              flex: 1,
              minWidth: 240,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#FFFFFF",
              border: "0.5px solid #E5E7EB",
              borderRadius: 10,
              padding: "8px 12px",
            }}
          >
            <i className="ti ti-search" style={{ color: "#94A3B8" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search member by name, role, or department…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "inherit",
                fontSize: 13,
                color: "#1F2937",
              }}
            />
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6B7280" }}>
            Sort:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              style={{
                border: "0.5px solid #E5E7EB",
                borderRadius: 8,
                padding: "7px 10px",
                background: "#FFFFFF",
                fontFamily: "inherit",
                fontSize: 13,
                color: "#1F2937",
                cursor: "pointer",
              }}
            >
              <option value="name">Name</option>
              <option value="completion">Completion %</option>
              <option value="pending">Pending</option>
            </select>
          </label>
        </div>

        {/* Day selector — defaults to today (Malaysia time) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["week", ...DAYS] as const).map((d) => {
            const active = day === d;
            const label = d === "week" ? "Weekly" : d.slice(0, 3);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                title={d === "week" ? "Whole week (all tasks)" : d}
                style={{
                  height: 38,
                  padding: "0 16px",
                  border: active ? "none" : "0.5px solid #E5E7EB",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  background: active ? "#185FA5" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#374151",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>
            Showing {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
          {memberId && (
            <button
              type="button"
              onClick={() => setMemberId(null)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                border: "0.5px solid #E5E7EB",
                borderRadius: 999,
                background: "#FFFFFF",
                color: "#185FA5",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <i className="ti ti-x" /> Show all members
            </button>
          )}
        </div>

        {/* Member grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {members.map(({ m, stats, tasks }) => (
            <MemberCard key={m.id} m={m} stats={stats} tasks={tasks} />
          ))}
        </div>
      </div>

      <DepartmentWidgets
        slug={slug}
        departmentName={departmentName}
        userName={userName}
        userEmail={userEmail}
      />
    </div>
  );
}
