"use client";

import GreetingHeader from "./GreetingHeader";

interface HrPersonalizedDashboardProps {
  userName?: string | null;
  userEmail?: string | null;
}

type PaletteKey = "blue" | "green" | "amber" | "red" | "purple" | "gray";

const palette: Record<PaletteKey, { dark: string; light: string }> = {
  blue: { dark: "#185FA5", light: "#E6F1FB" },
  green: { dark: "#0F6E56", light: "#E1F5EE" },
  amber: { dark: "#854F0B", light: "#FAEEDA" },
  red: { dark: "#A32D2D", light: "#FCEBEB" },
  purple: { dark: "#3C3489", light: "#EEEDFE" },
  gray: { dark: "#444441", light: "#F1EFE8" },
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "0.5px solid var(--status-track)",
  borderRadius: 12,
};

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function MetricCard({
  icon,
  color,
  value,
  label,
  delta,
  deltaUp,
  deltaPositive,
}: {
  icon: string;
  color: PaletteKey;
  value: string;
  label: string;
  delta: string;
  deltaUp: boolean;
  deltaPositive: boolean;
}) {
  const c = palette[color];
  const deltaColor = deltaPositive ? palette.green : palette.red;
  return (
    <div style={{ ...card, padding: 16 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: c.light,
          color: c.dark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          marginBottom: 14,
        }}
      >
        <i className={icon} />
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-muted-strong)",
          marginTop: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: 10,
          padding: "2px 8px",
          borderRadius: 999,
          background: deltaColor.light,
          color: deltaColor.dark,
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        <i className={deltaUp ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right"} />
        <span>{delta}</span>
      </div>
    </div>
  );
}

function StatBar({
  label,
  value,
  color,
  total,
  shortLabel,
}: {
  label: string;
  value: number;
  color: PaletteKey;
  total: number;
  shortLabel?: string;
}) {
  const c = palette[color];
  const pct = Math.min(100, (value / total) * 100);
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-muted-strong)" }}>
          {label}
          {shortLabel ? (
            <span
              style={{
                marginLeft: 6,
                padding: "1px 6px",
                background: c.light,
                color: c.dark,
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {shortLabel}
            </span>
          ) : null}
        </span>
        <span style={{ fontSize: 18, fontWeight: 600, color: c.dark }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--status-neutral-bg)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: c.dark,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function Avatar({
  name,
  color,
  size = 36,
}: {
  name: string;
  color: PaletteKey;
  size?: number;
}) {
  const c = palette[color];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: c.light,
        color: c.dark,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}

function Pill({
  text,
  color,
  icon,
}: {
  text: string;
  color: PaletteKey;
  icon?: string;
}) {
  const c = palette[color];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 999,
        background: c.light,
        color: c.dark,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {icon ? <i className={icon} /> : null}
      {text}
    </span>
  );
}

const birthdays: Array<{
  name: string;
  dept: string;
  date: string;
  badge: string;
  badgeColor: PaletteKey;
  avatarColor: PaletteKey;
  isToday?: boolean;
}> = [
  {
    name: "Aisyah Rahman",
    dept: "Marketing",
    date: "May 13",
    badge: "Today",
    badgeColor: "amber",
    avatarColor: "purple",
    isToday: true,
  },
  {
    name: "Daniel Lim",
    dept: "Engineering",
    date: "May 14",
    badge: "Tomorrow",
    badgeColor: "blue",
    avatarColor: "blue",
  },
  {
    name: "Priya Nair",
    dept: "Finance",
    date: "May 17",
    badge: "In 4 days",
    badgeColor: "green",
    avatarColor: "green",
  },
  {
    name: "Marcus Tan",
    dept: "Operations",
    date: "May 18",
    badge: "In 5 days",
    badgeColor: "gray",
    avatarColor: "red",
  },
];

const pipeline: Array<{ stage: string; count: number; shade: number }> = [
  { stage: "Applied", count: 247, shade: 0.18 },
  { stage: "Screened", count: 141, shade: 0.36 },
  { stage: "Interview", count: 78, shade: 0.54 },
  { stage: "Offer", count: 34, shade: 0.78 },
  { stage: "Hired", count: 31, shade: 1.0 },
];

const onboarding: Array<{
  name: string;
  dept: string;
  days: string;
  status: string;
  statusColor: PaletteKey;
  avatarColor: PaletteKey;
}> = [
  {
    name: "Nur Iman",
    dept: "Customer Success",
    days: "Day 3",
    status: "Active",
    statusColor: "green",
    avatarColor: "green",
  },
  {
    name: "Wei Jian",
    dept: "Engineering",
    days: "Day 6",
    status: "Week 1",
    statusColor: "blue",
    avatarColor: "blue",
  },
  {
    name: "Sara Devi",
    dept: "People Ops",
    days: "Day 11",
    status: "Week 2",
    statusColor: "purple",
    avatarColor: "purple",
  },
];

const offboarding: Array<{
  name: string;
  dept: string;
  lastDay: string;
  daysLeft: string;
  daysLeftColor: PaletteKey;
  avatarColor: PaletteKey;
}> = [
  {
    name: "Adrian Goh",
    dept: "Sales",
    lastDay: "May 20",
    daysLeft: "7 days left",
    daysLeftColor: "red",
    avatarColor: "amber",
  },
  {
    name: "Farah Salleh",
    dept: "Marketing",
    lastDay: "May 30",
    daysLeft: "17 days left",
    daysLeftColor: "amber",
    avatarColor: "gray",
  },
];

const tasks: Record<
  "review" | "progress" | "done",
  Array<{
    title: string;
    subtitle: string;
    statusLabel: string;
    statusColor: PaletteKey;
    assignee?: { name: string; color: PaletteKey };
    due?: string;
  }>
> = {
  review: [
    {
      title: "Approve leave — Adrian Goh",
      subtitle: "Annual leave, 3 days",
      statusLabel: "Pending",
      statusColor: "amber",
      assignee: { name: "HR Lead", color: "blue" },
    },
    {
      title: "Review offer — Backend role",
      subtitle: "Engineering, Senior level",
      statusLabel: "Awaiting",
      statusColor: "purple",
      due: "Due May 15",
    },
    {
      title: "Payroll adjustment",
      subtitle: "May cycle, 4 employees",
      statusLabel: "Pending",
      statusColor: "amber",
      assignee: { name: "Sara Devi", color: "purple" },
    },
  ],
  progress: [
    {
      title: "Onboard Nur Iman",
      subtitle: "Customer Success",
      statusLabel: "Day 3 of 14",
      statusColor: "green",
      assignee: { name: "HR Lead", color: "blue" },
    },
    {
      title: "Interview — Frontend lead",
      subtitle: "Round 2 scheduling",
      statusLabel: "Scheduling",
      statusColor: "blue",
      due: "Due May 16",
    },
    {
      title: "Policy update — WFH",
      subtitle: "Draft v2",
      statusLabel: "Drafting",
      statusColor: "purple",
      assignee: { name: "Priya N.", color: "green" },
    },
    {
      title: "Q2 performance reviews",
      subtitle: "12 of 38 done",
      statusLabel: "In progress",
      statusColor: "amber",
      due: "Due Jun 10",
    },
    {
      title: "Benefits renewal",
      subtitle: "Vendor selection",
      statusLabel: "Comparing",
      statusColor: "gray",
      assignee: { name: "Marcus T.", color: "red" },
    },
  ],
  done: [
    {
      title: "May payroll dispatched",
      subtitle: "1,284 employees",
      statusLabel: "Done",
      statusColor: "green",
      assignee: { name: "Sara D.", color: "purple" },
    },
    {
      title: "Closed — Marketing role",
      subtitle: "Offer accepted",
      statusLabel: "Closed",
      statusColor: "green",
      assignee: { name: "HR Lead", color: "blue" },
    },
    {
      title: "Q1 review summary",
      subtitle: "Shared with leadership",
      statusLabel: "Done",
      statusColor: "green",
      due: "May 10",
    },
    {
      title: "New starter pack — Wei Jian",
      subtitle: "Equipment + access",
      statusLabel: "Done",
      statusColor: "green",
      assignee: { name: "Marcus T.", color: "red" },
    },
    {
      title: "Compliance training reminder",
      subtitle: "98% completion",
      statusLabel: "Done",
      statusColor: "green",
      due: "May 9",
    },
    {
      title: "Offboard — Priya old role",
      subtitle: "Transition complete",
      statusLabel: "Done",
      statusColor: "green",
      assignee: { name: "HR Lead", color: "blue" },
    },
    {
      title: "Headcount report — April",
      subtitle: "Filed",
      statusLabel: "Done",
      statusColor: "green",
      due: "May 7",
    },
    {
      title: "Birthday cards sent",
      subtitle: "11 employees",
      statusLabel: "Done",
      statusColor: "green",
      assignee: { name: "Aisyah R.", color: "purple" },
    },
  ],
};

function shadeOfBlue(t: number): string {
  // Mix #E6F1FB (light) -> #185FA5 (dark) by t in [0,1]
  const a = { r: 0xe6, g: 0xf1, b: 0xfb };
  const b = { r: 0x18, g: 0x5f, b: 0xa5 };
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(mix(a.r, b.r))}${hex(mix(a.g, b.g))}${hex(mix(a.b, b.b))}`;
}

export default function HrPersonalizedDashboard({
  userName,
  userEmail,
}: HrPersonalizedDashboardProps) {
  const greetName =
    userName?.split(" ")[0] ||
    userEmail?.split("@")[0] ||
    "";

  const maxPipeline = Math.max(...pipeline.map((p) => p.count));

  return (
    <div
      style={{
        minHeight: "100%",
        background: "var(--status-neutral-bg)",
        fontFamily: fontStack,
        color: "var(--text-primary)",
      }}
    >
      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Greeting header */}
        <GreetingHeader name={greetName} style={{ padding: "8px 0 4px" }} />

        {/* Section 2: Metric cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <MetricCard
            icon="ti ti-users"
            color="blue"
            value="1,284"
            label="Total employees"
            delta="+24 this month"
            deltaUp
            deltaPositive
          />
          <MetricCard
            icon="ti ti-checkbox"
            color="green"
            value="98.2%"
            label="Attendance rate"
            delta="+0.4 vs last week"
            deltaUp
            deltaPositive
          />
          <MetricCard
            icon="ti ti-briefcase"
            color="amber"
            value="12"
            label="Open positions"
            delta="+3 this week"
            deltaUp
            deltaPositive={false}
          />
          <MetricCard
            icon="ti ti-trending-down"
            color="red"
            value="4.7%"
            label="Turnover rate"
            delta="-0.6 vs last quarter"
            deltaUp={false}
            deltaPositive
          />
        </section>

        {/* Section 3: Attendance & birthdays */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 12,
          }}
        >
          {/* Left: Attendance + Leave */}
          <div style={{ ...card, padding: 16 }}>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 12,
                }}
              >
                Attendance today
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <StatBar label="Present" value={1201} color="green" total={1284} />
                <StatBar label="Absent" value={38} color="red" total={1284} />
                <StatBar
                  label="Late check-in"
                  value={45}
                  color="amber"
                  total={1284}
                />
              </div>
            </div>
            <div
              style={{
                height: 0.5,
                background: "var(--status-track)",
                margin: "14px 0",
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 12,
                }}
              >
                Leave today
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <StatBar
                  label="Annual leave"
                  shortLabel="AL"
                  value={14}
                  color="blue"
                  total={50}
                />
                <StatBar
                  label="Medical leave"
                  shortLabel="MC"
                  value={9}
                  color="purple"
                  total={50}
                />
                <StatBar label="Other leave" value={15} color="gray" total={50} />
              </div>
            </div>
          </div>

          {/* Right: Birthdays */}
          <div style={{ ...card, padding: 16 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 14,
              }}
            >
              Birthdays this week
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {birthdays.map((b) => (
                <div
                  key={b.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Avatar name={b.name} color={b.avatarColor} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted-strong)" }}>
                      {b.dept} · {b.date}
                    </div>
                  </div>
                  <Pill
                    text={b.isToday ? `${b.badge} 🎉` : b.badge}
                    color={b.badgeColor}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 4: Hiring pipeline & people */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.7fr 1fr",
            gap: 12,
          }}
        >
          {/* Left: Hiring pipeline */}
          <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 16,
              }}
            >
              Hiring pipeline — Q2 2026
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${pipeline.length}, minmax(0, 1fr))`,
                gap: 14,
                alignItems: "end",
                height: 220,
                marginBottom: 14,
              }}
            >
              {pipeline.map((p) => {
                const h = (p.count / maxPipeline) * 170;
                return (
                  <div
                    key={p.stage}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      height: "100%",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--text-muted-strong)" }}>{p.stage}</div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {p.count}
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: h,
                        background: shadeOfBlue(p.shade),
                        borderRadius: 8,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div
              style={{
                borderTop: "0.5px solid var(--status-track)",
                paddingTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted-strong)", marginBottom: 4 }}>
                  Conversion rate
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: palette.blue.dark,
                  }}
                >
                  12.6%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted-strong)", marginBottom: 4 }}>
                  Avg. time to hire
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
                  18 days
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted-strong)", marginBottom: 4 }}>
                  Hires this quarter
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: palette.green.dark,
                  }}
                >
                  31
                </div>
              </div>
            </div>
          </div>

          {/* Right: Onboarding + Offboarding */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ ...card, padding: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 12,
                }}
              >
                Onboarding
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {onboarding.map((p) => (
                  <div
                    key={p.name}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Avatar name={p.name} color={p.avatarColor} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted-strong)" }}>
                        {p.dept} · {p.days}
                      </div>
                    </div>
                    <Pill text={p.status} color={p.statusColor} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...card, padding: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 12,
                }}
              >
                Offboarding
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {offboarding.map((p) => (
                  <div
                    key={p.name}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Avatar name={p.name} color={p.avatarColor} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted-strong)" }}>
                        {p.dept} · last day {p.lastDay}
                      </div>
                    </div>
                    <Pill text={p.daysLeft} color={p.daysLeftColor} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Kanban task board */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              Task board
            </div>
            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                border: "0.5px solid var(--status-track)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <i className="ti ti-plus" />
              Add task
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <KanbanColumn
              title="To review"
              color="purple"
              items={tasks.review}
            />
            <KanbanColumn
              title="In progress"
              color="green"
              items={tasks.progress}
            />
            <KanbanColumn
              title="Done this week"
              color="blue"
              items={tasks.done}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function KanbanColumn({
  title,
  color,
  items,
}: {
  title: string;
  color: PaletteKey;
  items: Array<{
    title: string;
    subtitle: string;
    statusLabel: string;
    statusColor: PaletteKey;
    assignee?: { name: string; color: PaletteKey };
    due?: string;
  }>;
}) {
  const c = palette[color];
  return (
    <div
      style={{
        background: c.light,
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 4px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: c.dark }}>
          {title}
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 22,
            height: 22,
            padding: "0 7px",
            borderRadius: 999,
            background: c.dark,
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {items.length}
        </span>
      </div>

      {items.map((t, idx) => (
        <div
          key={`${title}-${idx}`}
          style={{
            background: "var(--surface)",
            border: "0.5px solid var(--status-track)",
            borderRadius: 10,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.3,
              }}
            >
              {t.title}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted-strong)", marginTop: 2 }}>
              {t.subtitle}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Pill text={t.statusLabel} color={t.statusColor} />
            {t.assignee ? (
              <Avatar name={t.assignee.name} color={t.assignee.color} size={24} />
            ) : t.due ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted-strong)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <i className="ti ti-calendar" />
                {t.due}
              </div>
            ) : null}
          </div>
        </div>
      ))}

      <button
        type="button"
        style={{
          background: "transparent",
          border: "none",
          color: c.dark,
          fontSize: 12,
          fontWeight: 500,
          textAlign: "left",
          padding: "4px 4px",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <i className="ti ti-plus" />
        Add card
      </button>
    </div>
  );
}
