"use client";

// OSC integration package — shared presentational primitives. Pure SVG +
// standard Tailwind utility classes, no chart library, so the folder drops
// into OSC without new dependencies. Status colors follow the mockups:
// Completed green / Pending red / N/A yellow — never color alone (dot + label
// + count everywhere).

import * as React from "react";
import { createPortal } from "react-dom";
import type {
  ActionResult,
  FlowBucketTotals,
  FlowDrillTask,
  FlowStaffMember,
  FlowTaskRow,
  ProofRemoveHandler,
  ProofUploadHandler,
} from "./types";
import { flowBucketTotal, formatDueDate, isDueDayLockExemptRole, isPastDueDay, isFutureDueDay, type DueDateDisplay } from "./types";

/** Collapse/expand chevron (2026-08-20) — replaces the old "›" unicode
 *  glyph, which rendered as a checkmark-like shape at larger sizes in some
 *  fonts (reported at text-sm). Plain inline SVG, no icon library, per this
 *  file's own "no new dependencies" header comment. `expanded` controls the
 *  90° rotation the two callers (SectionCard, ResizableTaskList's group
 *  headers) previously did with a text-based transform. */
export function ChevronIcon({ expanded, className = "size-3" }: { expanded: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""} ${className}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
import {
  compressImageFile,
  drawTimestampWatermark,
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_DIMENSION,
  type CompressedImage,
} from "./image-compress";
import { personSolidColor } from "./palette";
import { pickerSearchClass, SinglePersonPickList } from "./recipient-picker";

/** Small overlay used for a control's transient failure message — same
 *  chrome as the hand-rolled dropdown popovers in this file (bordered white
 *  card, shadow), but red text instead of menu items. Absolutely positioned
 *  by the caller so it never disturbs row/flex layout. */
function InlineActionError({ text }: { text: string }) {
  return (
    <p className="absolute left-0 top-5 z-20 w-44 whitespace-normal rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-normal normal-case text-red-600 shadow-md dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:ring-1 dark:ring-white/10">
      {text}
    </p>
  );
}

export const BUCKET_META = [
  // `fill` (the pie wedge) is now the SAME shade in both themes for
  // Completed/Pending (2026-08-26, user feedback — a big solid dark:*-700
  // wedge read as too vivid/harsh against the dark page background,
  // compared to the soft pastel look in light mode; the user wanted the
  // wedge itself to look identical either way). This deliberately diverges
  // from BUCKET_TINT below (which still darkens the stat-chip/accordion-row
  // backgrounds in dark mode) — the wedge is the single largest, most
  // visually dominant element on the card, so its own theme-independence
  // was asked for specifically, not the whole card's. `dot` stays its own
  // fixed (non-theme-varying) shade — used for small legend/rollup dots
  // elsewhere that were never part of this donut-card color mismatch.
  { key: "completed", label: "Completed", dot: "bg-emerald-500", fill: "fill-emerald-300", stroke: "stroke-emerald-500" },
  { key: "pending", label: "Pending", dot: "bg-red-400", fill: "fill-red-300", stroke: "stroke-red-400" },
  // Already the same shade in both modes (2026-08-25, user feedback: the
  // N/A wedge/chip read as orange/brown, not yellow, when darkened) — see
  // BUCKET_TINT's own doc comment for why yellow specifically can't just
  // follow Completed/Pending's dark treatment.
  { key: "na", label: "N/A", dot: "bg-yellow-400", fill: "fill-yellow-300", stroke: "stroke-yellow-400" },
] as const;

export type BucketKey = (typeof BUCKET_META)[number]["key"];

/** Row order for the donut cards' collapsible accordion (Department/Branch
 *  and Person cards) — Pending first (2026-08-26, user request: the thing
 *  needing attention should lead), Completed second, N/A last. Deliberately
 *  separate from BUCKET_META's own array order, which stays
 *  Completed/Pending/N/A and still drives the stat-chip row above the
 *  accordion (untouched by this request) plus the pie wedges/legend. */
export const ACCORDION_BUCKET_ORDER: BucketKey[] = ["pending", "completed", "na"];

/** Background tint per bucket for donut cards' stat chips/accordion rows
 *  (PersonDonutCard, DepartmentDonutCard) — same 3-color convention as
 *  BUCKET_META's dot/stroke/fill classes, just as a soft background instead
 *  of a solid fill. Shared here (2026-08-22) so every donut-style card
 *  stays visually identical instead of drifting via separate copies.
 *  SAME shade in both themes now (2026-08-26, user feedback — after the
 *  pie wedge itself went theme-independent, the chips/rows sitting right
 *  below it still visibly darkened in dark mode, which read as
 *  inconsistent once the wedge no longer did; this went through several
 *  dark-mode-only iterations first — *-100 wash, then solid *-900, then
 *  *-700 — before landing on "just match light mode," same resolution the
 *  wedge itself reached one prompt earlier). N/A was already unified for
 *  its own separate reason (2026-08-25: a darkened yellow reads as
 *  orange/brown, not yellow, at any lightness low enough to look "dark
 *  mode" — see BUCKET_TEXT.na below for the paired dark-text fix that
 *  makes THIS true in light mode too, not just dark). */
export const BUCKET_TINT: Record<BucketKey, string> = {
  completed: "bg-emerald-300",
  pending: "bg-red-300",
  na: "bg-yellow-300",
};
/** Colored text/icon per bucket — a stat chip's number, an accordion row's
 *  chevron — matching DepartmentMembers.tsx's colored `color` token (label
 *  text stays neutral either way — only the value/icon carries the bucket
 *  color). Plain black in BOTH modes now (2026-08-26) — since BUCKET_TINT
 *  above is the same pale shade in both modes too, white text (the old
 *  dark-mode treatment, from when the chip itself was dark) would now be
 *  unreadable against it; black is simply BUCKET_TINT.na's own existing
 *  treatment extended to every bucket, since every bucket's background is
 *  now exactly as pale as N/A's always was. */
export const BUCKET_TEXT: Record<BucketKey, string> = {
  completed: "text-gray-900",
  pending: "text-gray-900",
  na: "text-gray-900",
};
export const BUCKET_SOLID: Record<BucketKey, string> = {
  completed: "bg-emerald-500",
  pending: "bg-red-400",
  na: "bg-yellow-400",
};
/** Total's own tint/text — purple. Same shade in both themes (2026-08-26),
 *  same reasoning as BUCKET_TINT above; text stays plain black in both
 *  modes too, same reasoning as BUCKET_TEXT above. */
export const TOTAL_TINT = "bg-violet-300";
export const TOTAL_TEXT = "text-gray-900";

/** Small calendar glyph — pairs with a date wherever a task shows one. */
export function CalendarIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5H14" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 1.5V4M11 1.5V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Page-level divider between major page areas (e.g. the read-only Overview
 *  grids vs. the action-oriented Details/assign area). */
export function PageSectionHeading({
  children,
  action,
  hideBorder,
}: {
  children: React.ReactNode;
  /** Right-aligned control (e.g. a date filter) — optional, most headings
   *  have none. */
  action?: React.ReactNode;
  /** Drop the bottom border (2026-08-05) — e.g. when a table with its own
   *  header row (ResizableTaskList) sits directly beneath, which already
   *  draws a border-b under ITS OWN column labels; the default border here
   *  would otherwise sit as a second, redundant-looking line above it.
   *  Bottom padding is kept either way, so spacing doesn't collapse. */
  hideBorder?: boolean;
}) {
  return (
    <h2
      className={`mt-2 flex items-center justify-between gap-3 pb-2 text-lg font-semibold text-gray-900 dark:text-slate-100 ${
        hideBorder ? "" : "border-b border-gray-200 dark:border-slate-700"
      }`}
    >
      <span>{children}</span>
      {action}
    </h2>
  );
}

/** White card with an uppercase title row and optional right-aligned action. */
export function SectionCard({
  title,
  action,
  children,
  collapsible,
  defaultCollapsed,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Adds a chevron next to the title that collapses/expands the whole
   *  card body (2026-08-19) — e.g. "Tasks I Assigned". Defaults to false
   *  (unchanged behavior) everywhere this isn't explicitly set. */
  collapsible?: boolean;
  /** Starting collapsed state when collapsible is true. Defaults to
   *  expanded. */
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(Boolean(collapsible && defaultCollapsed));
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className={`flex items-center justify-between gap-3 ${collapsed ? "" : "mb-4"}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronIcon expanded={!collapsed} className="size-2.5" />
            {title}
          </button>
        ) : (
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
            {title}
          </h3>
        )}
        {action}
      </div>
      {!collapsed && children}
    </div>
  );
}

/** 3-segment status donut (SVG stroke arcs), center = children (count or %). */
/** Solid pie chart (2026-08-22, replaced the previous hollow-ring donut) —
 *  a filled wedge per non-empty bucket, each with an outward leader line to
 *  a "LABEL count" text, matching the reference ClickUp-style pie chart's
 *  visual language (own Tailwind/dark-mode styling, not a literal copy —
 *  same precedent PersonDonutCard/DepartmentDonutCard already set). Wedges
 *  stay clickable (onSegmentClick) exactly like the ring's segments were.
 *  `children`, if provided, now renders BELOW the chart instead of
 *  overlaid in a center hole — a solid pie has no hole to overlay into —
 *  every existing call site's `children` (a %/total caption) still works
 *  unchanged, just repositioned by this component, not the caller. */
export function StatusDonut({
  totals,
  size = 120,
  onSegmentClick,
  children,
}: {
  totals: FlowBucketTotals;
  size?: number;
  /** Makes segments clickable (drill into a status bucket). */
  onSegmentClick?: (key: BucketKey) => void;
  children?: React.ReactNode;
}) {
  // No hover pop-out or tooltip (2026-08-22: tried both same day, reverted)
  // — with only 2-3 wedges in a small 92-132px chart, an "exploded" wedge on
  // hover read as the chart visually breaking apart rather than a
  // highlight, and the tooltip chip duplicated the always-visible outer
  // leader-line label and the stat boxes below it. Wedges are static;
  // hovering only gets the browser's native <title> tooltip below, same as
  // clicking still opens the drill-down.
  const total = flowBucketTotal(totals);
  const r = size / 2;

  let cumulative = 0;
  const segments = BUCKET_META.map((b) => {
    const frac = total > 0 ? totals[b.key] / total : 0;
    const startAngle = cumulative * 2 * Math.PI;
    cumulative += frac;
    // Nudge an effectively-100% segment's end angle so the arc's start and
    // end points are never identical — a single 'A' command can't draw a
    // full circle (zero-length arc), same footgun stroke-dasharray never
    // had to worry about.
    const endAngle = frac >= 0.999 ? startAngle + 2 * Math.PI - 0.0001 : cumulative * 2 * Math.PI;
    return { ...b, count: totals[b.key], frac, startAngle, endAngle };
  }).filter((s) => s.frac > 0);

  // Leader-line labels need real room outside the pie itself, in EVERY
  // direction (2026-08-22 fix) — a label pointing straight up/down needs
  // just as much clearance as one pointing left/right; an earlier version
  // only padded left/right, which silently clipped any label near 12/6
  // o'clock off the canvas.
  //
  // labelPad is a FIXED function of `size` alone — NOT of this instance's
  // actual data (2026-08-22, second fix same day: a data-dependent labelPad
  // — sized from the longest rendered label's own text, e.g. "PENDING 120"
  // needing more room than "PENDING 0" — made sibling cards in the same
  // grid render at DIFFERENT pixel footprints depending on which one had
  // the longer number, breaking the grid's visual alignment card-to-card).
  // The fixed floor (95, trimmed down 2026-08-22 — 115 made the card
  // noticeably taller than needed) covers a realistic worst case at this
  // font (a 9-char label like "Pending" + a 3-digit count, ~9px bold
  // uppercase, ~6.2px/char) so real data doesn't clip, while every card
  // using the same `size` prop always gets the exact same canvas regardless
  // of its own totals.
  const labelPad = Math.max(95, Math.round(size * 0.5));
  const cx = r + labelPad;
  const cy = r + labelPad;
  const svgW = size + labelPad * 2;
  const svgH = size + labelPad * 2;

  // Clockwise from 12 o'clock, same convention the old -90deg-rotated ring
  // visually produced.
  const point = (angle: number, radius: number) => ({
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  });

  return (
    <div className="inline-flex flex-col items-center">
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        {total === 0 ? (
          // Explicit "No tasks" empty state (2026-08-22) — a plain solid
          // outline here reads as ambiguous (blank ring vs. a genuine "0
          // tasks" state look identical at a glance, per user report).
          // Dashed stroke + a centered label makes the "nothing to show"
          // state unmistakable instead of looking like a rendering failure.
          <g>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              strokeWidth={2}
              strokeDasharray="6 5"
              className="stroke-gray-300 dark:stroke-slate-600"
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-gray-400 text-[10px] font-medium dark:fill-slate-500"
            >
              No tasks
            </text>
          </g>
        ) : (
          segments.map((s) => {
            const start = point(s.startAngle, r);
            const end = point(s.endAngle, r);
            const large = s.endAngle - s.startAngle > Math.PI ? 1 : 0;
            const wedge = `M ${cx},${cy} L ${start.x},${start.y} A ${r},${r} 0 ${large},1 ${end.x},${end.y} Z`;
            const mid = (s.startAngle + s.endAngle) / 2;
            const leaderStart = point(mid, r);
            const leaderEnd = point(mid, r + 18);
            const isRight = Math.sin(mid) >= 0;
            const labelX = leaderEnd.x + (isRight ? 4 : -4);
            return (
              <g key={s.key}>
                <path
                  d={wedge}
                  onClick={onSegmentClick ? () => onSegmentClick(s.key) : undefined}
                  className={`${s.fill} ${
                    onSegmentClick ? "cursor-pointer" : ""
                  }`}
                >
                  <title>{`${s.label}: ${s.count}`}</title>
                </path>
                <line
                  x1={leaderStart.x}
                  y1={leaderStart.y}
                  x2={leaderEnd.x}
                  y2={leaderEnd.y}
                  strokeWidth={1}
                  className="stroke-gray-300 dark:stroke-slate-600"
                />
                <text
                  x={labelX}
                  y={leaderEnd.y}
                  textAnchor={isRight ? "start" : "end"}
                  dominantBaseline="middle"
                  className="fill-gray-500 text-[9px] font-semibold uppercase tracking-wide dark:fill-white"
                >
                  {s.label} <tspan className="fill-gray-900 font-bold dark:fill-white">{s.count}</tspan>
                </text>
              </g>
            );
          })
        )}
      </svg>
      {children && <div className="-mt-2 flex flex-col items-center text-center">{children}</div>}
    </div>
  );
}

/** Legend rows next to a donut: dot + label + count + share. Clickable when
 *  onSelect is provided (same drill as clicking the donut segment). */
export function BucketLegend({
  totals,
  onSelect,
}: {
  totals: FlowBucketTotals;
  onSelect?: (key: BucketKey) => void;
}) {
  const total = flowBucketTotal(totals);
  return (
    <div className="flex flex-col gap-1">
      {BUCKET_META.map((b) => {
        const row = (
          <>
            <span className={`size-2.5 shrink-0 rounded-full ${b.dot}`} />
            <span className="text-gray-600 dark:text-slate-300">{b.label}</span>
            <span className="ml-auto font-semibold text-gray-900 dark:text-slate-100">{totals[b.key]}</span>
            <span className="w-9 text-right text-xs text-gray-400 dark:text-slate-500">
              {total > 0 ? Math.round((totals[b.key] / total) * 100) : 0}%
            </span>
          </>
        );
        return onSelect ? (
          <button
            key={b.key}
            type="button"
            onClick={() => onSelect(b.key)}
            className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            {row}
          </button>
        ) : (
          <div key={b.key} className="flex items-center gap-2 px-1 py-0.5 text-sm">
            {row}
          </div>
        );
      })}
    </div>
  );
}

/** Slim completion meter (done vs total), mockup-style. */
export function CompletionMeter({
  done,
  total,
  className = "",
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800 ${className}`}>
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const STATUS_CHIP: Record<FlowTaskRow["status"], { label: string; className: string }> = {
  DONE: { label: "Completed", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  ACTIVE: { label: "In progress", className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
  OVERDUE: { label: "Overdue", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300" },
  ESCALATED: { label: "Escalated", className: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300" },
  SKIPPED: { label: "N/A", className: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-300" },
};

export function StatusChip({ status }: { status: FlowTaskRow["status"] }) {
  const chip = STATUS_CHIP[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}
    >
      {chip.label}
    </span>
  );
}

/** Circle fill matching each status — same color convention as BUCKET_META,
 *  just a plain dot/ring rather than the bucket legend's labeled version. */
function statusCircleClasses(status: FlowTaskRow["status"]): string {
  if (status === "DONE") return "bg-emerald-500";
  if (status === "SKIPPED") return "bg-amber-400";
  return "border-2 border-red-400 bg-white dark:bg-slate-900";
}

/** Due-day lock (2026-08-05 past-day, extended 2026-08-11 to future-day,
 *  renamed from isLockedPastDay to match): a Daily task is only
 *  actionable on its OWN due day — not once it's passed, and not before
 *  it arrives either — so outside that day it can't be marked complete/
 *  N-A, have proof attached/removed, or be reopened. Mirrors the
 *  server-authoritative checks in engine/run.ts's completeBlock/
 *  skipBlock/reopenBlock and data/tasks.ts's uploadFlowTaskProof/
 *  removeFlowTaskProof (this is the disabled-UI half, not the
 *  enforcement; a request that somehow reached the server anyway would
 *  still be rejected there). Applies to every role — there's no exception
 *  for elevated viewers completing on someone else's behalf.
 *
 *  EXCEPT tasks assigned by an HOD or CEO (2026-08-19,
 *  isDueDayLockExemptRole) — those are exempt from this lock entirely,
 *  everywhere they appear (not just "HOD/CEO Assigned Task" — the same
 *  task can also show up in the recipient's own Daily section, and it
 *  must behave identically there too, since the server enforces this
 *  per-task, not per-section). */
function isLockedDueDay(task: Pick<FlowTaskRow, "cadence" | "dueAt" | "assignerRole">): boolean {
  if (isDueDayLockExemptRole(task.assignerRole)) return false;
  return task.cadence === "DAILY" && (isPastDueDay(task.dueAt) || isFutureDueDay(task.dueAt));
}

/**
 * "My Tasks" mode's status circle — click opens a small dropdown (Pending /
 * Completed / N/A, each with the matching status dot/check) instead of
 * instantly completing. Each option is disabled exactly when it's already
 * the task's current status (can't re-pick what you already are); "Pending"
 * doubles as "reopen" when the task is currently Completed/N-A, "Completed"
 * stays disabled for non-quick-completable tasks (same reason a bare circle
 * used to render gray — see assign's isQuickCompletable), and "N/A" is
 * never gated on that, matching completion/N-A's existing asymmetry.
 * Owner-only: a non-assignee viewer gets the plain, non-interactive circle,
 * same as before — this only ever renders in `hideCompleted` ("My Tasks")
 * mode, where the assignee always ALREADY is the viewer, so this check is
 * defense-in-depth, not a real gate in practice.
 */
function StatusDropdown({
  task,
  myUserId,
  onComplete,
  onSkip,
  onReopen,
}: {
  task: FlowTaskRow;
  myUserId?: string;
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  onSkip?: (runBlockId: string) => Promise<ActionResult>;
  onReopen?: (runBlockId: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  // Portal position (2026-08-05 fix): "My Tasks" rows sit inside the
  // horizontal-scroll wrapper added for the mobile table pan (bits.tsx's
  // `overflow-x-auto` on the hideCompleted table) — setting overflow-x
  // without overflow-y computes overflow-y to "auto" too per the CSS spec,
  // so this menu (previously position:absolute, a DOM child of that
  // wrapper) was getting clipped/hidden instead of floating over the row.
  // Portaling to <body> with position:fixed at the trigger's actual screen
  // coordinates escapes that ancestor's overflow entirely, same rationale
  // as this file's existing modal createPortal calls.
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);
  const isOwner = task.assigneeId === myUserId;

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(menuRef.current && menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // The menu's position:fixed coordinates are computed once on open —
    // close on scroll (capture: true catches the table's own horizontal
    // scroll container, not just window/document scroll) rather than
    // leaving a stale, visually-detached menu floating over the wrong row.
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const circle = <span className={`block size-3 rounded-full ${statusCircleClasses(task.status)}`} />;

  if (!isOwner) return circle;

  const run = async (action?: (id: string) => Promise<ActionResult>) => {
    setOpen(false);
    if (!action) return;
    setBusy(true);
    setErrorText(null);
    try {
      const result = await action(task.runBlockId);
      if (!result.ok) setErrorText(result.message);
    } finally {
      setBusy(false);
    }
  };

  // Past-day lock (2026-08-05): once locked, the WHOLE control is inert —
  // the trigger itself is disabled (can't even open the menu), regardless
  // of the task's current status. Not just canMarkDone/canMarkNA
  // individually gated — a locked task offers no status action at all.
  const locked = isLockedDueDay(task);
  const isResolved = task.status === "DONE" || task.status === "SKIPPED";
  const canReopen = Boolean(onReopen) && isResolved;
  const canMarkDone = Boolean(onComplete) && task.quickCompletable && task.status !== "DONE" && !locked;
  const canMarkNA = Boolean(onSkip) && task.status !== "SKIPPED" && !locked;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        title="Change status"
        aria-label="Change status"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || locked}
        onClick={() => {
          setErrorText(null);
          setOpen((o) => {
            const next = !o;
            if (next && triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              // Flip upward when there isn't room below (2026-08-19) — this
              // menu always renders the same fixed 3-item/2-heading layout
              // (~168px tall), so unconditionally opening downward cut
              // Completed/N-A off-screen whenever the trigger sat in the
              // bottom third of the viewport: not covered by anything,
              // just rendered past the bottom edge — reported as
              // "Completed/N-A missing" and separately misread as the ⋮
              // menu overlapping the status circle. Estimated, not
              // measured, since the menu isn't in the DOM yet at click
              // time and its content never varies per task.
              const MENU_HEIGHT_ESTIMATE = 168;
              const MENU_WIDTH = 160; // matches the menu's own w-40
              const fitsBelow = rect.bottom + 4 + MENU_HEIGHT_ESTIMATE <= window.innerHeight;
              const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - 4);
              const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
              setMenuPos({ top, left });
            }
            return next;
          });
        }}
        // Visible click affordance (2026-08-18) — previously just the bare
        // status dot with no hover feedback, which read as decoration
        // rather than a control (the "Pending" reopen option was already
        // here, just not discoverable). The hover ring/background and small
        // ▾ now signal "click to change status" the same way any other
        // dropdown trigger in this file does (e.g. RowActionsMenu's ⋮).
        className="group -m-1 flex shrink-0 items-center gap-0.5 rounded-full p-1 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-slate-700"
      >
        {circle}
        <span
          aria-hidden
          className="text-[8px] leading-none text-gray-400 group-hover:text-gray-600 dark:text-slate-500 dark:group-hover:text-slate-300"
        >
          ▾
        </span>
      </button>
      {errorText && <InlineActionError text={errorText} />}
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-30 w-40 rounded-lg border border-gray-200 bg-white py-1.5 shadow-md dark:border-slate-700 dark:bg-slate-800"
          >
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Statuses</p>
          <button
            type="button"
            role="menuitem"
            disabled={!canReopen}
            onClick={() => run(onReopen)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white dark:bg-slate-900" />
            Pending
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Closed</p>
          <button
            type="button"
            role="menuitem"
            disabled={!canMarkDone}
            title={
              !isResolved && Boolean(onComplete) && !task.quickCompletable
                ? "This task has more than one required field — open its full run view to complete it"
                : undefined
            }
            onClick={() => run(onComplete)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="flex size-2.5 shrink-0 items-center justify-center text-[10px] font-bold text-emerald-500">
              ✓
            </span>
            Completed
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canMarkNA}
            onClick={() => run(onSkip)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="size-2.5 shrink-0 rounded-full bg-amber-400" />
            N/A
          </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Compact task row (title, run, due date, status chip). Tasks synced from
 *  the Manpower Schedule get a "Scheduled" tag — visually a violet dot+label,
 *  distinct from the status-chip family so "origin" never reads as "state".
 *  The schedule is their source of truth, so there's no edit affordance
 *  here, only completion.
 *
 *  Leading status circle (left of title): filled green = Completed; filled
 *  amber = N/A; everything else is a plain hollow red circle. In
 *  `hideCompleted` ("My Tasks") mode the circle is a StatusDropdown trigger
 *  (see above) — click opens Pending/Completed/N/A instead of instantly
 *  completing. Outside that mode (the roster drill-down) the circle keeps
 *  its ORIGINAL behavior unchanged: a plain click-to-complete button when
 *  quick-completable and owned by the viewer, otherwise a static dot — that
 *  view is read-only oversight of OTHER people's work, not a personal "My
 *  Task" list, so it was deliberately left out of this round's dropdown/
 *  checkbox changes. `hideCompleted` also suppresses the status text badge
 *  (redundant once the circle/list-membership already convey it) and adds a
 *  bulk-select checkbox (rendered by ResizableTaskList's caller via
 *  `selected`/`onToggleSelect`).
 *
 *  `nameWidth`/`onResizeStart` are set only when rendered via
 *  `ResizableTaskList` (below) — the title block becomes a fixed-width
 *  "column" with a drag handle on its right edge instead of flex-filling the
 *  row, matching the reference table's resizable Name column. Omit both to
 *  keep the original flex-1 auto-fill behavior (e.g. any future standalone
 *  usage). */

/** The roster drill-down's plain click-to-complete circle (outside
 *  `hideCompleted` mode) — unchanged from before StatusDropdown existed. */
function CompleteButton({
  task,
  onComplete,
}: {
  task: FlowTaskRow;
  onComplete: (runBlockId: string) => Promise<ActionResult>;
}) {
  const [completing, setCompleting] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const complete = async () => {
    setCompleting(true);
    setErrorText(null);
    try {
      const result = await onComplete(task.runBlockId);
      if (!result.ok) setErrorText(result.message);
    } finally {
      setCompleting(false);
    }
  };
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        title="Mark complete"
        aria-label="Mark complete"
        disabled={completing}
        onClick={complete}
        className={`flex size-3 items-center justify-center rounded-full border-2 border-emerald-500 transition-colors hover:bg-emerald-500 disabled:opacity-50 ${
          completing ? "bg-emerald-500" : "bg-white dark:bg-slate-900"
        }`}
      />
      {errorText && <InlineActionError text={errorText} />}
    </span>
  );
}
/** 📎 indicator + click-to-view popup for an assigner-attached Guideline
 *  (2026-07-30): shows the SOP link (opens in a new tab) and/or the
 *  reference image (served by /api/task-manager/guideline-image/[id];
 *  click = full size in a new tab). Rendered on any task row whose task
 *  carries a guideline — the assignee's cue that reference material
 *  exists. */
function GuidelineIndicator({
  guideline,
  title,
}: {
  guideline: NonNullable<FlowTaskRow["guideline"]>;
  title: string;
}) {
  const [open, setOpen] = React.useState(false);
  const imageSrc = `/api/task-manager/guideline-image/${guideline.id}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View guideline"
        aria-label={`View guideline for ${title}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
      >
        Guideline
      </button>
      {/* Portal to <body> (2026-07-30): same completed-row opacity fix as
          ProofCell's modals — see the comment there. */}
      {open &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Guideline</h4>
                <p className="truncate text-xs text-gray-500 dark:text-slate-400">{title}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            {guideline.url && (
              <a
                href={guideline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block truncate rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-blue-600 hover:border-blue-300 hover:underline dark:border-slate-700 dark:bg-slate-700 dark:hover:border-blue-500"
              >
                🔗 {guideline.url}
              </a>
            )}
            {guideline.hasImage && (
              <a href={imageSrc} target="_blank" rel="noopener noreferrer" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt={`Guideline for ${title}`}
                  className="max-h-[60vh] w-full rounded-xl border border-gray-200 object-contain dark:border-slate-700"
                />
              </a>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Proof images are COMPRESSED client-side before upload (2026-08-01
// storage decision — see image-compress.ts: 1280px max, JPEG 75%, 2 MB
// post-compression cap mirrored by the server).

/** Server-side cap mirrored here purely for UI messaging (data/tasks.ts's
 *  own MAX_PROOFS_PER_TASK is the actual enforcement — this local copy
 *  only drives disabling further adds / the "5/5 photos attached" state
 *  before a wasted round trip; the server rejects a 6th regardless). */
const MAX_PROOFS_PER_TASK = 5;

/** Same red-text-under-content pattern as branch-package-schedule-grid.tsx's
 *  own ErrorLine (that file doesn't export it, so this is a local copy). */
function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600">{error}</p>;
}

/** Shared device check (2026-08-09) — computed once and cached at module
 *  scope, not per ProofCell instance (a page can render one per task row).
 *  User-agent + touch-points based, NOT a viewport-width breakpoint: the
 *  question is "does this device have a native camera/photo picker",
 *  which a resized desktop window answers differently than a phone even
 *  at the same pixel width. Reused for both the Proof upload layout
 *  (drop-zone + two buttons on desktop vs one combined button on mobile)
 *  and openCamera's own camera-vs-webcam-preview decision, so there's
 *  exactly one definition of "mobile" for this feature, not two that
 *  could drift apart. Must only be called client-side (never during SSR
 *  render — `navigator` doesn't exist there); callers gate this behind a
 *  useEffect or an event handler, never the render body directly. */
let cachedIsMobileDevice: boolean | null = null;
function isMobileDevice(): boolean {
  if (cachedIsMobileDevice === null) {
    cachedIsMobileDevice =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  }
  return cachedIsMobileDevice;
}

/** The "Proof" column cell (2026-07-30, multi-photo 2026-08-08, explicit
 *  Upload + completion lock 2026-08-09): assignee-uploaded completion
 *  evidence, up to MAX_PROOFS_PER_TASK photos per task, always optional
 *  (never gates the status dropdown). Owner of a proof-less row gets a ＋
 *  button; once any photo exists, EVERYONE sees a small ✓ gallery indicator
 *  that opens a panel listing every photo as thumbnails (served by
 *  /api/task-manager/proof-image/[id]) — the owner can remove any one of
 *  them individually, without affecting the rest. Rows that are neither
 *  owned nor proven show a plain dash.
 *
 *  Every "add a photo" entry point — file picker, drag-drop (desktop
 *  only), clipboard paste (desktop only), the mobile camera-or-gallery
 *  picker, the desktop getUserMedia webcam — compresses and STAGES the
 *  result locally (2026-08-09: reverses the prior "upload immediately"
 *  decision) rather than sending it; nothing reaches the server until the
 *  "Upload N photos" button is clicked, which then sends every staged
 *  photo in one batch. Staged photos count toward the cap so the user
 *  can't stage past it before uploading.
 *
 *  Layout differs by device (2026-08-09, isMobileLayout/isMobileDevice()):
 *  desktop keeps the drop-zone plus two buttons (Upload File vs. Take
 *  Photo's live webcam preview — genuinely different flows); mobile drops
 *  the drop-zone (not a mobile interaction) and collapses to ONE "Add
 *  Photo" button, since Upload File and Take Photo now open the identical
 *  native camera-or-gallery picker on mobile (no capture attribute, same
 *  underlying input) — two buttons doing the same thing would just be
 *  redundant.
 *
 *  Once `task.status === "DONE"` (Complete), both uploading and removing
 *  are locked — same mechanism as the existing due-day lock
 *  (`isLockedDueDay`), just gated on a different condition, and enforced
 *  again server-side in uploadFlowTaskProof/removeFlowTaskProof so a stale
 *  tab or direct request can't bypass it. */
function ProofCell({
  task,
  isOwned,
  onUploadProof,
  onRemoveProof,
}: {
  task: FlowTaskRow;
  isOwned: boolean;
  onUploadProof?: ProofUploadHandler;
  onRemoveProof?: ProofRemoveHandler;
}) {
  // Local overlay list: seeded from the server payload, then every
  // successful add/remove mutates it directly — same "local state is the
  // source of truth once mounted" approach the old single-proof version
  // used its localProofId overlay for, just list-shaped now. Each photo
  // has its own permanent id (never reused/replaced), so unlike the old
  // single-slot version there's no cache-busting `?v=` to carry.
  const [proofIds, setProofIds] = React.useState<string[]>(task.proofIds);
  // Staged-but-not-yet-uploaded photos (2026-08-09) — compressed locally,
  // shown as previews, sent only when uploadPending() runs. Each item
  // tracks its own error so a partial batch failure doesn't lose the rest.
  const [pending, setPending] = React.useState<
    { localId: string; image: CompressedImage; error: string | null }[]
  >([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  /** The "Proof Of Completion" panel (2026-07-30, gallery 2026-08-08): ONE
   *  surface showing every attached photo (thumbnails + remove) AND, while
   *  under the cap, the add controls — desktop gets all 4 (file picker,
   *  drag-and-drop, clipboard paste, camera capture); mobile collapses to
   *  one combined button (see isMobileLayout above). */
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  /** Which photo (by id) is shown enlarged — see the doc comment above
   *  that modal for why this is a single-photo view, not a carousel. */
  const [enlargedId, setEnlargedId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Mobile gets a simplified add-photo layout (2026-08-09): no drop-zone
  // (not a mobile interaction), one combined button instead of two (Upload
  // File and Take Photo now open the identical native picker on mobile,
  // so two buttons doing the same thing was redundant clutter). Starts
  // false so the client's first hydration render matches the server's
  // (navigator isn't available during SSR) — the effect flips it right
  // after mount, same pattern as any other client-only device check.
  const [isMobileLayout, setIsMobileLayout] = React.useState(false);
  React.useEffect(() => {
    setIsMobileLayout(isMobileDevice());
  }, []);

  // Completion lock (2026-08-09): once Complete, the attached photos are
  // the frozen record — same treatment as the past-due-day lock below, just
  // a different condition. Server-enforced too, see uploadFlowTaskProof.
  const isCompleted = task.status === "DONE";
  const atCap = proofIds.length + pending.length >= MAX_PROOFS_PER_TASK;
  const canUpload = isOwned && Boolean(onUploadProof) && !isLockedDueDay(task) && !isCompleted;
  // Same ownership/past-day/completion guards as upload, applied
  // symmetrically (2026-08-08 design decision #4) — a task whose day has
  // passed, or that's already Complete, shouldn't have its evidence
  // altered either way.
  const canRemove = isOwned && Boolean(onRemoveProof) && !isLockedDueDay(task) && !isCompleted;
  const canAddMore = canUpload && !atCap && !uploading;

  /** Stages one compressed image locally (2026-08-09: explicit-Upload
   *  redesign) — nothing reaches the server until uploadPending() runs. */
  const addFile = async (file: File) => {
    if (!canAddMore) return;
    setError(null);
    // Compress BEFORE staging — the full-res original never leaves the
    // browser. watermark:true (2026-08-09) — this is Proof of Completion,
    // not the shared guideline-attachment path; see compressImageFile's
    // own doc comment for why the option isn't just always-on.
    const result = await compressImageFile(file, { watermark: true });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPending((prev) => [...prev, { localId: crypto.randomUUID(), image: result.image, error: null }]);
  };

  const removePending = (localId: string) => {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  };

  /** The "Upload N photos" button: sends every staged photo SEQUENTIALLY,
   *  not in parallel — the server's 5-photo cap is a plain count-then-
   *  create with a documented, accepted one-photo race tolerance (see
   *  MAX_PROOFS_PER_TASK's comment in data/tasks.ts); firing a whole batch
   *  at once would let that same race compound into a worse overshoot.
   *  Each photo succeeds or fails independently: a failure leaves that one
   *  photo staged with its own inline error (so it stays retry-able by
   *  clicking Upload again) while the batch continues to the next photo —
   *  mirrors how a failed remove never touches the rest of the gallery.
   *  `canAddMore` being false while `uploading` is true prevents new items
   *  from being staged mid-batch, so the loop below never races new adds. */
  const uploadPending = async () => {
    if (!onUploadProof || pending.length === 0) return;
    setUploading(true);
    for (const item of pending) {
      try {
        const result = await onUploadProof(task.runBlockId, {
          mime: item.image.mime,
          dataBase64: item.image.dataBase64,
        });
        if (result.ok) {
          setProofIds((prev) => [...prev, result.proofId]);
          setPending((prev) => prev.filter((p) => p.localId !== item.localId));
        } else {
          setPending((prev) =>
            prev.map((p) => (p.localId === item.localId ? { ...p, error: result.message } : p)),
          );
        }
      } catch {
        setPending((prev) =>
          prev.map((p) =>
            p.localId === item.localId
              ? { ...p, error: "Upload failed — check your connection and try again." }
              : p,
          ),
        );
      }
    }
    setUploading(false);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void addFile(file);
  };

  const handleRemove = async (proofId: string) => {
    if (!onRemoveProof) return;
    setRemovingId(proofId);
    setRemoveError(null);
    try {
      const result = await onRemoveProof(proofId);
      if (result.ok) {
        setProofIds((prev) => prev.filter((id) => id !== proofId));
        setEnlargedId((cur) => (cur === proofId ? null : cur));
      } else {
        setRemoveError(result.message);
      }
    } catch {
      setRemoveError("Remove failed — check your connection and try again.");
    } finally {
      setRemovingId(null);
    }
  };

  // Closing the panel only clears stale errors — `pending` deliberately
  // survives close/reopen (2026-08-09: staged photos are real, meaningful
  // state now that Upload is a separate step, not something to discard just
  // because the panel was closed). The Upload button itself re-checks
  // canUpload every render, so a task completed elsewhere while photos sat
  // staged still locks correctly next time this panel opens.
  React.useEffect(() => {
    if (!panelOpen) {
      setError(null);
      setRemoveError(null);
    }
  }, [panelOpen]);

  // ---- "Take Photo" (2026-07-30 fix; camera-forcing removed 2026-08-08;
  // mobile branch removed 2026-08-09) — desktop-only now. Mobile gets its
  // own single combined "Add Photo" button below (isMobileLayout) that
  // clicks inputRef directly; openCamera is only ever wired to the desktop
  // "Take Photo" button, so it no longer needs its own mobile detection or
  // a separate cameraRef input — it goes straight to the in-panel webcam
  // preview via getUserMedia. getUserMedia needs a secure context (HTTPS
  // or localhost).
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  const openCamera = async () => {
    setCameraError(null);
    // On failure: SHOW the reason and stay in the panel — auto-opening the
    // file picker here made it look like Take Photo "was" the picker (the
    // original reported bug); the Upload file button is right next to it.
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera needs a secure connection (HTTPS) — use Upload file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError(
        "Webcam unavailable or permission denied (check the camera icon in the address bar) — use Upload file instead.",
      );
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    // Captured DIRECTLY at the compressed profile (2026-08-01): scaled to
    // the shared max dimension and encoded once at the shared JPEG
    // quality — no full-res intermediate, no double re-encode.
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    // watermark (2026-08-09) — same shared helper compressImageFile uses,
    // this path is always Proof of Completion (the desktop webcam capture
    // has no other caller), so it's unconditional here, no opt-in needed.
    if (ctx) drawTimestampWatermark(ctx, canvas.width, canvas.height);
    stopCamera();
    // Stages (2026-08-09) like every other entry point — capturing the
    // frame is no longer itself the "send" action, Upload is.
    const previewUrl = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
    const dataBase64 = previewUrl.slice(previewUrl.indexOf(",") + 1);
    const bytes = Math.ceil((dataBase64.length * 3) / 4);
    setPending((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), image: { mime: "image/jpeg", dataBase64, previewUrl, bytes }, error: null },
    ]);
  };

  // Wire the stream to the <video> once it's mounted; stop the webcam
  // whenever the panel closes (Esc/click-outside included) or the row
  // unmounts — never leave the camera light on.
  React.useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);
  React.useEffect(() => {
    if (!panelOpen && streamRef.current) stopCamera();
  }, [panelOpen, stopCamera]);
  React.useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // While the panel is open: Ctrl/Cmd+V anywhere attaches the clipboard
  // image (screenshot-paste workflow), Escape closes. Document-level so
  // the user doesn't have to focus anything first.
  React.useEffect(() => {
    if (!panelOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void addFile(file);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  return (
    <span className="relative flex shrink-0 items-center justify-center">
      {/* Single hidden input now (2026-08-09) — the separate cameraRef
          input was only ever clicked from openCamera's old mobile branch,
          which no longer exists (mobile's own "Add Photo" button below
          clicks this same input directly; desktop's "Take Photo" goes to
          the getUserMedia preview instead, never touches this input). No
          capture attribute (removed 2026-08-08) — see openCamera's doc
          comment for why omitting it matters. */}
      {canUpload && (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFile}
        />
      )}
      {proofIds.length > 0 ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          title={`View proof (${proofIds.length}/${MAX_PROOFS_PER_TASK})`}
          aria-label={`View proof for ${task.blockTitle} (${proofIds.length} photo${proofIds.length === 1 ? "" : "s"})`}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-50 px-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
        >
          {proofIds.length > 1 ? `✓ ${proofIds.length}` : "✓"}
        </button>
      ) : canUpload ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => {
            setError(null);
            setPanelOpen(true);
          }}
          title="Attach Proof Of Completion — drop, paste, upload, or take a photo"
          aria-label={`Attach proof of completion for ${task.blockTitle}`}
          className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-sm leading-none text-gray-400 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-500 dark:hover:border-blue-500 dark:hover:text-blue-400"
        >
          {uploading ? "…" : "＋"}
        </button>
      ) : (
        <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
      )}
      {/* Both panels render through a PORTAL to <body> (2026-07-30 fix):
          completed rows carry opacity-60, and CSS opacity on an ancestor
          dims even position:fixed descendants — rendered in place, the
          whole panel (white card included) went see-through. */}
      {panelOpen &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPanelOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Proof Of Completion</h4>
                <p className="truncate text-xs text-gray-500 dark:text-slate-400">{task.blockTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            {/* Gallery (2026-08-08): every attached photo, individually
                removable by the owner without disturbing the rest. Clicking
                a thumbnail opens a single enlarged view below. */}
            {proofIds.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {proofIds.map((id) => (
                  <div key={id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setEnlargedId(id)}
                      title="View photo"
                      aria-label={`View proof photo for ${task.blockTitle}`}
                      className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-700"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/task-manager/proof-image/${id}`}
                        alt={`Proof for ${task.blockTitle}`}
                        className="size-16 object-cover"
                      />
                    </button>
                    {canRemove && (
                      <button
                        type="button"
                        disabled={removingId === id}
                        onClick={() => void handleRemove(id)}
                        title="Remove photo"
                        aria-label="Remove this photo"
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold leading-none text-gray-400 opacity-0 hover:border-red-300 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 [@media(hover:none)]:opacity-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
                      >
                        {removingId === id ? "…" : "×"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <ErrorLine error={removeError} />

            {/* Staged photos (2026-08-09): compressed but not yet sent —
                each has its own discard × (pure local removal, nothing to
                undo server-side) and its own error if a previous Upload
                attempt for it failed; failed items stay here, retry-able
                by clicking Upload again. */}
            {pending.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">Ready to upload</p>
                <div className="flex flex-wrap gap-2">
                  {pending.map((p) => (
                    <div key={p.localId} className="group relative">
                      <div className="block size-16 overflow-hidden rounded-lg border border-dashed border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.image.previewUrl}
                          alt="Photo staged for upload"
                          className="size-16 object-cover"
                        />
                      </div>
                      {/* disabled={uploading} blocks discard on every staged
                          item while the batch is running, not just the one
                          currently in flight — uploading is one global flag,
                          not per-item. Accepted: batches are small (≤5) and
                          each item's round trip is quick. */}
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => removePending(p.localId)}
                        title="Discard"
                        aria-label="Discard this photo before uploading"
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold leading-none text-gray-400 opacity-0 hover:border-red-300 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 [@media(hover:none)]:opacity-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
                      >
                        ×
                      </button>
                      {p.error && (
                        <p className="mt-1 w-16 text-[10px] leading-tight text-red-600">{p.error}</p>
                      )}
                    </div>
                  ))}
                </div>
                {/* Gated on canUpload, not just pending.length (2026-08-09
                    fix): a photo can be staged, then the task marked
                    Complete from elsewhere before Upload is clicked — the
                    button must disappear along with everything else the
                    completion lock hides, not stay live only to be
                    rejected server-side. Discard above stays unconditional
                    since it's a pure local action with no server effect. */}
                {canUpload ? (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void uploadPending()}
                    className="mt-2 w-full rounded-full bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading
                      ? "Uploading…"
                      : `Upload ${pending.length} photo${pending.length === 1 ? "" : "s"}`}
                  </button>
                ) : isCompleted && isOwned ? (
                  <p className="mt-2 text-center text-[11px] text-gray-400 dark:text-slate-500">
                    🔒 Task is complete — these can no longer be uploaded.
                  </p>
                ) : null}
              </div>
            )}

            {cameraOpen ? (
              <>
                {/* Live desktop webcam preview (getUserMedia) — 📸 draws
                    the current frame to a canvas and uploads it as JPEG. */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-video w-full rounded-xl bg-black object-cover"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={capturePhoto}
                    className="flex-1 rounded-full bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    📸 Capture
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : canUpload && atCap ? (
              <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-400">
                {MAX_PROOFS_PER_TASK}/{MAX_PROOFS_PER_TASK} photos attached or staged — remove one to
                add another.
              </p>
            ) : canUpload && isMobileLayout ? (
              // Mobile (2026-08-09): no drop-zone (not a mobile interaction
              // pattern) and one combined button, not two — Upload File and
              // Take Photo now open the identical native picker on mobile
              // (same input, no capture attribute), so a second button
              // doing the same thing would just be redundant clutter.
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                ➕ Add Photo
              </button>
            ) : canUpload ? (
              // Desktop: drop-zone/paste (real interaction patterns here)
              // plus two genuinely different buttons — Upload File opens a
              // plain file dialog, Take Photo opens the in-panel getUserMedia
              // webcam preview (openCamera), nothing else reaches that.
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void addFile(file);
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    dragOver ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/30" : "border-gray-300 bg-gray-50 dark:border-slate-600 dark:bg-slate-700"
                  }`}
                >
                  <span className="text-xl" aria-hidden>
                    🖼️
                  </span>
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-300">Drop an Image Here</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">or Paste It (Ctrl+V)</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
                  >
                    📁 Upload File
                  </button>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void openCamera()}
                    className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
                  >
                    📷 Take Photo
                  </button>
                </div>
              </>
            ) : isCompleted && isOwned ? (
              <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-400">
                🔒 Task is complete — photos are locked.
              </p>
            ) : null}
            {cameraError && <p className="mt-2 text-xs text-amber-600">{cameraError}</p>}
            <ErrorLine error={error} />
            {canUpload && !atCap && !cameraOpen && (
              <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-500">
                PNG / JPEG / WebP · photos are auto-compressed (max 1280px) ·{" "}
                {proofIds.length}/{MAX_PROOFS_PER_TASK} attached
                {pending.length > 0 ? `, ${pending.length} staged` : ""}
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
      {/* Single enlarged photo (2026-08-08): deliberately NOT a next/prev
          carousel — the panel above already lists every photo as
          thumbnails, so "enlarge one" only needs to show that one photo
          plus its own Remove button; a full carousel here would just
          duplicate the panel's own navigation for little real benefit. */}
      {enlargedId &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEnlargedId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Proof</h4>
                <p className="truncate text-xs text-gray-500 dark:text-slate-400">{task.blockTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setEnlargedId(null)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <a
              href={`/api/task-manager/proof-image/${enlargedId}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full size"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/task-manager/proof-image/${enlargedId}`}
                alt={`Proof for ${task.blockTitle}`}
                className="max-h-[60vh] w-full rounded-xl border border-gray-200 object-contain dark:border-slate-700"
              />
            </a>
            {canRemove && (
              <button
                type="button"
                disabled={removingId === enlargedId}
                onClick={() => {
                  if (enlargedId) void handleRemove(enlargedId);
                }}
                className="mt-3 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-900/30 dark:hover:text-red-400"
              >
                {removingId === enlargedId ? "Removing…" : "Remove photo"}
              </button>
            )}
            <ErrorLine error={removeError} />
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Row-level "⋮" actions menu (2026-08-15) — a small popover trigger
 *  currently holding exactly one action ("Assign to Others"), replacing
 *  what used to be a persistent inline button in space-constrained rows
 *  (EntityCardOverview's card grid, which can require horizontal scroll to
 *  reach a right-aligned button). Only rendered where a caller opts in via
 *  TaskRowLine's `reassignAsMenu` prop — elsewhere (e.g. "My Tasks"
 *  personal lists) the trigger stays a plain button, unchanged. Same
 *  portal/outside-click/Escape pattern as StatusDropdown above, for the
 *  same reason: rows can sit inside a scrolling ancestor (card bodies use
 *  max-h-80 overflow-auto), which would clip a plain absolutely-positioned
 *  popover instead of floating it over the row. Exported so
 *  entity-card-overview.tsx's Type-sort table (which renders its own rows,
 *  not through TaskRowLine) can reuse the identical trigger/menu. */
export function RowActionsMenu({ onAssignToOthers }: { onAssignToOthers: () => void }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(menuRef.current && menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next && triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              // Flip upward when there isn't room below (2026-08-19) — same
              // viewport-overflow fix as StatusDropdown's own menu, same
              // fixed single-item content so the estimate is safe.
              const MENU_HEIGHT_ESTIMATE = 56;
              const fitsBelow = rect.bottom + 4 + MENU_HEIGHT_ESTIMATE <= window.innerHeight;
              const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - 4);
              setMenuPos({ top, left: rect.right - 160 });
            }
            return next;
          });
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      >
        ⋮
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-30 w-40 rounded-lg border border-gray-200 bg-white py-1.5 shadow-md dark:border-slate-700 dark:bg-slate-800"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAssignToOthers();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Assign to Others
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Click-to-edit Due Date cell (2026-08-19) — ONLY used by TaskRowLine when
 *  its caller passes `onDueAtChange` (currently: "Tasks I Assigned"/"CEO
 *  Assigned Task" only). Click reveals a native date input; picking a date
 *  preserves the task's existing time-of-day (only the calendar date
 *  changes, same "same time, different day" convention the recurrence
 *  engine's nextWeeklyDueAt uses) and calls the handler. busy/errorText
 *  mirrors StatusDropdown's own local-state pattern elsewhere in this file
 *  (same InlineActionError component) for a consistent feel. */
function EditableDueDate({
  task,
  dueDisplay,
  onDueAtChange,
}: {
  task: FlowTaskRow;
  dueDisplay: DueDateDisplay | null;
  onDueAtChange: (runBlockId: string, newDueAtIso: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const dateValue = task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : "";

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.value; // "YYYY-MM-DD"
    if (!picked) return;
    setBusy(true);
    setErrorText(null);
    const [y, m, d] = picked.split("-").map(Number);
    const next = task.dueAt ? new Date(task.dueAt) : new Date();
    next.setUTCFullYear(y, m - 1, d);
    const result = await onDueAtChange(task.runBlockId, next.toISOString());
    setBusy(false);
    if (result.ok) setEditing(false);
    else setErrorText(result.message);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 truncate text-left text-xs hover:underline decoration-dotted"
        style={{ width: DUE_COL_WIDTH }}
        title="Click to change the due date"
      >
        {dueDisplay ? (
          <span className={dueDisplay.className}>{dueDisplay.text}</span>
        ) : (
          <span className="text-gray-300 dark:text-slate-600">—</span>
        )}
      </button>
    );
  }

  return (
    <span className="relative shrink-0" style={{ width: DUE_COL_WIDTH }}>
      <input
        type="date"
        autoFocus
        disabled={busy}
        defaultValue={dateValue}
        onChange={handleChange}
        onBlur={() => {
          if (!busy) setEditing(false);
        }}
        className="w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      />
      {errorText && <InlineActionError text={errorText} />}
    </span>
  );
}

export function TaskRowLine({
  task,
  myUserId,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  nameWidth,
  proofWidth,
  assignerWidth,
  onResizeStart,
  hideCompleted,
  selected,
  onToggleSelect,
  tree,
  hideDueDate,
  blankDueDate,
  hideStatusChip,
  hideAssignee,
  assigneeSource,
  onDueAtChange,
  reassign,
  reassignAnyOwner,
  reassignAsMenu,
}: {
  task: FlowTaskRow;
  /** The VIEWER's own user id — see StatusOverviewCard. */
  myUserId?: string;
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  /** "N/A" in the status dropdown — unlike onComplete, not gated on
   *  quickCompletable (marking N/A never captures field values, so it
   *  applies to any non-terminal task of the viewer's own). */
  onSkip?: (runBlockId: string) => Promise<ActionResult>;
  /** "Pending" in the status dropdown, on an already-Completed/N-A task
   *  (reopen). Omit to disable reopening (option stays but is disabled). */
  onReopen?: (runBlockId: string) => Promise<ActionResult>;
  /** The Proof column's upload action — see ProofCell. Omit to make every
   *  proof cell view-only (the gallery indicator still shows where proof
   *  exists). */
  onUploadProof?: ProofUploadHandler;
  /** The Proof gallery's per-photo remove action (2026-08-08) — see
   *  ProofCell. Omit to make every existing photo non-removable (view-only,
   *  same as omitting onUploadProof does for adding). */
  onRemoveProof?: ProofRemoveHandler;
  /** Column widths (2026-07-30): a number OR a CSS length/var() string —
   *  ResizableTaskList passes "var(--tm-col-*)" so a header drag updates
   *  every row without re-rendering them (see its startResize).
   *  undefined = the pre-table fallback layout (title flex-fills). */
  nameWidth?: number | string;
  proofWidth?: number | string;
  assignerWidth?: number | string;
  onResizeStart?: (e: React.PointerEvent) => void;
  /** "My Tasks" personal-list mode — see doc comment above. */
  hideCompleted?: boolean;
  /** Bulk-select checkbox state — only rendered in hideCompleted mode, for
   *  the viewer's own rows, and only when the caller (ResizableTaskList)
   *  provides onToggleSelect. */
  selected?: boolean;
  onToggleSelect?: (runBlockId: string) => void;
  /** Main Task ↔ Subtask tree slot (2026-07-30, table mode only; omitted =
   *  list has no subtasks, layout unchanged): "parent" renders the ▾/▸
   *  chevron + count badge; "flat" reserves the chevron's width so circles
   *  stay aligned; "child" indents the row (and shaves the indent off the
   *  Task column so Proof/Assignee/Due Date stay aligned). */
  tree?:
    | { kind: "parent"; count: number; expanded: boolean; onToggle: () => void }
    | { kind: "flat" }
    | { kind: "child" };
  /** Suppress the Due Date display entirely, both the fixed hideCompleted
   *  column and the free-form badge (2026-08-13, EntityCardOverview's card
   *  rows — a plain checklist shouldn't show a due-date column). */
  hideDueDate?: boolean;
  /** Keep the fixed-width Due Date column (and its header, rendered by the
   *  caller) but show no date value in it — a blank cell, not even a dash
   *  (2026-08-15, EntityCardOverview's Daily section: the date is implied
   *  by the section itself, so showing it per-row is redundant, but the
   *  column still needs to reserve its width for the header above to align
   *  with). Distinct from hideDueDate, which drops the column entirely
   *  (used where there's no Due Date header at all). Ignored when
   *  hideDueDate is also set (that one wins — no column, nothing to blank). */
  blankDueDate?: boolean;
  /** Suppress the status text badge (Completed/Pending/In progress/etc.) —
   *  only relevant outside hideCompleted mode, which never renders it
   *  anyway (2026-08-13, same EntityCardOverview motivation as
   *  hideDueDate). */
  hideStatusChip?: boolean;
  /** Suppress the Assignee column entirely (2026-08-15, EntityCardOverview's
   *  card rows) — only relevant in hideCompleted mode, which is the only
   *  mode that renders it at all. Every row in one of these cards is
   *  already the CARD's owner's own task, so an "assigned by" column is
   *  redundant with the card header. */
  hideAssignee?: boolean;
  /** Which name the Assignee column shows (2026-08-19): "assigner" (default,
   *  unchanged everywhere existing callers already work) is who assigned
   *  the task TO the viewer — the personal "My Tasks" meaning. "assignee"
   *  is who the task is assigned TO — for "Tasks I Assigned"/"CEO Assigned
   *  Task", where the viewer IS the assigner on every row (so assignerName
   *  is always undefined/redundant there) and the useful thing to show is
   *  who they delegated it to, from task.assigneeName (see FlowDrillTask). */
  assigneeSource?: "assigner" | "assignee";
  /** Editable Due Date (2026-08-19), scoped ONLY to "Tasks I Assigned"/"CEO
   *  Assigned Task" — NOT a general TaskRowLine capability, deliberately:
   *  every other Daily/Monthly/roster list's due date is either fixed by
   *  the recurrence engine or the reader isn't the task's assigner. When
   *  provided (and hideCompleted mode), clicking the Due Date cell reveals
   *  a native date input; on change, calls this with the new date at the
   *  SAME time-of-day the task's dueAt already had (see EditableDueDate). */
  onDueAtChange?: (runBlockId: string, newDueAtIso: string) => Promise<ActionResult>;
  /** "Assign to Others" self-service handoff (2026-08-13): when provided
   *  and this row is the viewer's own pending task, renders a trigger that
   *  opens the same inline ReassignPicker the manager-oversight
   *  EntityDrillModal already uses. reassignFlowTask itself re-checks
   *  authorization (self-service is scoped server-side to same department/
   *  branch) — this prop only controls whether the trigger renders. */
  reassign?: ReassignControl;
  /** Manager mode (2026-08-15): let the reassign trigger appear on ANY
   *  pending row, not just the viewer's own — for View All card grids where
   *  an authorized manager (ADMIN/ELEVATED_DEPT_SITE — the caller decides
   *  who qualifies) can hand off someone else's task. reassignFlowTask
   *  (data/tasks.ts) already supports this server-side for ADMIN/OPS/HOD/
   *  elevated dept-site regardless of what the UI shows — this prop only
   *  controls whether the trigger RENDERS for a non-owned row; the server
   *  re-checks the actor's role on every call either way. */
  reassignAnyOwner?: boolean;
  /** Render the reassign trigger as a "⋮" icon + popover menu (RowActionsMenu
   *  above) instead of the default persistent "Assign to Others" button
   *  (2026-08-15) — opt-in per caller, e.g. EntityCardOverview's card rows
   *  (space-constrained, needs horizontal scroll to reach a right-aligned
   *  button); "My Tasks" personal lists leave this unset and keep the plain
   *  button. Ignored when `reassign` isn't provided or the row isn't
   *  reassignable (same `canReassign` gate either way). */
  reassignAsMenu?: boolean;
}) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const dueDisplay = formatDueDate(due);
  const isOwned = Boolean(myUserId) && task.assigneeId === myUserId;
  const canComplete = Boolean(onComplete) && task.quickCompletable && isOwned && !isLockedDueDay(task);
  const canReassign =
    Boolean(reassign) && (isOwned || reassignAnyOwner) && task.status !== "DONE" && task.status !== "SKIPPED";
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const reassignContainerRef = React.useRef<HTMLDivElement>(null);

  // Auto-close the ReassignPicker on an outside click/tap or Escape
  // (2026-08-15) — previously the only way to close it was to reopen the
  // "Assign to Others" trigger and toggle it off again, same friction the
  // ⋮ menu itself doesn't have (RowActionsMenu already closes on outside
  // click). Scoped to THIS row's own wrapper (reassignContainerRef, set on
  // the outer <div> below, which contains both the trigger and the picker)
  // so clicking a DIFFERENT row's trigger doesn't get swallowed as "outside".
  React.useEffect(() => {
    if (!reassignOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (reassignContainerRef.current && !reassignContainerRef.current.contains(e.target as Node)) {
        setReassignOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReassignOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [reassignOpen]);

  // Subtask rows indent by one slot (20px spacer + the 12px flex gap) and
  // shave that off the Task column so Proof/Assignee/Due Date columns stay
  // exactly where the header puts them.
  const CHILD_INDENT = 32;
  const isChild = tree?.kind === "child";
  const effectiveNameWidth =
    nameWidth === undefined
      ? undefined
      : isChild
        ? typeof nameWidth === "number"
          ? nameWidth - CHILD_INDENT
          : `calc(${nameWidth} - ${CHILD_INDENT}px)`
        : nameWidth;

  return (
    <div ref={reassignContainerRef}>
    <div
      className={`group flex items-center gap-3 py-2.5 [&:has(button[aria-expanded="true"])]:relative [&:has(button[aria-expanded="true"])]:z-30 ${
        hideCompleted && (task.status === "DONE" || task.status === "SKIPPED") ? "opacity-60" : ""
      }`}
    >
      {/* Hover-to-reveal (2026-07-30): the checkbox always OCCUPIES its
          slot (no layout shift) but is invisible until the row is hovered
          or keyboard-focused — except a CHECKED box, which stays visible.
          Touch devices (2026-07-31): no hover exists, so the checkbox is
          ALWAYS visible there ([@media(hover:none)]). */}
      {hideCompleted && isOwned && onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onToggleSelect(task.runBlockId)}
          aria-label={`Select ${task.blockTitle}`}
          className={`size-4 shrink-0 rounded border-gray-300 accent-blue-600 transition-opacity dark:border-slate-600 ${
            selected
              ? "opacity-100"
              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          }`}
        />
      )}
      {/* No checkbox (read-only viewer, e.g. the member detail drill)?
          Reserve its slot anyway (2026-08-01) — the header always reserves
          it, so skipping it here shifted every column ~28px left and made
          the Task resize divider look broken/crooked. */}
      {hideCompleted && !(isOwned && onToggleSelect) && (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      {/* Tree slot (see the `tree` prop): chevron on parents, matching
          spacer on subtask-less rows, spacer + indent on subtask rows.
          (No aria-expanded on the chevron — the row's
          [&:has(button[aria-expanded])] z-index trick is reserved for the
          dropdown popovers.) */}
      {tree &&
        (tree.kind === "parent" ? (
          <button
            type="button"
            onClick={tree.onToggle}
            title={tree.expanded ? "Collapse subtasks" : "Expand subtasks"}
            aria-label={`${tree.expanded ? "Collapse" : "Expand"} subtasks of ${task.blockTitle}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-base leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {tree.expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        ))}
      {/* Subtask nesting guide (2026-07-31): the indent slot draws a
          vertical connector line under the parent, so the hierarchy reads
          at a glance even in a long expanded group. */}
      {isChild && (
        <span className="flex w-5 shrink-0 justify-center self-stretch" aria-hidden>
          <span className="w-px bg-gray-200 dark:bg-slate-700" />
        </span>
      )}
      {hideCompleted ? (
        <StatusDropdown task={task} myUserId={myUserId} onComplete={onComplete} onSkip={onSkip} onReopen={onReopen} />
      ) : task.status === "DONE" ? (
        <span className="size-3 shrink-0 rounded-full bg-emerald-500" />
      ) : task.status === "SKIPPED" ? (
        <span className="size-3 shrink-0 rounded-full bg-amber-400" />
      ) : canComplete ? (
        <CompleteButton task={task} onComplete={onComplete!} />
      ) : (
        <span className="size-3 shrink-0 rounded-full border-2 border-red-300 bg-white dark:bg-slate-900" />
      )}
      <div
        className={`relative min-w-0 ${effectiveNameWidth === undefined ? "flex-1" : "shrink-0"}`}
        style={effectiveNameWidth === undefined ? undefined : { width: effectiveNameWidth }}
      >
        <div className="flex min-w-0 items-center gap-1.5 pr-2">
          <p
            className={`min-w-0 text-sm font-semibold ${
              task.status === "DONE" ? "text-gray-400 line-through" : "text-gray-900 dark:text-slate-100"
            }`}
          >
            {task.blockTitle}
          </p>
          {tree?.kind === "parent" && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-slate-700 dark:text-slate-400">
              {tree.count}
            </span>
          )}
          {task.fromSchedule && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:bg-violet-900 dark:text-violet-300">
              <span className="size-1 rounded-full bg-violet-500" />
              Scheduled
            </span>
          )}
          {task.guideline && (
            <GuidelineIndicator guideline={task.guideline} title={task.blockTitle} />
          )}
        </div>
        {onResizeStart && (
          <div
            onPointerDown={onResizeStart}
            title="Drag to resize"
            // -top-2.5/-bottom-2.5 (2026-08-19, was top-0 h-full): this div's
            // own height used to be just the Task title's line height — the
            // wrapper it's positioned against (the parent "relative min-w-0"
            // div) is only as tall as its own content, not the row's full
            // py-2.5-padded height, so the line stopped short of the row's
            // actual boundaries and left a visible gap between one row's
            // segment and the next. Stretching top/bottom by py-2.5's own
            // 10px (removing the conflicting h-full below) extends this
            // div's height to cover the row's FULL allocated space instead,
            // so consecutive rows' segments now meet with no gap — reads as
            // one continuous line down the table instead of disconnected
            // dashes.
            className="absolute -right-1.5 -top-2.5 -bottom-2.5 flex w-3 cursor-col-resize touch-none items-center justify-center"
          >
            <div className="h-full w-px bg-gray-200 hover:w-0.5 hover:bg-blue-400 dark:bg-slate-700" />
          </div>
        )}
      </div>
      {/* "Proof" column (2026-07-30) — personal My Tasks lists only
          (hideCompleted mode); sits between the Task column and Assigned
          by. Width tracks the header's drag handle. */}
      {hideCompleted && (
        <span className="flex shrink-0 justify-center" style={{ width: proofWidth ?? 40 }}>
          <ProofCell task={task} isOwned={isOwned} onUploadProof={onUploadProof} onRemoveProof={onRemoveProof} />
        </span>
      )}
      {/* "Assignee" column (2026-07-30) — personal My Tasks lists only
          (hideCompleted mode). Plain name only — the column header gives
          the context, so no per-row prefix. */}
      {hideCompleted && !hideAssignee && (
        <span
          className={`truncate text-xs text-gray-500 dark:text-slate-400 ${
            assignerWidth === undefined ? "min-w-0 flex-1" : "shrink-0"
          }`}
          style={assignerWidth === undefined ? undefined : { width: assignerWidth }}
        >
          {(assigneeSource === "assignee" ? task.assigneeName : task.assignerName) ?? (
            <span className="text-gray-300 dark:text-slate-600">—</span>
          )}
        </span>
      )}
      {/* Due Date: in table mode a FIXED column (constant width/position,
          always rendered — dash when no due date); outside the table the
          original content-sized badge. Suppressed entirely by hideDueDate
          (2026-08-13, EntityCardOverview's plain-checklist cards). Value
          blanked by blankDueDate instead (2026-08-15, same caller's Daily
          section — a date filter already sits at the top of the page, so a
          per-row date is redundant there): in hideCompleted mode the fixed-
          width cell stays (empty) for column/header alignment; in the
          free-form-badge mode (read-only OTHER-person cards, 2026-08-15
          fix — this branch was missed the first time blankDueDate was
          added, so those cards kept showing the badge) there's no column
          to preserve, so the badge just doesn't render at all. */}
      {!hideDueDate &&
        !blankDueDate &&
        (hideCompleted ? (
          onDueAtChange ? (
            <EditableDueDate task={task} dueDisplay={dueDisplay} onDueAtChange={onDueAtChange} />
          ) : (
            <span className="shrink-0 truncate text-xs" style={{ width: DUE_COL_WIDTH }}>
              {dueDisplay ? (
                <span className={dueDisplay.className}>{dueDisplay.text}</span>
              ) : (
                <span className="text-gray-300 dark:text-slate-600">—</span>
              )}
            </span>
          )
        ) : (
          dueDisplay && (
            <span className={`shrink-0 text-xs ${dueDisplay.className}`}>{dueDisplay.text}</span>
          )
        ))}
      {!hideDueDate && blankDueDate && hideCompleted && (
        <span className="shrink-0" style={{ width: DUE_COL_WIDTH }} aria-hidden />
      )}
      {!hideCompleted && !hideStatusChip && <StatusChip status={task.status} />}
      {canReassign && reassignAsMenu ? (
        <RowActionsMenu onAssignToOthers={() => setReassignOpen((o) => !o)} />
      ) : (
        canReassign && (
          <button
            type="button"
            onClick={() => setReassignOpen((o) => !o)}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              reassignOpen
                ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/40 dark:text-blue-300"
                : "border-gray-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-blue-900/40"
            }`}
          >
            Assign to Others
          </button>
        )
      )}
    </div>
    {canReassign && reassign && reassignOpen && (
      <ReassignPicker
        staff={reassign.staff}
        currentAssigneeId={task.assigneeId}
        onPick={async (userId) => {
          const r = await reassign.action(task.runBlockId, userId);
          if (r.ok) setReassignOpen(false);
          return r;
        }}
      />
    )}
    </div>
  );
}

/** Exported (2026-08-15) — EntityCardOverview's card tables reuse the same
 *  min/max/default the "My Tasks" page's Task column already uses. */
export const RESIZABLE_TASK_NAME_MIN = 120;
export const RESIZABLE_TASK_NAME_MAX = 480;
export const RESIZABLE_TASK_NAME_DEFAULT = 220;

/** Drag-to-resize mechanic for a table's Task/Name column (2026-08-15,
 *  extracted from ResizableTaskList below so EntityCardOverview's card
 *  tables can reuse the identical mechanism instead of reimplementing it).
 *  Writes the width DIRECTLY to a CSS variable on `containerRef`'s node
 *  during the drag — zero React re-renders per pointer move, which is what
 *  keeps dragging smooth (re-rendering every row on every pixel of
 *  movement is what made an earlier version visibly lag) — and commits to
 *  React state (so later re-renders keep it) only once, on pointerup.
 *
 *  `storageKey` is optional: omit it for ResizableTaskList's original
 *  behavior (resets to `defaultWidth` every mount, unchanged by this
 *  extraction). Pass one to persist the chosen width in localStorage,
 *  restored on the next visit. Hydration-safe the same way
 *  EntityCardOverview's onlyMe persistence is: `widthPx` starts at
 *  `defaultWidth` on BOTH the server and the client's first render (never
 *  reading localStorage in the initializer), and the stored value is
 *  applied in an effect that only ever runs client-side after hydration
 *  has already reconciled — so there's nothing for React to catch a
 *  mismatch on. */
export function useResizableColumn({
  cssVar,
  defaultWidth,
  min,
  max,
  storageKey,
}: {
  cssVar: string;
  defaultWidth: number;
  min: number;
  max: number;
  storageKey?: string;
}) {
  const [widthPx, setWidthPx] = React.useState(defaultWidth);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ x: number; width: number; latest: number } | null>(null);

  React.useEffect(() => {
    if (!storageKey) return;
    const stored = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored >= min && stored <= max) setWidthPx(stored);
    // Deliberately storageKey/min/max only — re-syncing on every
    // defaultWidth/render would stomp an in-progress local drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, min, max]);

  const containerStyle = { [cssVar]: `${widthPx}px` } as React.CSSProperties;

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { x: e.clientX, width: widthPx, latest: widthPx };
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.min(max, Math.max(min, drag.width + (ev.clientX - drag.x)));
      drag.latest = next;
      containerRef.current?.style.setProperty(cssVar, `${next}px`);
    };
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (!drag) return;
      setWidthPx(drag.latest);
      if (storageKey) window.localStorage.setItem(storageKey, String(drag.latest));
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return { containerRef, containerStyle, onResizeStart };
}

/** Fixed widths for the non-resizable My Tasks columns (2026-07-30 final:
 *  ONLY Task is draggable — long names are the one thing worth revealing;
 *  Proof / Assigned by / Due date keep constant size, no handles). Proof
 *  is 96px so its two-line "Proof of Completion" header label fits.
 *  Exported (2026-08-15) — EntityCardOverview's own column header reuses
 *  the exact same widths so its columns line up with TaskRowLine's actual
 *  rendered cells, rather than duplicating these numbers. */
export const PROOF_COL_WIDTH = 96;

/** localStorage key for the unresolved-subtasks completion warning —
 *  "off" suppresses the modal (per browser; default on). */
const SUBTASK_WARNING_KEY = "tm-subtask-warning";
const ASSIGNER_COL_WIDTH = 180;
/** Due Date is a true fixed column too (2026-07-30 final spec) — constant
 *  width at a constant position right after Assignee, NOT pinned to the
 *  container's right edge (ml-auto made its position drift with screen
 *  width). Wide enough for the longest value ("29/7 Yesterday"). Exported
 *  (2026-08-15) — same reuse rationale as PROOF_COL_WIDTH above. */
export const DUE_COL_WIDTH = 120;

/** "Assign to Others" column width (2026-08-15) — sized to match the button
 *  it sits above. Exported so both EntityCardOverview's own column header
 *  and ResizableTaskList's (when given a `reassign` control) share one
 *  number, same reuse rationale as PROOF_COL_WIDTH/DUE_COL_WIDTH above. */
export const REASSIGN_COL_WIDTH = 112;

/** The Task header's drag handle — same visual as TaskRowLine's in-row
 *  handle (thin divider that thickens/blues on hover). Exported (2026-08-15)
 *  — EntityCardOverview's card tables reuse this exact handle rather than
 *  building their own. */
export function HeaderResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      title="Drag to resize"
      className="absolute -right-1.5 top-1/2 flex h-4 w-3 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center"
    >
      <span className="h-4 w-px bg-gray-300 hover:w-0.5 hover:bg-blue-400 dark:bg-slate-600" />
    </span>
  );
}

/** Invisible stand-in for StatusDropdown's own trigger button (2026-08-19),
 *  reserving the header's status-column slot at the SAME width the real
 *  button actually renders at. A plain `w-3` spacer (matching just the
 *  circle's own size-3) used to sit here, but StatusDropdown's trigger is
 *  wider than that — circle + gap-0.5 + the "▾" chevron (added 2026-08-18
 *  for click affordance) + p-1 padding, net of its own -m-1 — so every
 *  header spacer that never got updated to match under-reserved space,
 *  shifting the Task column (and everything after it, including its own
 *  resize divider) rightward relative to the header in every data row. This
 *  mirrors the trigger's exact classes/content instead of a hardcoded guess
 *  at its width, so the two can never drift apart again even if the real
 *  button's padding/content changes later. `invisible` (not `hidden`) so it
 *  still occupies its layout space. */
export function StatusHeaderSpacer() {
  return (
    <span className="invisible -m-1 flex shrink-0 items-center gap-0.5 rounded-full p-1" aria-hidden>
      <span className="block size-3 rounded-full border-2 border-red-400 bg-white" />
      <span className="text-[8px] leading-none">▾</span>
    </span>
  );
}

/**
 * The "My Tasks — Daily/Monthly" and roster-drill-down task lists, wrapping
 * `TaskRowLine` with a shared, draggable "Task Name" column width — every
 * row in one list resizes together (drag any row's handle), matching the
 * reference screenshot's resizable Name column. Purely a client-side
 * presentational width, not persisted — resets on reload.
 *
 * `hideCompleted` — "My Tasks" personal-list mode ONLY (the roster
 * drill-down omits this prop and keeps its existing behavior: every status
 * visible, its own color per status, a text badge, one flat ungrouped
 * list). When set: `TaskRowLine` switches every row to the status-dropdown
 * circle and drops the status text badge, and rows render as three
 * collapsible status GROUPS (Pending / Completed / N/A, in that order,
 * matching the ClickUp reference — 2026-08-18, replacing the earlier Show
 * Completed/Pending/N-A toggle switches, which hid a bucket entirely
 * instead of letting it collapse/expand). Pending starts expanded;
 * Completed/N-A start collapsed. A parent task's subtasks always stay
 * nested under it within its own group, regardless of the subtasks' own
 * status.
 */
/** Bulk-select's action trigger (appears once 1+ rows are checked in
 *  EntityDrillModal's own bucket) — same hand-rolled popover pattern as
 *  StatusDropdown (outside-click/Escape to close). Takes whichever actions
 *  are relevant to the bucket being viewed (see EntityDrillModal): a single
 *  action renders as a plain button, 2+ render as a dropdown menu — there's
 *  never a reason to show a menu with exactly one choice in it. */
function BulkActionsButton({
  count,
  actions,
  disabled = false,
}: {
  count: number;
  actions: { key: string; label: string; icon: React.ReactNode; onRun: () => Promise<ActionResult> }[];
  /** True when every currently-selected task is past-day locked (2026-08-05)
   *  — the whole control goes inert, not just individual actions inside it,
   *  matching StatusDropdown's own trigger-level lock. */
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(menuRef.current && menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const run = async (action: () => Promise<ActionResult>) => {
    setOpen(false);
    setBusy(true);
    setErrorText(null);
    try {
      const result = await action();
      if (!result.ok) setErrorText(result.message);
    } finally {
      setBusy(false);
    }
  };

  if (actions.length <= 1) {
    const only = actions[0];
    return (
      <div className="relative inline-block">
        <button
          type="button"
          disabled={busy || disabled || !only}
          onClick={() => only && run(only.onRun)}
          className="rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Updating…" : only ? `${only.label} (${count})` : `Bulk actions (${count})`}
        </button>
        {errorText && <InlineActionError text={errorText} />}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Bulk actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || disabled}
        onClick={() => {
          setErrorText(null);
          setOpen((o) => {
            const next = !o;
            if (next && triggerRef.current) {
              // Portal to <body> with a computed fixed position (2026-08-26
              // fix) — same rationale as RowActionsMenu's own menu just
              // above: this button can sit inside a scrolling/clipped card
              // body (ResizableTaskList's hideCompleted groups, the
              // SectionCard wrapper around "CEO Assigned Task"/"Tasks I
              // Assigned"), which clipped/mispositioned the old plain
              // `absolute` dropdown instead of floating it over the row.
              const rect = triggerRef.current.getBoundingClientRect();
              const MENU_HEIGHT_ESTIMATE = actions.length * 32 + 12;
              const fitsBelow = rect.bottom + 4 + MENU_HEIGHT_ESTIMATE <= window.innerHeight;
              const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - 4);
              setMenuPos({ top, left: rect.right - 176 });
            }
            return next;
          });
        }}
        className="rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Updating…" : `(${count}) ▾`}
      </button>
      {errorText && <InlineActionError text={errorText} />}
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-30 w-44 rounded-lg border border-gray-200 bg-white py-1.5 shadow-md dark:border-slate-800 dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
          >
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                onClick={() => run(a.onRun)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function ResizableTaskList({
  tasks,
  myUserId,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  emptyLabel,
  hideCompleted,
  showCompletedToggle,
  showCompleted,
  onShowCompletedChange,
  assigneeColumnLabel,
  hideRowResizeDivider,
  hideAssignee,
  assigneeSource,
  onDueAtChange,
  blankDueDate,
  reassign,
  reassignAsMenu,
  reassignAnyOwner,
  defaultNameWidth,
}: {
  tasks: FlowTaskRow[];
  myUserId?: string;
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  /** "N/A" in the status dropdown — see TaskRowLine. */
  onSkip?: (runBlockId: string) => Promise<ActionResult>;
  /** "Pending" in the status dropdown (reopen) — see TaskRowLine. */
  onReopen?: (runBlockId: string) => Promise<ActionResult>;
  /** The Proof column's upload action — see ProofCell. */
  onUploadProof?: ProofUploadHandler;
  /** The Proof gallery's per-photo remove action — see ProofCell. */
  onRemoveProof?: ProofRemoveHandler;
  emptyLabel: string;
  hideCompleted?: boolean;
  /** Renders a single "Show Completed" checkbox (2026-08-19) that expands/
   *  collapses the Completed AND N/A groups TOGETHER, on top of their
   *  existing individual chevrons — only meaningful alongside hideCompleted.
   *  Uncontrolled by default (toggles this list's own internal
   *  collapsedGroups state); pass showCompleted/onShowCompletedChange below
   *  to control it externally instead (e.g. one shared toggle driving
   *  several lists at once, see EntityCardOverview's groupByStatus mode). */
  showCompletedToggle?: boolean;
  /** Controlled override (2026-08-19) for whether the Completed/N-A groups
   *  are expanded — when provided, this list stops managing that part of
   *  collapsedGroups itself and defers entirely to this prop (Pending stays
   *  always expanded either way). Requires onShowCompletedChange to still
   *  be interactive; omit both for the original uncontrolled behavior. */
  showCompleted?: boolean;
  /** Pairs with showCompleted above — called instead of the internal
   *  toggle when the viewer clicks the master switch or a Completed/N-A
   *  group's own chevron. */
  onShowCompletedChange?: (value: boolean) => void;
  /** Header override for the Assignee column (2026-08-05) — e.g. "Assigned
   *  To" for a "tasks I assigned" list, where the column shows who the
   *  task went TO rather than who assigned it to the viewer (the usual
   *  meaning elsewhere). Defaults to "Assignee". Cosmetic only — the
   *  column's row content (task.assignerName) is unchanged either way. */
  assigneeColumnLabel?: string;
  /** Hide the per-row Task-column resize handle (2026-08-05) — that thin
   *  vertical line between Task and the next column on every row is
   *  TaskRowLine's own drag handle (each row can resize the column, not
   *  just the header). Setting this only stops passing it to ROWS; the
   *  header's own resize handle (HeaderResizeHandle, below) is untouched,
   *  so the column stays resizable from there. Defaults to shown
   *  (unchanged) everywhere this isn't explicitly set. */
  hideRowResizeDivider?: boolean;
  /** Drop the Assignee column entirely and show "Assign to Others" instead
   *  when `reassign` is provided (2026-08-15, EntityCardOverview's embedded
   *  Daily card) — every row in that context is already the viewer's own
   *  task, so "who assigned this to me" is redundant. See TaskRowLine's own
   *  hideAssignee doc comment. */
  hideAssignee?: boolean;
  /** Passed straight through to every row's TaskRowLine — see its own
   *  `assigneeSource` doc comment. */
  assigneeSource?: "assigner" | "assignee";
  /** Passed straight through to every row's TaskRowLine — see its own
   *  `onDueAtChange` doc comment (scoped to "Tasks I Assigned"/"CEO
   *  Assigned Task" only). */
  onDueAtChange?: (runBlockId: string, newDueAtIso: string) => Promise<ActionResult>;
  /** Keep the Due Date column but blank its per-row value (2026-08-15,
   *  same EntityCardOverview Daily-card motivation as TaskRowLine's own
   *  blankDueDate — the date is implied by the section itself). */
  blankDueDate?: boolean;
  /** "Assign to Others" self-service handoff (2026-08-15) — passed straight
   *  through to every row via TaskRowLine's own `reassign` prop; renders a
   *  header column for it (replacing Assignee's slot when hideAssignee is
   *  also set, otherwise appended) only when provided. */
  reassign?: ReassignControl;
  /** Render the reassign trigger as a "⋮" menu instead of a persistent
   *  button (2026-08-15) — see TaskRowLine's own `reassignAsMenu` doc
   *  comment; passed straight through to every row. */
  reassignAsMenu?: boolean;
  /** Manager mode (2026-08-19) — see TaskRowLine's own `reassignAnyOwner`
   *  doc comment; passed straight through to every row. Lets a viewer with
   *  this permission reassign OTHER people's pending tasks too, not just
   *  their own. */
  reassignAnyOwner?: boolean;
  /** Starting Task-column width before any drag (2026-08-15) — defaults to
   *  RESIZABLE_TASK_NAME_DEFAULT (the original "My Tasks" page behavior,
   *  unchanged) when omitted. Callers with a wider available row (e.g. no
   *  Assignee column, EntityCardOverview's own-card myWeek/myMonth tab
   *  body) can start the divider further right instead of always opening
   *  at the same narrow default — but keep in mind blankDueDate does NOT
   *  free up its column's width, only its displayed value (the
   *  DUE_COL_WIDTH spacer stays reserved either way, for row alignment);
   *  a caller combining blankDueDate with a wide defaultNameWidth can still
   *  overflow a narrower viewport (2026-08-26 fix: myWeek/myMonth's own
   *  400 did exactly this, trimmed to 260). Still fully draggable
   *  afterward within RESIZABLE_TASK_NAME_MIN/MAX either way. */
  defaultNameWidth?: number;
}) {
  // Collapsible status groups (2026-08-18, replacing the old Show Pending/
  // Completed/N-A toggle switches — those hid a bucket entirely with no way
  // to glance at its count; ClickUp's own task list uses collapsible
  // sections instead, which is what this now matches). Pending starts
  // expanded (the actionable bucket); Completed/N-A start collapsed (out of
  // the way until opened) — every row still exists in the DOM tree, just
  // hidden, so nothing is actually filtered out anymore. Pending IS
  // collapsible via its own chevron (2026-08-20 fix — it previously always
  // rendered expanded regardless of clicks, see isGroupCollapsed below).
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<BucketKey>>(
    () => new Set<BucketKey>(["completed", "na"]),
  );
  const toggleGroup = (key: BucketKey) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Show Completed (2026-08-19) — a single master switch layered on top of
  // the per-group chevrons above. In CONTROLLED mode (showCompleted prop
  // provided), the Completed/N-A groups defer entirely to it instead of
  // collapsedGroups, so several lists (e.g. every person's card in an
  // EntityCardOverview section) can share one external boolean. Pending is
  // deliberately NEVER driven by this controlled prop — collapsing Pending
  // is a per-card layout preference, not part of "show completed work",
  // so it always reads its own independent collapsedGroups entry instead
  // (2026-08-20 fix — a hardcoded `return false` here previously made every
  // card's Pending chevron register the click but never actually collapse,
  // across every person card in the View All grid, not just one).
  const isControlledCompleted = showCompleted !== undefined;
  const isGroupCollapsed = (key: BucketKey): boolean => {
    if (key === "pending") return collapsedGroups.has("pending");
    if (isControlledCompleted) return !showCompleted;
    return collapsedGroups.has(key);
  };
  const masterShowCompleted = isControlledCompleted
    ? showCompleted!
    : !(collapsedGroups.has("completed") && collapsedGroups.has("na"));
  const toggleGroupOrMaster = (key: BucketKey) => {
    if (key !== "pending" && isControlledCompleted) {
      onShowCompletedChange?.(!showCompleted);
      return;
    }
    toggleGroup(key);
  };
  const toggleMasterShowCompleted = () => {
    if (isControlledCompleted) {
      onShowCompletedChange?.(!showCompleted);
      return;
    }
    const turningOn = !masterShowCompleted;
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (turningOn) {
        next.delete("completed");
        next.delete("na");
      } else {
        next.add("completed");
        next.add("na");
      }
      return next;
    });
  };
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  /** Parents the viewer has collapsed — everything ELSE is expanded (the
   *  2026-07-30 confirmed default). */
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());
  // ---- Unresolved-subtasks completion guard (2026-07-30) --------------
  // Marking a PARENT Completed while it still has unresolved (non-DONE,
  // non-SKIPPED) subtasks opens a confirmation modal instead: "Continue
  // without resolving" completes just the parent; "Resolve all N" bulk-
  // completes the subtasks too. The warning can be switched off via the
  // modal's Warning Settings (persisted per browser in localStorage).
  // Generalized to MULTIPLE parents (2026-07-31): "Select all" can sweep
  // several parents with unresolved subtasks at once — one combined modal
  // (total unresolved count) instead of a sequence of prompts.
  const [confirmTarget, setConfirmTarget] = React.useState<{
    parents: FlowTaskRow[];
    unresolved: FlowTaskRow[];
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [confirmSubsOpen, setConfirmSubsOpen] = React.useState(false);
  const [warnSettingsOpen, setWarnSettingsOpen] = React.useState(false);
  const [warnEnabled, setWarnEnabled] = React.useState(() =>
    typeof window === "undefined" ? true : window.localStorage.getItem(SUBTASK_WARNING_KEY) !== "off",
  );
  // No storageKey — preserves the original behavior exactly (resets to
  // RESIZABLE_TASK_NAME_DEFAULT every mount); see useResizableColumn's own
  // doc comment for the extraction rationale.
  const { containerRef, containerStyle, onResizeStart } = useResizableColumn({
    cssVar: "--tm-col-name",
    defaultWidth: defaultNameWidth ?? RESIZABLE_TASK_NAME_DEFAULT,
    min: RESIZABLE_TASK_NAME_MIN,
    max: RESIZABLE_TASK_NAME_MAX,
  });
  const nameWidth = "var(--tm-col-name)";

  const completedCount = hideCompleted ? tasks.filter((t) => t.status === "DONE").length : 0;
  const naCount = hideCompleted ? tasks.filter((t) => t.status === "SKIPPED").length : 0;
  // "Pending" here matches the status donut's own bucket: everything that's
  // neither DONE nor SKIPPED (PENDING/ACTIVE/OVERDUE/ESCALATED alike) — see
  // types.ts's flowBucketize.
  const pendingCount = hideCompleted
    ? tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED").length
    : 0;
  const bucketOf = (t: FlowTaskRow): BucketKey =>
    t.status === "DONE" ? "completed" : t.status === "SKIPPED" ? "na" : "pending";

  // Main Task ↔ Subtask tree (2026-07-30, table mode only): group rows
  // under their parent, chevron-expandable (EXPANDED by default —
  // collapsedIds tracks the exceptions). Every task is always in this tree
  // now (2026-08-18: the old Show Pending/Completed/N-A toggles used to
  // filter `tasks` down to `visibleTasks` first, which could drop a subtask
  // out of its parent's tree independently of the parent — collapsible
  // groups replace that with per-STATUS-GROUP collapse of TOP-LEVEL tasks
  // only, so a task's children always stay nested under it regardless of
  // their own status).
  const allIds = new Set(tasks.map((t) => t.runBlockId));
  const childrenOf = new Map<string, FlowTaskRow[]>();
  if (hideCompleted) {
    for (const t of tasks) {
      if (t.parentId && allIds.has(t.parentId)) {
        const kids = childrenOf.get(t.parentId);
        if (kids) kids.push(t);
        else childrenOf.set(t.parentId, [t]);
      }
    }
    // Explicit checklist-builder order (subtaskOrder, 2026-07-31) first;
    // pre-column rows (null) fall back to cuid creation order.
    for (const kids of childrenOf.values()) {
      kids.sort((a, b) => {
        const ao = a.subtaskOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.subtaskOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return a.runBlockId < b.runBlockId ? -1 : 1;
      });
    }
  }
  const topLevelTasks = hideCompleted ? tasks.filter((t) => !t.parentId || !allIds.has(t.parentId)) : tasks;
  const hasTree = childrenOf.size > 0;
  // Collapsible groups (2026-08-18) — top-level tasks only, grouped by
  // their OWN status; a parent's children stay nested under it regardless
  // of the group. Order is fixed: Pending, Completed, N/A (per product
  // decision — pending first, everything else is out of the way by
  // default). Only meaningful in hideCompleted ("My Tasks") mode — the
  // roster drill-down (hideCompleted false) keeps its original flat,
  // ungrouped rendering below, unchanged.
  const GROUP_ORDER: BucketKey[] = ["pending", "completed", "na"];
  const GROUP_LABEL: Record<BucketKey, string> = { pending: "Pending", completed: "Completed", na: "N/A" };
  const groupedTopLevel = hideCompleted
    ? GROUP_ORDER.map((key) => ({
        key,
        label: GROUP_LABEL[key],
        dot: BUCKET_META.find((b) => b.key === key)!.dot,
        rows: topLevelTasks.filter((t) => bucketOf(t) === key),
      })).filter((g) => g.rows.length > 0)
    : [];
  const toggleExpand = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isUnresolved = (t: FlowTaskRow) => t.status !== "DONE" && t.status !== "SKIPPED";
  /** Wraps onComplete for a PARENT row: intercepts when unresolved
   *  subtasks exist (and the warning is on) — the modal takes over. */
  const guardedComplete =
    (parent: FlowTaskRow, kids: FlowTaskRow[]) =>
    async (runBlockId: string): Promise<ActionResult> => {
      const unresolved = kids.filter(isUnresolved);
      if (unresolved.length === 0 || !warnEnabled) return onComplete!(runBlockId);
      setConfirmError(null);
      setConfirmSubsOpen(false);
      setConfirmTarget({ parents: [parent], unresolved });
      return { ok: true };
    };
  /** CHECKING a parent's checkbox (2026-07-31 fix — "fires consistently"):
   *  same guard as the status dropdown. While unresolved subtasks exist,
   *  the check opens the confirmation modal instead of selecting — closing
   *  it leaves the box unchecked (the original spec's dismiss rule).
   *  UNchecking, warning-off, and no-unresolved-subtasks all behave as a
   *  plain selection toggle. */
  const guardedToggleSelect = (parent: FlowTaskRow, kids: FlowTaskRow[]) => (id: string) => {
    const unresolved = kids.filter(isUnresolved);
    const checking = !selectedIds.has(id);
    if (checking && unresolved.length > 0 && warnEnabled && onComplete) {
      setConfirmError(null);
      setConfirmSubsOpen(false);
      setConfirmTarget({ parents: [parent], unresolved });
      return;
    }
    toggleSelect(id);
  };
  /** "Select all" (2026-07-31): same guard, not bypassable — when CHECKING
   *  would sweep in parents with unresolved subtasks, ONE combined modal
   *  covers all of them (total unresolved count). Unchecking, warning-off,
   *  and no-affected-parents fall through to the plain toggle. */
  const guardedToggleSelectAll = () => {
    if (!allOwnedSelected && warnEnabled && onComplete && hideCompleted) {
      const parents = topLevelTasks.filter((t) =>
        (childrenOf.get(t.runBlockId) ?? []).some(isUnresolved),
      );
      if (parents.length > 0) {
        setConfirmError(null);
        setConfirmSubsOpen(false);
        setConfirmTarget({
          parents,
          unresolved: parents.flatMap((p) =>
            (childrenOf.get(p.runBlockId) ?? []).filter(isUnresolved),
          ),
        });
        return;
      }
    }
    toggleSelectAll();
  };
  const closeConfirm = () => {
    setConfirmTarget(null);
    setConfirmError(null);
    setConfirmSubsOpen(false);
    setWarnSettingsOpen(false);
  };
  const continueWithoutResolving = async () => {
    if (!onComplete || !confirmTarget) return;
    setConfirmBusy(true);
    setConfirmError(null);
    const results = await Promise.allSettled(
      confirmTarget.parents.map((p) => onComplete(p.runBlockId)),
    );
    setConfirmBusy(false);
    const failed = results.filter((r) => r.status === "rejected" || !r.value.ok).length;
    if (failed === 0) closeConfirm();
    else setConfirmError(`${failed} of ${confirmTarget.parents.length} tasks failed to update.`);
  };
  const resolveAll = async () => {
    if (!onComplete || !confirmTarget) return;
    setConfirmBusy(true);
    setConfirmError(null);
    const targets = [...confirmTarget.unresolved, ...confirmTarget.parents];
    const results = await Promise.allSettled(targets.map((t) => onComplete(t.runBlockId)));
    setConfirmBusy(false);
    const failed = results.filter((r) => r.status === "rejected" || !r.value.ok).length;
    if (failed === 0) closeConfirm();
    else setConfirmError(`${failed} of ${targets.length} tasks failed to update — the rest were completed.`);
  };
  const setWarning = (on: boolean) => {
    setWarnEnabled(on);
    try {
      window.localStorage.setItem(SUBTASK_WARNING_KEY, on ? "on" : "off");
    } catch {
      /* private mode etc. — the toggle still works for this session */
    }
  };

  // Bulk-select/actions only ever apply to the viewer's OWN rows — same
  // assignee-only rule as the per-row dropdown (StatusDropdown) and
  // EntityDrillModal's checkboxes; there's no checkbox to check for anyone
  // else's task, so this is defense-in-depth, not a real gate in practice
  // (this whole list is always "my own tasks" by construction).
  const ownedVisibleTasks = tasks.filter((t) => myUserId && t.assigneeId === myUserId);
  const allOwnedSelected =
    ownedVisibleTasks.length > 0 && ownedVisibleTasks.every((t) => selectedIds.has(t.runBlockId));
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds(allOwnedSelected ? new Set() : new Set(ownedVisibleTasks.map((t) => t.runBlockId)));
  };

  // Bulk actions only ever touch tasks that are BOTH selected AND still
  // eligible for that specific transition (mirrors the per-row dropdown's
  // own disabled-state rules) — a selection mixing eligible/ineligible rows
  // (e.g. a non-quick-completable task checked alongside a quick-completable
  // one) silently skips the ineligible ones rather than failing the batch.
  // Targets are independent rows, so they run concurrently instead of one
  // full round trip at a time; any that reject stay selected afterward
  // (instead of the whole batch aborting) so a retry only touches what
  // actually failed.
  // Targets run concurrently (independent rows, no shared transaction); a
  // target now "fails" when its action RESOLVES with { ok: false } (actions
  // no longer throw for expected errors — see ActionResult) rather than by
  // rejecting, though an actual rejection is still treated as a failure too,
  // defensively. Any that failed stay selected afterward so a retry only
  // touches what actually failed; the summary result drives the visible
  // error via BulkActionsButton.
  const runBulk = async (
    action: ((id: string) => Promise<ActionResult>) | undefined,
    eligible: (t: FlowTaskRow) => boolean,
  ): Promise<ActionResult> => {
    if (!action) return { ok: true };
    const targets = tasks.filter((t) => selectedIds.has(t.runBlockId) && eligible(t));
    const results = await Promise.allSettled(targets.map((t) => action(t.runBlockId)));
    const failedIds = targets
      .filter((_, i) => {
        const r = results[i];
        return r.status === "rejected" || !r.value.ok;
      })
      .map((t) => t.runBlockId);
    setSelectedIds(new Set(failedIds));
    if (failedIds.length === 0) return { ok: true };
    return {
      ok: false,
      message: `${failedIds.length} of ${targets.length} task${targets.length === 1 ? "" : "s"} failed to update.`,
    };
  };

  const bulkActions: { key: string; label: string; icon: React.ReactNode; onRun: () => Promise<ActionResult> }[] = [];
  if (onComplete) {
    bulkActions.push({
      key: "complete",
      label: "Mark Completed",
      icon: (
        <span className="flex size-2.5 shrink-0 items-center justify-center text-[10px] font-bold text-emerald-500">
          ✓
        </span>
      ),
      onRun: () =>
        runBulk(
          onComplete,
          (t) => t.quickCompletable && t.status !== "DONE" && t.assigneeId === myUserId && !isLockedDueDay(t),
        ),
    });
  }
  if (onSkip) {
    bulkActions.push({
      key: "na",
      label: "Mark N/A",
      icon: <span className="size-2.5 shrink-0 rounded-full bg-amber-400" />,
      onRun: () =>
        runBulk(onSkip, (t) => t.status !== "SKIPPED" && t.assigneeId === myUserId && !isLockedDueDay(t)),
    });
  }
  // Bulk reopen (2026-08-18) — previously deliberately omitted here ("no
  // bulk reopen ... matching the per-row dropdown's own scope for a flat
  // mixed-status list"), but the collapsible status groups above now make
  // this list bucket-scoped too (same rationale EntityDrillModal already
  // uses for its own bulk reopen, offered when the whole bucket being
  // viewed is Completed/N-A) — selecting rows inside the Completed/N-A
  // group and wanting to bulk-reopen them is a real, now-common flow.
  // Eligibility mirrors the per-row StatusDropdown's own canReopen (DONE or
  // SKIPPED, owned, not due-day-locked); a selection mixing Pending rows in
  // just silently skips those, same as the other two actions above.
  if (onReopen) {
    bulkActions.push({
      key: "reopen",
      label: "Mark Pending",
      icon: <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white" />,
      onRun: () =>
        runBulk(
          onReopen,
          (t) => (t.status === "DONE" || t.status === "SKIPPED") && t.assigneeId === myUserId && !isLockedDueDay(t),
        ),
    });
  }
  // Past-day lock (2026-08-05): the WHOLE bulk-actions control goes inert
  // when every currently-selected task is locked — mirrors StatusDropdown's
  // own trigger-level lock rather than relying on per-action eligibility
  // alone. A mixed selection (some locked, some not) leaves the button
  // enabled; the eligible() filters above silently skip the locked ones
  // when it runs, same as any other ineligible row already does.
  const selectedBulkTasks = tasks.filter((t) => selectedIds.has(t.runBlockId));
  const allSelectedLocked = selectedBulkTasks.length > 0 && selectedBulkTasks.every(isLockedDueDay);

  // Select-all moved INTO the column header row (2026-07-31) — this slim
  // bar now only appears when it has something to show: the bulk-actions
  // trigger, once 1+ rows are selected (2026-08-18: the old Show Pending/
  // Completed/N-A toggles that used to also live here are gone — each
  // status is now its own collapsible group below instead).
  const controlBar = hideCompleted && selectedIds.size > 0 && bulkActions.length > 0 && (
    <div className="flex items-center justify-between gap-3 pb-2">
      <BulkActionsButton count={selectedIds.size} actions={bulkActions} disabled={allSelectedLocked} />
    </div>
  );

  if (tasks.length === 0) {
    return (
      <div>
        {controlBar}
        <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      {controlBar}
      {hideCompleted && showCompletedToggle && (
        <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-gray-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={masterShowCompleted}
            onChange={toggleMasterShowCompleted}
            className="size-3.5 rounded border-gray-300 accent-blue-600 dark:border-slate-600"
          />
          Show Completed
        </label>
      )}
      {/* Phones/tablets (2026-07-31): the fixed columns total ~700px, so
          in table mode the header+rows pan HORIZONTALLY inside this
          container instead of cutting off or squeezing — the page itself
          never scrolls sideways. Desktop unaffected (min-w-full keeps the
          table filling its card). */}
      <div className={hideCompleted ? "overflow-x-auto" : undefined}>
        <div className={hideCompleted ? "w-max min-w-full" : undefined}>
      {/* Column header row (2026-07-30, ClickUp reference) — personal My
          Tasks lists only. Spacers mirror the rows' leading checkbox +
          status circle. ONLY the Task header carries a drag handle (its
          width lives in the container's CSS variable); Proof and Assigned
          by are fixed-width, and Due date is pinned to the right edge
          (ml-auto) taking whatever remains. */}
      {hideCompleted && (
        <div className="group flex items-center gap-3 border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:border-slate-800 dark:text-slate-500">
          {/* Select-all lives IN the header row (2026-07-31), occupying
              the checkbox column's slot so it aligns exactly above the
              row checkboxes. Bare (no text), hover-to-reveal like them —
              hovering anywhere on the header row shows it. */}
          {ownedVisibleTasks.length > 0 ? (
            <input
              type="checkbox"
              checked={allOwnedSelected}
              onChange={guardedToggleSelectAll}
              aria-label="Select all tasks"
              title="Select all"
              className={`size-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600 transition-opacity dark:border-slate-600 ${
                allOwnedSelected
                  ? "opacity-100"
                  : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              }`}
            />
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          {hasTree && <span className="w-6 shrink-0" aria-hidden />}
          <StatusHeaderSpacer />
          <span className="relative shrink-0 truncate" style={{ width: "var(--tm-col-name)" }}>
            Task
            <HeaderResizeHandle onPointerDown={onResizeStart} />
          </span>
          <span className="shrink-0 text-center leading-tight" style={{ width: PROOF_COL_WIDTH }}>
            Proof of Completion
          </span>
          {/* "Assignee" per the 2026-07-30 final spec (the shown value is
              the run's starter — assignerName — but the user explicitly
              chose this label over "Assigned by"). Label overridable
              (2026-08-05) via assigneeColumnLabel — e.g. "Assigned To" for
              a "tasks I assigned" list. Dropped entirely (2026-08-15) when
              hideAssignee is set — see its own doc comment. */}
          {!hideAssignee && (
            <span className="shrink-0 truncate" style={{ width: ASSIGNER_COL_WIDTH }}>
              {assigneeColumnLabel ?? "Assignee"}
            </span>
          )}
          <span className="shrink-0 truncate" style={{ width: DUE_COL_WIDTH }}>
            Due Date
          </span>
          {reassign && (
            <span className="shrink-0 text-center" style={{ width: REASSIGN_COL_WIDTH }}>
              Assign to Others
            </span>
          )}
        </div>
      )}
      {(() => {
        const renderTopLevelRow = (t: FlowTaskRow) => {
          const kids = childrenOf.get(t.runBlockId) ?? [];
          const expanded = !collapsedIds.has(t.runBlockId);
          const shared = {
            myUserId,
            onComplete,
            onSkip,
            onReopen,
            onUploadProof,
            onRemoveProof,
            nameWidth,
            proofWidth: PROOF_COL_WIDTH,
            assignerWidth: ASSIGNER_COL_WIDTH,
            hideCompleted,
            hideAssignee,
            assigneeSource,
            onDueAtChange,
            blankDueDate,
            reassign,
            reassignAsMenu,
            reassignAnyOwner,
          };
          return (
            <React.Fragment key={t.runBlockId}>
              <TaskRowLine
                task={t}
                {...shared}
                onComplete={kids.length > 0 && onComplete ? guardedComplete(t, kids) : onComplete}
                onResizeStart={hideRowResizeDivider ? undefined : onResizeStart}
                selected={selectedIds.has(t.runBlockId)}
                onToggleSelect={
                  hideCompleted
                    ? kids.length > 0
                      ? guardedToggleSelect(t, kids)
                      : toggleSelect
                    : undefined
                }
                tree={
                  hasTree
                    ? kids.length > 0
                      ? { kind: "parent", count: kids.length, expanded, onToggle: () => toggleExpand(t.runBlockId) }
                      : { kind: "flat" }
                    : undefined
                }
              />
              {expanded &&
                kids.map((k) => (
                  <TaskRowLine
                    key={k.runBlockId}
                    task={k}
                    {...shared}
                    // Subtask rows share the SAME nameWidth as their parent
                    // (both spread from `shared` above) — the drag handle
                    // itself was parent-only until now (2026-08-22 fix),
                    // even though grabbing it from either row resizes the
                    // one shared column.
                    onResizeStart={hideRowResizeDivider ? undefined : onResizeStart}
                    selected={selectedIds.has(k.runBlockId)}
                    onToggleSelect={hideCompleted ? toggleSelect : undefined}
                    tree={{ kind: "child" }}
                  />
                ))}
            </React.Fragment>
          );
        };

        // Collapsible status groups (2026-08-18) — "My Tasks" mode only; the
        // roster drill-down (hideCompleted false) keeps its original flat,
        // ungrouped list.
        return hideCompleted ? (
          groupedTopLevel.map((group) => {
            const isCollapsed = isGroupCollapsed(group.key);
            return (
              <div key={group.key} className="border-b border-gray-100 last:border-b-0 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => toggleGroupOrMaster(group.key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2 py-2 text-left text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ChevronIcon expanded={!isCollapsed} className="size-3.5" />
                  <span className={`size-2 shrink-0 rounded-full ${group.dot}`} />
                  <span>{group.label}</span>
                  <span className="text-gray-400 dark:text-slate-500">({group.rows.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100 pb-1.5 dark:divide-slate-800">
                    {group.rows.map(renderTopLevelRow)}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {topLevelTasks.map(renderTopLevelRow)}
          </div>
        );
      })()}
        </div>
      </div>
      {/* Unresolved-subtasks confirmation modal (2026-07-30) — portal to
          <body>, same escape-the-dimmed-row rationale as ProofCell's. */}
      {confirmTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={closeConfirm}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h4 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                  {confirmTarget.parents.length === 1
                    ? `This task has ${confirmTarget.unresolved.length} unresolved item${confirmTarget.unresolved.length === 1 ? "" : "s"}`
                    : `These ${confirmTarget.parents.length} tasks have ${confirmTarget.unresolved.length} unresolved items`}
                </h4>
                <button
                  type="button"
                  onClick={closeConfirm}
                  aria-label="Close"
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSubsOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <span>
                  {confirmTarget.unresolved.length} Subtask
                  {confirmTarget.unresolved.length === 1 ? "" : "s"}
                </span>
                <ChevronIcon expanded={confirmSubsOpen} className="size-3.5 text-gray-400 dark:text-slate-500" />
              </button>
              {confirmSubsOpen && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-2 dark:border-slate-700 dark:bg-slate-700">
                  {confirmTarget.unresolved.map((k) => (
                    <li key={k.runBlockId} className="flex items-center gap-2 px-2 py-1 text-sm text-gray-700 dark:text-slate-300">
                      <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white" />
                      <span className="min-w-0 flex-1 truncate">{k.blockTitle}</span>
                    </li>
                  ))}
                </ul>
              )}
              {confirmError && <p className="mt-3 text-xs text-red-600">{confirmError}</p>}
              {warnSettingsOpen && (
                <label className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={warnEnabled}
                    onChange={(e) => setWarning(e.target.checked)}
                    className="size-4 rounded border-gray-300 accent-blue-600 dark:border-slate-600"
                  />
                  Warn me when completing a task with unresolved subtasks
                </label>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWarnSettingsOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <span aria-hidden>⚙️</span> Warning Settings
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={confirmBusy}
                    onClick={() => void continueWithoutResolving()}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
                  >
                    Continue without resolving
                  </button>
                  <button
                    type="button"
                    disabled={confirmBusy}
                    onClick={() => void resolveAll()}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {confirmBusy
                      ? "Updating…"
                      : `Resolve all ${confirmTarget.unresolved.length} item${confirmTarget.unresolved.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Mockup-style status card ("Department Status / Daily"): centered stacked
 * title, hollow donut, vertical dot legend beneath. When `tasks` is
 * provided, clicking a donut segment (or legend row) opens EntityDrillModal
 * for that bucket — same modal, same interaction, on every card in the app.
 */
export function StatusOverviewCard({
  title,
  subtitle,
  totals,
  tasks,
  action,
  actionPlacement = "corner",
  myUserId,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  reassign,
  hideChart,
}: {
  title: string;
  /** Period line under the title; omit for un-periodized overview cards. */
  subtitle?: string;
  totals: FlowBucketTotals;
  tasks?: Record<BucketKey, FlowDrillTask[]>;
  /** Rendered top-right (e.g. the Daily/Monthly toggle). */
  action?: React.ReactNode;
  /** Skip the StatusDonut ring, keep the BucketLegend text (count +
   *  percentage per bucket) — same drill-in behavior either way, just no
   *  chart (2026-08-15, Home page's personal Daily/Monthly cards only —
   *  every other StatusOverviewCard usage, on Home and on Task Manager's
   *  own /task-manager page, is unaffected since they don't pass this). */
  hideChart?: boolean;
  /** "corner" (default) overlays the action absolutely in the top-right —
   *  fine for tiny controls (the CEO cards' drag/remove handle). Wide
   *  controls like the date filter would sit ON TOP of the centered title,
   *  so they use "row": a right-aligned row in normal flow ABOVE the title
   *  (2026-07-28 overlap fix) — no overlap at any card width. */
  actionPlacement?: "corner" | "row";
  /** The VIEWER's own user id — a task's status dot is only ever clickable
   *  when it's both quick-completable AND assigned to this id. Omit to keep
   *  every dot read-only regardless of task eligibility. */
  myUserId?: string;
  /** "Click the dot to complete" handler, passed straight to EntityDrillModal. */
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  /** "Mark N/A" handler, passed straight to EntityDrillModal — see
   *  TaskRowLine's onSkip. */
  onSkip?: (runBlockId: string) => Promise<ActionResult>;
  /** "Pending" (reopen) handler, passed straight to EntityDrillModal — see
   *  TaskRowLine's onReopen. */
  onReopen?: (runBlockId: string) => Promise<ActionResult>;
  /** Proof upload handler, passed straight to EntityDrillModal — see
   *  ProofCell. */
  onUploadProof?: ProofUploadHandler;
  /** Proof gallery per-photo remove handler, passed straight to
   *  EntityDrillModal — see ProofCell. */
  onRemoveProof?: ProofRemoveHandler;
  /** "Assign to Others" control, passed straight to EntityDrillModal. */
  reassign?: ReassignControl;
}) {
  const [selected, setSelected] = React.useState<BucketKey | null>(null);
  const drill = tasks ? setSelected : undefined;

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white px-6 py-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {action && actionPlacement === "corner" && (
        <div className="absolute right-4 top-4">{action}</div>
      )}
      {action && actionPlacement === "row" && (
        <div className="mb-3 flex flex-wrap justify-end">{action}</div>
      )}
      <p className="text-center text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</p>
      {subtitle && <p className="text-center text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>}

      <div className="mt-5 flex flex-col items-center">
        {!hideChart && <StatusDonut totals={totals} size={132} onSegmentClick={drill} />}
        <div className={`w-44 ${hideChart ? "" : "mt-5"}`}>
          <BucketLegend totals={totals} onSelect={drill} />
        </div>
      </div>

      {selected && tasks && (
        <EntityDrillModal
          name={title}
          tasks={tasks}
          bucketKey={selected}
          onClose={() => setSelected(null)}
          myUserId={myUserId}
          onComplete={onComplete}
          onSkip={onSkip}
          onReopen={onReopen}
          onUploadProof={onUploadProof}
          onRemoveProof={onRemoveProof}
          reassign={reassign}
        />
      )}
    </div>
  );
}

/** Everything "Assign to Others" needs, bundled so pages thread ONE optional
 *  prop: the assignable staff directory + the reassignment server action.
 *  Only provided to viewers with assign rights (page-side gate); the server
 *  action re-checks authorization regardless. */
export interface ReassignControl {
  staff: FlowStaffMember[];
  action: (runBlockId: string, newAssigneeId: string) => Promise<ActionResult>;
}

/** Inline person picker for "Assign to Others" — search + click ONE name
 *  (deliberately single-select, unlike the + Task RecipientPicker: one task,
 *  one new assignee). Built from the + Task picker's OWN exported pieces
 *  (pickerSearchClass + SinglePersonPickList — same search input, same
 *  "Name · Role" rows), so the two pickers share one styling source and
 *  can't drift apart. Renders under the task row inside EntityDrillModal
 *  and TaskRowLine; exported (2026-08-13) so EntityCardOverview's Type-sort
 *  table can reuse it directly too, rather than each caller re-implementing
 *  the same picker. */
export function ReassignPicker({
  staff,
  currentAssigneeId,
  onPick,
}: {
  staff: FlowStaffMember[];
  currentAssigneeId: string;
  onPick: (userId: string) => Promise<ActionResult>;
}) {
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const candidates = staff
    .filter((s) => s.id !== currentAssigneeId)
    .filter((s) => s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-slate-700 dark:bg-slate-800">
      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setError(null);
        }}
        placeholder="Search staff by name…"
        className={`mb-1.5 ${pickerSearchClass}`}
      />
      {error && <p className="mb-1 text-xs text-red-600 dark:text-red-300">{error}</p>}
      <SinglePersonPickList
        members={candidates}
        disabled={busy}
        emptyLabel="No staff match that search."
        onPick={async (userId) => {
          setBusy(true);
          setError(null);
          const r = await onPick(userId);
          setBusy(false);
          if (!r.ok) setError(r.message);
        }}
      />
      {busy && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Assigning…</p>}
    </div>
  );
}

/**
 * Task-list modal for a clicked donut segment/legend row: dimmed backdrop,
 * centered card, dot+title+count header, then (when the viewer owns any row
 * here) a "Select all" + bulk-action row, then dropdown-circle+bold-name+
 * "by {assignee}"+date rows. The ONE shared drill-down UI for every donut in
 * the app — used internally by StatusOverviewCard (every personal/role/
 * department/branch card) and directly by MiniDonutBlock (the "All
 * Departments"/"All Branches"/region grids' mini-donuts).
 *
 * Checkboxes/select-all/bulk actions only ever appear for rows the viewer
 * owns (assigneeId === myUserId) — on aggregate views (Department/Branch
 * Overview, delegated/ad hoc oversight cards, MiniDonutBlock) myUserId and
 * the action handlers are omitted entirely, so this whole modal stays
 * exactly as read-only as it always was; nothing here newly enables editing
 * someone else's task.
 */
export function EntityDrillModal({
  name,
  tasks,
  bucketKey,
  onClose,
  myUserId,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  reassign,
}: {
  name: string;
  tasks: Record<BucketKey, FlowDrillTask[]>;
  bucketKey: BucketKey;
  onClose: () => void;
  /** The VIEWER's own user id — see StatusOverviewCard. */
  myUserId?: string;
  /** "Click the dot to complete" handler — omit to keep every dot read-only. */
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  /** "Mark N/A" handler — see TaskRowLine's onSkip. Unlike onComplete, not
   *  gated on quickCompletable. */
  onSkip?: (runBlockId: string) => Promise<ActionResult>;
  /** "Mark Pending" (reopen) handler — see TaskRowLine's onReopen. */
  onReopen?: (runBlockId: string) => Promise<ActionResult>;
  /** Proof upload — the viewer's OWN rows get the ＋/gallery cell (see
   *  ProofCell); omitted on read-only oversight cards, where existing
   *  proof still shows its gallery indicator. */
  onUploadProof?: ProofUploadHandler;
  /** Proof gallery per-photo remove — see ProofCell. Omitted on read-only
   *  oversight cards, same as onUploadProof. */
  onRemoveProof?: ProofRemoveHandler;
  /** "Assign to Others" (2026-07-25): when provided, every PENDING row gets
   *  a reassign control opening an inline person picker. Only passed for
   *  the 5 assign-capable identities; the server action re-checks. */
  reassign?: ReassignControl;
}) {
  const meta = BUCKET_META.find((b) => b.key === bucketKey)!;
  const rows = tasks[bucketKey];
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [reassignRow, setReassignRow] = React.useState<string | null>(null);

  // Main task <-> subtask tree (2026-08-29, user request — subtasks were
  // rendered as their own flat, same-level rows here, unlike every OTHER
  // task list in the app (ResizableTaskList's own tree), so a task with
  // several subtasks looked like several unrelated tasks). `tasks[bucketKey]`
  // is already filtered to ONE status bucket, and a subtask's status is
  // independent of its parent's — so a subtask only nests here when its
  // PARENT happens to land in this SAME bucket too (both share this
  // bucket's status); otherwise there's no parent row in this list to nest
  // under, and it stays a plain top-level row, same as before. EXPANDED by
  // default (collapsedParentIds tracks the exceptions) — same convention
  // ResizableTaskList's own parent/child tree already uses, so a task with
  // subtasks doesn't visually shrink when this feature first landed.
  const [collapsedParentIds, setCollapsedParentIds] = React.useState<Set<string>>(new Set());
  const toggleParentExpand = (id: string) =>
    setCollapsedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const { topLevelRows, childrenOf } = React.useMemo(() => {
    const allIds = new Set(rows.map((r) => r.runBlockId));
    const children = new Map<string, FlowDrillTask[]>();
    for (const r of rows) {
      if (r.parentId && allIds.has(r.parentId)) {
        const kids = children.get(r.parentId);
        if (kids) kids.push(r);
        else children.set(r.parentId, [r]);
      }
    }
    for (const kids of children.values()) {
      kids.sort((a, b) => (a.subtaskOrder ?? Number.MAX_SAFE_INTEGER) - (b.subtaskOrder ?? Number.MAX_SAFE_INTEGER));
    }
    const top = rows.filter((r) => !r.parentId || !allIds.has(r.parentId));
    return { topLevelRows: top, childrenOf: children };
  }, [rows]);

  const ownedRows = rows.filter((t) => myUserId && t.assigneeId === myUserId);
  const allOwnedSelected = ownedRows.length > 0 && ownedRows.every((t) => selectedIds.has(t.runBlockId));
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds(allOwnedSelected ? new Set() : new Set(ownedRows.map((t) => t.runBlockId)));
  };

  // Bulk actions only ever touch tasks that are BOTH selected AND still
  // owned by the viewer — a selection can never include anyone else's row
  // (no checkbox is ever rendered for one), but this is defense-in-depth to
  // match the per-row dropdown's own eligibility rules. Targets run
  // concurrently (independent rows, no shared transaction); any that reject
  // stay selected afterward so a retry only touches what actually failed.
  // See ResizableTaskList's runBulk for why "failed" is now { ok: false },
  // not a rejection — actions return errors instead of throwing them.
  const runBulk = async (
    action: ((id: string) => Promise<ActionResult>) | undefined,
    eligible: (t: FlowDrillTask) => boolean,
  ): Promise<ActionResult> => {
    if (!action) return { ok: true };
    const targets = rows.filter((t) => selectedIds.has(t.runBlockId) && eligible(t));
    const results = await Promise.allSettled(targets.map((t) => action(t.runBlockId)));
    const failedIds = targets
      .filter((_, i) => {
        const r = results[i];
        return r.status === "rejected" || !r.value.ok;
      })
      .map((t) => t.runBlockId);
    setSelectedIds(new Set(failedIds));
    if (failedIds.length === 0) return { ok: true };
    return {
      ok: false,
      message: `${failedIds.length} of ${targets.length} task${targets.length === 1 ? "" : "s"} failed to update.`,
    };
  };

  // Every row in this modal already shares ONE status (that's what a bucket
  // is), so the available bulk actions are a function of `bucketKey` alone —
  // "Completed"/"N/A" buckets only ever offer reopen, "Pending" only ever
  // offers Completed/N-A, mirroring the per-row dropdown's own disabled
  // rules (StatusDropdown's canReopen/canMarkDone/canMarkNA) one bucket at a
  // time instead of per-row.
  const bulkActions: { key: string; label: string; icon: React.ReactNode; onRun: () => Promise<ActionResult> }[] = [];
  if (bucketKey === "pending") {
    if (onComplete) {
      bulkActions.push({
        key: "complete",
        label: "Mark Completed",
        icon: (
          <span className="flex size-2.5 shrink-0 items-center justify-center text-[10px] font-bold text-emerald-500">
            ✓
          </span>
        ),
        onRun: () =>
          runBulk(onComplete, (t) => t.quickCompletable && t.assigneeId === myUserId && !isLockedDueDay(t)),
      });
    }
    if (onSkip) {
      bulkActions.push({
        key: "na",
        label: "Mark N/A",
        icon: <span className="size-2.5 shrink-0 rounded-full bg-amber-400" />,
        onRun: () => runBulk(onSkip, (t) => t.assigneeId === myUserId && !isLockedDueDay(t)),
      });
    }
  } else if (onReopen) {
    bulkActions.push({
      key: "reopen",
      label: "Mark Pending",
      icon: <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white dark:bg-slate-900" />,
      onRun: () => runBulk(onReopen, (t) => t.assigneeId === myUserId && !isLockedDueDay(t)),
    });
  }
  // Past-day lock (2026-08-05) — same trigger-level lock as ResizableTaskList's
  // bulk button; see its comment for the mixed-selection rationale.
  const selectedBulkRows = rows.filter((t) => selectedIds.has(t.runBlockId));
  const allSelectedLocked = selectedBulkRows.length > 0 && selectedBulkRows.every(isLockedDueDay);

  /** One row — a main task (optionally with an expand/collapse chevron +
   *  subtask count when `tree.kind === "parent"`) or an indented subtask
   *  (`tree.kind === "child"`). Same row content/actions either way; only
   *  the leading chevron-or-indent differs. */
  const renderDrillRow = (
    t: FlowDrillTask,
    opts: { tree?: { kind: "parent"; count: number; expanded: boolean; onToggle: () => void } | { kind: "child" } },
  ) => {
    const due = t.dueAt ? new Date(t.dueAt) : null;
    const dueDisplay = formatDueDate(due);
    const isOwned = Boolean(myUserId) && t.assigneeId === myUserId;
    const canReassign = bucketKey === "pending" && Boolean(reassign);
    return (
      <div
        key={t.runBlockId}
        className="py-2 [&:has(button[aria-expanded='true'])]:relative [&:has(button[aria-expanded='true'])]:z-30"
      >
        <div className="flex items-center gap-2.5">
          {opts.tree?.kind === "parent" ? (
            <button
              type="button"
              onClick={opts.tree.onToggle}
              aria-expanded={opts.tree.expanded}
              aria-label={opts.tree.expanded ? "Collapse subtasks" : "Expand subtasks"}
              className="flex shrink-0 items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <ChevronIcon expanded={opts.tree.expanded} className="size-3.5" />
              <span className="text-[10px] font-semibold">{opts.tree.count}</span>
            </button>
          ) : (
            opts.tree?.kind === "child" && <span className="w-4 shrink-0" aria-hidden />
          )}
          {isOwned && (
            <input
              type="checkbox"
              checked={selectedIds.has(t.runBlockId)}
              onChange={() => toggleSelect(t.runBlockId)}
              aria-label={`Select ${t.blockTitle}`}
              className="size-4 shrink-0 rounded border-gray-300 accent-blue-600 dark:border-slate-500"
            />
          )}
          <StatusDropdown task={t} myUserId={myUserId} onComplete={onComplete} onSkip={onSkip} onReopen={onReopen} />
          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm font-semibold ${
                t.status === "DONE" ? "text-gray-400 line-through" : "text-gray-900 dark:text-slate-100"
              }`}
            >
              {t.blockTitle}
            </p>
            {!isOwned && (
              <p className="truncate text-xs text-gray-500 dark:text-slate-400">by {t.assigneeName}</p>
            )}
            {/* "Assigned by" (2026-07-30) — the viewer's OWN rows
                show who assigned them (assigner cards / personal
                donut drills); rows about other people keep the
                assignee line above instead. */}
            {isOwned && t.assignerName && (
              <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                Assigned by {t.assignerName}
              </p>
            )}
          </div>
          {/* Assignee avatar (2026-08-22, ClickUp-style reference)
              — initials on a per-person color, same InitialAvatar
              every other assignee chip in the app already uses
              (no photo data exists to show a real picture). Shown
              on every row, own or not, matching the reference's
              per-row avatar regardless of ownership. */}
          <InitialAvatar name={t.assigneeName} id={t.assigneeId} className="size-6 shrink-0 text-[10px]" />
          {/* Proof (2026-07-30): ＋ upload on the viewer's own
              rows, 📎 view for anyone once uploaded. Only takes
              space when actionable/present — the modal is too
              narrow for a dash placeholder column. */}
          {(t.proofIds.length > 0 || (isOwned && onUploadProof)) && (
            <ProofCell
              task={t}
              isOwned={isOwned}
              onUploadProof={onUploadProof}
              onRemoveProof={onRemoveProof}
            />
          )}
          {dueDisplay && (
            <span className={`shrink-0 text-xs ${dueDisplay.className}`}>{dueDisplay.text}</span>
          )}
          {canReassign && (
            <button
              type="button"
              onClick={() =>
                setReassignRow(reassignRow === t.runBlockId ? null : t.runBlockId)
              }
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                reassignRow === t.runBlockId
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900 dark:text-blue-300"
                  : "border-gray-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400 dark:hover:border-blue-500 dark:hover:bg-blue-900"
              }`}
            >
              Assign to Others
            </button>
          )}
        </div>
        {canReassign && reassign && reassignRow === t.runBlockId && (
          <ReassignPicker
            staff={reassign.staff}
            currentAssigneeId={t.assigneeId}
            onPick={async (userId) => {
              const r = await reassign.action(t.runBlockId, userId);
              if (r.ok) setReassignRow(null);
              return r;
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-slate-800">
          <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
            {name} — {meta.label}
          </p>
          <span className="text-xs text-gray-400 dark:text-slate-500">{rows.length}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>
        {ownedRows.length > 0 && (
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={allOwnedSelected}
                onChange={toggleSelectAll}
                className="size-4 rounded border-gray-300 accent-blue-600 dark:border-slate-500"
              />
              Select all
            </label>
            {selectedIds.size > 0 && bulkActions.length > 0 && (
              <BulkActionsButton count={selectedIds.size} actions={bulkActions} disabled={allSelectedLocked} />
            )}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
            No {meta.label.toLowerCase()} tasks this period.
          </p>
        ) : (
          <>
            {/* Slim column header (2026-07-30) — the modal is too narrow
                for the full three-column header, so just Task | Due date. */}
            <div className="flex items-center justify-between gap-2.5 border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:border-slate-800 dark:text-slate-500">
              <span>Task</span>
              <span>Due date</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {topLevelRows.map((t) => {
              const kids = childrenOf.get(t.runBlockId) ?? [];
              const expanded = !collapsedParentIds.has(t.runBlockId);
              return (
                <React.Fragment key={t.runBlockId}>
                  {renderDrillRow(t, {
                    tree:
                      kids.length > 0
                        ? { kind: "parent", count: kids.length, expanded, onToggle: () => toggleParentExpand(t.runBlockId) }
                        : undefined,
                  })}
                  {kids.length > 0 &&
                    expanded &&
                    kids.map((k) => renderDrillRow(k, { tree: { kind: "child" } }))}
                </React.Fragment>
              );
            })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Round initial avatar. Colored per-person (same id -> same hue everywhere,
 *  including the Manpower Schedule grid) when `id` is given; a neutral
 *  default otherwise. `className` overrides size/text-size for compact
 *  contexts (e.g. a table row) — defaults to the original fixed size. */
export function InitialAvatar({
  name,
  id,
  className = "size-8 text-xs",
}: {
  name: string;
  id?: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className} ${
        id ? personSolidColor(id) : "bg-slate-400"
      }`}
    >
      {initials}
    </span>
  );
}
