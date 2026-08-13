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
import { flowBucketTotal, formatDueDate, isPastDueDay, isFutureDueDay } from "./types";
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
    <p className="absolute left-0 top-5 z-20 w-44 whitespace-normal rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-normal normal-case text-red-600 shadow-md">
      {text}
    </p>
  );
}

export const BUCKET_META = [
  { key: "completed", label: "Completed", dot: "bg-emerald-500", stroke: "stroke-emerald-500" },
  { key: "pending", label: "Pending", dot: "bg-red-400", stroke: "stroke-red-400" },
  { key: "na", label: "N/A", dot: "bg-amber-400", stroke: "stroke-amber-400" },
] as const;

export type BucketKey = (typeof BUCKET_META)[number]["key"];

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
      className={`mt-2 flex items-center justify-between gap-3 pb-2 text-lg font-semibold text-gray-900 ${
        hideBorder ? "" : "border-b border-gray-200"
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
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/** 3-segment status donut (SVG stroke arcs), center = children (count or %). */
export function StatusDonut({
  totals,
  size = 120,
  strokeWidth = 14,
  onSegmentClick,
  children,
}: {
  totals: FlowBucketTotals;
  size?: number;
  strokeWidth?: number;
  /** Makes segments clickable (drill into a status bucket). */
  onSegmentClick?: (key: BucketKey) => void;
  children?: React.ReactNode;
}) {
  const total = flowBucketTotal(totals);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const segments = BUCKET_META.map((b) => {
    const frac = total > 0 ? totals[b.key] / total : 0;
    const seg = { ...b, dash: frac * c, offset };
    offset += frac * c;
    return seg;
  });

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-gray-100"
        />
        {segments.map((s) =>
          s.dash > 0 ? (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={strokeWidth}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.offset}
              onClick={onSegmentClick ? () => onSegmentClick(s.key) : undefined}
              className={`${s.stroke} ${
                onSegmentClick ? "cursor-pointer transition-opacity hover:opacity-75" : ""
              }`}
            >
              <title>{`${s.label}: ${totals[s.key]}`}</title>
            </circle>
          ) : null,
        )}
      </svg>
      {/* pointer-events-none: this overlay must never swallow segment clicks */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
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
            <span className="text-gray-600">{b.label}</span>
            <span className="ml-auto font-semibold text-gray-900">{totals[b.key]}</span>
            <span className="w-9 text-right text-xs text-gray-400">
              {total > 0 ? Math.round((totals[b.key] / total) * 100) : 0}%
            </span>
          </>
        );
        return onSelect ? (
          <button
            key={b.key}
            type="button"
            onClick={() => onSelect(b.key)}
            className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-gray-50"
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
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-gray-100 ${className}`}>
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const STATUS_CHIP: Record<FlowTaskRow["status"], { label: string; className: string }> = {
  DONE: { label: "Completed", className: "bg-emerald-50 text-emerald-700" },
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-600" },
  ACTIVE: { label: "In progress", className: "bg-indigo-50 text-indigo-700" },
  OVERDUE: { label: "Overdue", className: "bg-amber-100 text-amber-800" },
  ESCALATED: { label: "Escalated", className: "bg-rose-100 text-rose-800" },
  SKIPPED: { label: "N/A", className: "bg-stone-100 text-stone-500" },
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
  return "border-2 border-red-400 bg-white";
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
 *  for elevated viewers completing on someone else's behalf. */
function isLockedDueDay(task: Pick<FlowTaskRow, "cadence" | "dueAt">): boolean {
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
              setMenuPos({ top: rect.bottom + 4, left: rect.left });
            }
            return next;
          });
        }}
        className="flex size-3 shrink-0 items-center justify-center disabled:opacity-50"
      >
        {circle}
      </button>
      {errorText && <InlineActionError text={errorText} />}
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-30 w-40 rounded-lg border border-gray-200 bg-white py-1.5 shadow-md"
          >
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Statuses</p>
          <button
            type="button"
            role="menuitem"
            disabled={!canReopen}
            onClick={() => run(onReopen)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white" />
            Pending
          </button>
          <div className="my-1 border-t border-gray-100" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Closed</p>
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
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
          completing ? "bg-emerald-500" : "bg-white"
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
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100"
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
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Guideline</h4>
                <p className="truncate text-xs text-gray-500">{title}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            {guideline.url && (
              <a
                href={guideline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block truncate rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-blue-600 hover:border-blue-300 hover:underline"
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
                  className="max-h-[60vh] w-full rounded-xl border border-gray-200 object-contain"
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
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-50 px-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-100"
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
          className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-sm leading-none text-gray-400 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
        >
          {uploading ? "…" : "＋"}
        </button>
      ) : (
        <span className="text-xs text-gray-300">—</span>
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
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">Proof Of Completion</h4>
                <p className="truncate text-xs text-gray-500">{task.blockTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                      className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
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
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold leading-none text-gray-400 opacity-0 hover:border-red-300 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 [@media(hover:none)]:opacity-100"
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
                <p className="mb-1 text-xs font-medium text-gray-500">Ready to upload</p>
                <div className="flex flex-wrap gap-2">
                  {pending.map((p) => (
                    <div key={p.localId} className="group relative">
                      <div className="block size-16 overflow-hidden rounded-lg border border-dashed border-blue-300 bg-blue-50">
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
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold leading-none text-gray-400 opacity-0 hover:border-red-300 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 [@media(hover:none)]:opacity-100"
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
                  <p className="mt-2 text-center text-[11px] text-gray-400">
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
                    className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : canUpload && atCap ? (
              <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500">
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
                className="w-full rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
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
                    dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50"
                  }`}
                >
                  <span className="text-xl" aria-hidden>
                    🖼️
                  </span>
                  <p className="text-sm font-medium text-gray-600">Drop an Image Here</p>
                  <p className="text-xs text-gray-400">or Paste It (Ctrl+V)</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                  >
                    📁 Upload File
                  </button>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void openCamera()}
                    className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                  >
                    📷 Take Photo
                  </button>
                </div>
              </>
            ) : isCompleted && isOwned ? (
              <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500">
                🔒 Task is complete — photos are locked.
              </p>
            ) : null}
            {cameraError && <p className="mt-2 text-xs text-amber-600">{cameraError}</p>}
            <ErrorLine error={error} />
            {canUpload && !atCap && !cameraOpen && (
              <p className="mt-2 text-[11px] text-gray-400">
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
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">Proof</h4>
                <p className="truncate text-xs text-gray-500">{task.blockTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setEnlargedId(null)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                className="max-h-[60vh] w-full rounded-xl border border-gray-200 object-contain"
              />
            </a>
            {canRemove && (
              <button
                type="button"
                disabled={removingId === enlargedId}
                onClick={() => {
                  if (enlargedId) void handleRemove(enlargedId);
                }}
                className="mt-3 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
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

/** Click-and-drag horizontal scroll for one line of un-truncated text
 *  (2026-08-13, TaskRowLine's title/subtitle — replaces the earlier
 *  truncate+tooltip approach: text no longer clips with an ellipsis, it
 *  overflows into a horizontally scrollable strip instead). Touch devices
 *  already get native swipe-scrolling for free from `overflow-x-auto`
 *  (no JS involved), so this hook deliberately does nothing for touch
 *  pointers — only `pointerType === "mouse"` triggers the custom drag,
 *  which is otherwise NOT a native browser behavior (only the visible
 *  scrollbar handle and shift+wheel are). Each call returns its own
 *  independent ref/state, so the title and subtitle each get their own
 *  scroll position — call it once per scrollable line, not shared. */
function useDragScroll<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const drag = React.useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const onPointerDown = (e: React.PointerEvent<T>) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    drag.current = { startX: e.clientX, startScrollLeft: ref.current.scrollLeft };
    ref.current.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<T>) => {
    if (!drag.current || !ref.current) return;
    ref.current.scrollLeft = drag.current.startScrollLeft - (e.clientX - drag.current.startX);
  };
  const endDrag = (e: React.PointerEvent<T>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    ref.current?.releasePointerCapture(e.pointerId);
  };

  return {
    ref,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
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
  hideStatusChip,
  reassign,
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
  /** Suppress the status text badge (Completed/Pending/In progress/etc.) —
   *  only relevant outside hideCompleted mode, which never renders it
   *  anyway (2026-08-13, same EntityCardOverview motivation as
   *  hideDueDate). */
  hideStatusChip?: boolean;
  /** "Assign to Others" self-service handoff (2026-08-13): when provided
   *  and this row is the viewer's own pending task, renders a trigger that
   *  opens the same inline ReassignPicker the manager-oversight
   *  EntityDrillModal already uses. reassignFlowTask itself re-checks
   *  authorization (self-service is scoped server-side to same department/
   *  branch) — this prop only controls whether the trigger renders. */
  reassign?: ReassignControl;
}) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const dueDisplay = formatDueDate(due);
  const isOwned = Boolean(myUserId) && task.assigneeId === myUserId;
  const canComplete = Boolean(onComplete) && task.quickCompletable && isOwned && !isLockedDueDay(task);
  const canReassign = Boolean(reassign) && isOwned && task.status !== "DONE" && task.status !== "SKIPPED";
  const [reassignOpen, setReassignOpen] = React.useState(false);
  // Horizontal drag/swipe-to-scroll (2026-08-13) — replaces truncate+tooltip;
  // see useDragScroll's own doc comment above.
  const titleScroll = useDragScroll<HTMLParagraphElement>();
  const subtitleScroll = useDragScroll<HTMLParagraphElement>();

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
    <div>
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
          className={`size-4 shrink-0 rounded border-gray-300 accent-blue-600 transition-opacity ${
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
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-base leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
          <span className="w-px bg-gray-200" />
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
        <span className="size-3 shrink-0 rounded-full border-2 border-red-300 bg-white" />
      )}
      <div
        className={`relative min-w-0 ${effectiveNameWidth === undefined ? "flex-1" : "shrink-0"}`}
        style={effectiveNameWidth === undefined ? undefined : { width: effectiveNameWidth }}
      >
        <div className="flex min-w-0 items-center gap-1.5 pr-2">
          <p
            ref={titleScroll.ref}
            className={`min-w-0 overflow-x-auto whitespace-nowrap text-sm font-semibold [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              titleScroll.dragging ? "cursor-grabbing select-none" : "cursor-grab"
            } ${task.status === "DONE" ? "text-gray-400 line-through" : "text-gray-900"}`}
            onPointerDown={titleScroll.onPointerDown}
            onPointerMove={titleScroll.onPointerMove}
            onPointerUp={titleScroll.onPointerUp}
            onPointerCancel={titleScroll.onPointerCancel}
          >
            {task.blockTitle}
          </p>
          {tree?.kind === "parent" && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
              {tree.count}
            </span>
          )}
          {task.fromSchedule && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">
              <span className="size-1 rounded-full bg-violet-500" />
              Scheduled
            </span>
          )}
          {task.guideline && (
            <GuidelineIndicator guideline={task.guideline} title={task.blockTitle} />
          )}
        </div>
        {!hideCompleted && (
          <p
            ref={subtitleScroll.ref}
            className={`overflow-x-auto whitespace-nowrap pr-2 text-xs text-gray-500 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              subtitleScroll.dragging ? "cursor-grabbing select-none" : "cursor-grab"
            }`}
            onPointerDown={subtitleScroll.onPointerDown}
            onPointerMove={subtitleScroll.onPointerMove}
            onPointerUp={subtitleScroll.onPointerUp}
            onPointerCancel={subtitleScroll.onPointerCancel}
          >
            {task.runName} · {task.flowName}
          </p>
        )}
        {onResizeStart && (
          <div
            onPointerDown={onResizeStart}
            title="Drag to resize"
            className="absolute -right-1.5 top-0 flex h-full w-3 cursor-col-resize touch-none items-center justify-center"
          >
            <div className="h-full w-px bg-gray-200 hover:w-0.5 hover:bg-blue-400" />
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
      {hideCompleted && (
        <span
          className={`truncate text-xs text-gray-500 ${
            assignerWidth === undefined ? "min-w-0 flex-1" : "shrink-0"
          }`}
          style={assignerWidth === undefined ? undefined : { width: assignerWidth }}
        >
          {task.assignerName ?? <span className="text-gray-300">—</span>}
        </span>
      )}
      {/* Due Date: in table mode a FIXED column (constant width/position,
          always rendered — dash when no due date); outside the table the
          original content-sized badge. Suppressed entirely by hideDueDate
          (2026-08-13, EntityCardOverview's plain-checklist cards). */}
      {!hideDueDate &&
        (hideCompleted ? (
          <span className="shrink-0 truncate text-xs" style={{ width: DUE_COL_WIDTH }}>
            {dueDisplay ? (
              <span className={dueDisplay.className}>{dueDisplay.text}</span>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </span>
        ) : (
          dueDisplay && (
            <span className={`shrink-0 text-xs ${dueDisplay.className}`}>{dueDisplay.text}</span>
          )
        ))}
      {!hideCompleted && !hideStatusChip && <StatusChip status={task.status} />}
      {canReassign && (
        <button
          type="button"
          onClick={() => setReassignOpen((o) => !o)}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            reassignOpen
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : "border-gray-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50"
          }`}
        >
          Assign to Others
        </button>
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

const RESIZABLE_TASK_NAME_MIN = 120;
const RESIZABLE_TASK_NAME_MAX = 480;
const RESIZABLE_TASK_NAME_DEFAULT = 220;

/** Fixed widths for the non-resizable My Tasks columns (2026-07-30 final:
 *  ONLY Task is draggable — long names are the one thing worth revealing;
 *  Proof / Assigned by / Due date keep constant size, no handles). Proof
 *  is 96px so its two-line "Proof of Completion" header label fits. */
const PROOF_COL_WIDTH = 96;

/** localStorage key for the unresolved-subtasks completion warning —
 *  "off" suppresses the modal (per browser; default on). */
const SUBTASK_WARNING_KEY = "tm-subtask-warning";
const ASSIGNER_COL_WIDTH = 180;
/** Due Date is a true fixed column too (2026-07-30 final spec) — constant
 *  width at a constant position right after Assignee, NOT pinned to the
 *  container's right edge (ml-auto made its position drift with screen
 *  width). Wide enough for the longest value ("29/7 Yesterday"). */
const DUE_COL_WIDTH = 120;

/** The Task header's drag handle — same visual as TaskRowLine's in-row
 *  handle (thin divider that thickens/blues on hover). */
function HeaderResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      title="Drag to resize"
      className="absolute -right-1.5 top-1/2 flex h-4 w-3 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center"
    >
      <span className="h-4 w-px bg-gray-300 hover:w-0.5 hover:bg-blue-400" />
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
 * visible, its own color per status, a text badge). When set: `TaskRowLine`
 * switches every row to the status-dropdown circle and drops the status text
 * badge. All three status buckets default to VISIBLE — independent "Show
 * Completed"/"Show Pending"/"Show N/A" toggles (local state, reset on
 * reload, all default ON) let the viewer decompose down to any combination,
 * matching the status donut's own three buckets (2026-08-11: Pending/N-A
 * toggles added alongside the original Show Completed one).
 */
/** Pill-track toggle switch (gray/off, blue/on, sliding knob) — used by
 *  ResizableTaskList's "Show Completed"/"Show Pending"/"Show N/A" controls;
 *  generic enough to reuse anywhere else a plain on/off needs this exact
 *  visual style. */
function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

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

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
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
        type="button"
        aria-label="Bulk actions"
        disabled={busy || disabled}
        onClick={() => {
          setErrorText(null);
          setOpen((o) => !o);
        }}
        className="rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Updating…" : `(${count}) ▾`}
      </button>
      {errorText && <InlineActionError text={errorText} />}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-gray-200 bg-white py-1.5 shadow-md"
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => run(a.onRun)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
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
  assigneeColumnLabel,
  hideRowResizeDivider,
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
}) {
  const [nameWidthPx, setNameWidthPx] = React.useState(RESIZABLE_TASK_NAME_DEFAULT);
  // All three default to ON — nothing is hidden until the viewer toggles one
  // off. Mirrors the status donut's own three buckets (Completed/Pending/
  // N-A) so "My Tasks" can be decluttered down to any combination of them,
  // not just Completed (2026-08-11: Pending/N-A toggles added alongside the
  // original Show Completed one).
  const [showCompleted, setShowCompleted] = React.useState(true);
  const [showPending, setShowPending] = React.useState(true);
  const [showNA, setShowNA] = React.useState(true);
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
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ x: number; width: number; latest: number } | null>(null);

  // Header and rows read the Task column's width from a CSS variable on
  // the list container, NOT from React state directly. During a drag the
  // pointermove handler writes the variable straight onto the DOM node —
  // zero React re-renders per mouse move (re-rendering every TaskRowLine
  // per move is what made dragging visibly lag) — and the width is
  // committed to state ONCE on pointerup so later re-renders keep it.
  const containerStyle = { "--tm-col-name": `${nameWidthPx}px` } as React.CSSProperties;

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { x: e.clientX, width: nameWidthPx, latest: nameWidthPx };
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.min(
        RESIZABLE_TASK_NAME_MAX,
        Math.max(RESIZABLE_TASK_NAME_MIN, drag.width + (ev.clientX - drag.x)),
      );
      drag.latest = next;
      containerRef.current?.style.setProperty("--tm-col-name", `${next}px`);
    };
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (drag) setNameWidthPx(drag.latest);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };
  const nameWidth = "var(--tm-col-name)";

  const completedCount = hideCompleted ? tasks.filter((t) => t.status === "DONE").length : 0;
  const naCount = hideCompleted ? tasks.filter((t) => t.status === "SKIPPED").length : 0;
  // "Pending" here matches the status donut's own bucket: everything that's
  // neither DONE nor SKIPPED (PENDING/ACTIVE/OVERDUE/ESCALATED alike) — see
  // types.ts's flowBucketize.
  const pendingCount = hideCompleted
    ? tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED").length
    : 0;
  const visibleTasks = hideCompleted
    ? tasks.filter((t) => {
        if (t.status === "DONE") return showCompleted;
        if (t.status === "SKIPPED") return showNA;
        return showPending;
      })
    : tasks;

  // Main Task ↔ Subtask tree (2026-07-30, table mode only): group rows
  // under their parent, chevron-expandable (EXPANDED by default —
  // collapsedIds tracks the exceptions). A subtask whose parent isn't in
  // this list (different period window, or parent hidden by Show
  // Completed) renders as a top-level row instead of vanishing.
  const visibleIds = new Set(visibleTasks.map((t) => t.runBlockId));
  const childrenOf = new Map<string, FlowTaskRow[]>();
  if (hideCompleted) {
    for (const t of visibleTasks) {
      if (t.parentId && visibleIds.has(t.parentId)) {
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
  const topLevelTasks = hideCompleted
    ? visibleTasks.filter((t) => !t.parentId || !visibleIds.has(t.parentId))
    : visibleTasks;
  const hasTree = childrenOf.size > 0;
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
  const ownedVisibleTasks = visibleTasks.filter((t) => myUserId && t.assigneeId === myUserId);
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
    const targets = visibleTasks.filter((t) => selectedIds.has(t.runBlockId) && eligible(t));
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

  // Deliberately just these two — no bulk reopen here, matching the per-row
  // dropdown's own scope for a flat mixed-status list (unlike
  // EntityDrillModal, which is bucket-scoped and offers reopen when the
  // whole bucket being viewed is Completed/N-A).
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
  // Past-day lock (2026-08-05): the WHOLE bulk-actions control goes inert
  // when every currently-selected task is locked — mirrors StatusDropdown's
  // own trigger-level lock rather than relying on per-action eligibility
  // alone. A mixed selection (some locked, some not) leaves the button
  // enabled; the eligible() filters above silently skip the locked ones
  // when it runs, same as any other ineligible row already does.
  const selectedBulkTasks = visibleTasks.filter((t) => selectedIds.has(t.runBlockId));
  const allSelectedLocked = selectedBulkTasks.length > 0 && selectedBulkTasks.every(isLockedDueDay);

  // Select-all moved INTO the column header row (2026-07-31) — this slim
  // bar now only appears when it has something to show: the bulk-actions
  // trigger (rows selected) and/or at least one of the three Show
  // Completed/Pending/N-A toggles (each only rendered when its own bucket
  // is non-empty, same as Show Completed always was).
  const controlBar = hideCompleted &&
    ((selectedIds.size > 0 && bulkActions.length > 0) ||
      completedCount > 0 ||
      pendingCount > 0 ||
      naCount > 0) && (
      <div className="flex items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && bulkActions.length > 0 && (
            <BulkActionsButton count={selectedIds.size} actions={bulkActions} disabled={allSelectedLocked} />
          )}
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <ToggleSwitch checked={showPending} onChange={() => setShowPending((s) => !s)} label="Show Pending" />
          )}
          {naCount > 0 && (
            <ToggleSwitch checked={showNA} onChange={() => setShowNA((s) => !s)} label="Show N/A" />
          )}
          {completedCount > 0 && (
            <ToggleSwitch checked={showCompleted} onChange={() => setShowCompleted((s) => !s)} label="Show Completed" />
          )}
        </div>
      </div>
    );

  if (visibleTasks.length === 0) {
    // Distinguishes "genuinely nothing assigned" (emptyLabel) from "there
    // ARE tasks, they're just all hidden by the current Show
    // Completed/Pending/N-A toggles" — the latter can now happen from any
    // one of the three, not just Show Completed.
    const allFilteredOut = tasks.length > 0;
    return (
      <div>
        {controlBar}
        <p className="py-6 text-center text-sm text-gray-400">
          {allFilteredOut ? "No tasks match the current filters." : emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      {controlBar}
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
        <div className="group flex items-center gap-3 border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
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
              className={`size-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600 transition-opacity ${
                allOwnedSelected
                  ? "opacity-100"
                  : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              }`}
            />
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          {hasTree && <span className="w-6 shrink-0" aria-hidden />}
          <span className="w-3 shrink-0" aria-hidden />
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
              a "tasks I assigned" list. */}
          <span className="shrink-0 truncate" style={{ width: ASSIGNER_COL_WIDTH }}>
            {assigneeColumnLabel ?? "Assignee"}
          </span>
          <span className="shrink-0 truncate" style={{ width: DUE_COL_WIDTH }}>
            Due Date
          </span>
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {topLevelTasks.map((t) => {
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
                    selected={selectedIds.has(k.runBlockId)}
                    onToggleSelect={hideCompleted ? toggleSelect : undefined}
                    tree={{ kind: "child" }}
                  />
                ))}
            </React.Fragment>
          );
        })}
      </div>
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
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h4 className="text-base font-semibold text-gray-900">
                  {confirmTarget.parents.length === 1
                    ? `This task has ${confirmTarget.unresolved.length} unresolved item${confirmTarget.unresolved.length === 1 ? "" : "s"}`
                    : `These ${confirmTarget.parents.length} tasks have ${confirmTarget.unresolved.length} unresolved items`}
                </h4>
                <button
                  type="button"
                  onClick={closeConfirm}
                  aria-label="Close"
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSubsOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <span>
                  {confirmTarget.unresolved.length} Subtask
                  {confirmTarget.unresolved.length === 1 ? "" : "s"}
                </span>
                <span
                  className={`text-gray-400 transition-transform ${confirmSubsOpen ? "rotate-90" : ""}`}
                  aria-hidden
                >
                  ›
                </span>
              </button>
              {confirmSubsOpen && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-2">
                  {confirmTarget.unresolved.map((k) => (
                    <li key={k.runBlockId} className="flex items-center gap-2 px-2 py-1 text-sm text-gray-700">
                      <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white" />
                      <span className="min-w-0 flex-1 truncate">{k.blockTitle}</span>
                    </li>
                  ))}
                </ul>
              )}
              {confirmError && <p className="mt-3 text-xs text-red-600">{confirmError}</p>}
              {warnSettingsOpen && (
                <label className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={warnEnabled}
                    onChange={(e) => setWarning(e.target.checked)}
                    className="size-4 rounded border-gray-300 accent-blue-600"
                  />
                  Warn me when completing a task with unresolved subtasks
                </label>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWarnSettingsOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
                >
                  <span aria-hidden>⚙️</span> Warning Settings
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={confirmBusy}
                    onClick={() => void continueWithoutResolving()}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 disabled:opacity-50"
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
}: {
  title: string;
  /** Period line under the title; omit for un-periodized overview cards. */
  subtitle?: string;
  totals: FlowBucketTotals;
  tasks?: Record<BucketKey, FlowDrillTask[]>;
  /** Rendered top-right (e.g. the Daily/Monthly toggle). */
  action?: React.ReactNode;
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
    <div className="relative rounded-2xl border border-gray-200 bg-white px-6 py-8 shadow-sm">
      {action && actionPlacement === "corner" && (
        <div className="absolute right-4 top-4">{action}</div>
      )}
      {action && actionPlacement === "row" && (
        <div className="mb-3 flex flex-wrap justify-end">{action}</div>
      )}
      <p className="text-center text-lg font-semibold text-gray-900">{title}</p>
      {subtitle && <p className="text-center text-sm text-gray-500">{subtitle}</p>}

      <div className="mt-5 flex flex-col items-center">
        <StatusDonut totals={totals} size={132} strokeWidth={20} onSegmentClick={drill} />
        <div className="mt-5 w-44">
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
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setError(null);
        }}
        placeholder="Search staff by name…"
        className={`mb-1.5 ${pickerSearchClass}`}
      />
      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
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
      {busy && <p className="mt-1 text-xs text-gray-400">Assigning…</p>}
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
      icon: <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white" />,
      onRun: () => runBulk(onReopen, (t) => t.assigneeId === myUserId && !isLockedDueDay(t)),
    });
  }
  // Past-day lock (2026-08-05) — same trigger-level lock as ResizableTaskList's
  // bulk button; see its comment for the mixed-selection rationale.
  const selectedBulkRows = rows.filter((t) => selectedIds.has(t.runBlockId));
  const allSelectedLocked = selectedBulkRows.length > 0 && selectedBulkRows.every(isLockedDueDay);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-3">
          <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
            {name} — {meta.label}
          </p>
          <span className="text-xs text-gray-400">{rows.length}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        {ownedRows.length > 0 && (
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <input
                type="checkbox"
                checked={allOwnedSelected}
                onChange={toggleSelectAll}
                className="size-4 rounded border-gray-300 accent-blue-600"
              />
              Select all
            </label>
            {selectedIds.size > 0 && bulkActions.length > 0 && (
              <BulkActionsButton count={selectedIds.size} actions={bulkActions} disabled={allSelectedLocked} />
            )}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            No {meta.label.toLowerCase()} tasks this period.
          </p>
        ) : (
          <>
            {/* Slim column header (2026-07-30) — the modal is too narrow
                for the full three-column header, so just Task | Due date. */}
            <div className="flex items-center justify-between gap-2.5 border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              <span>Task</span>
              <span>Due date</span>
            </div>
            <div className="divide-y divide-gray-100">
            {rows.map((t) => {
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
                    {isOwned && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.runBlockId)}
                        onChange={() => toggleSelect(t.runBlockId)}
                        aria-label={`Select ${t.blockTitle}`}
                        className="size-4 shrink-0 rounded border-gray-300 accent-blue-600"
                      />
                    )}
                    <StatusDropdown task={t} myUserId={myUserId} onComplete={onComplete} onSkip={onSkip} onReopen={onReopen} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-semibold ${
                          t.status === "DONE" ? "text-gray-400 line-through" : "text-gray-900"
                        }`}
                      >
                        {t.blockTitle}
                      </p>
                      {!isOwned && (
                        <p className="truncate text-xs text-gray-500">by {t.assigneeName}</p>
                      )}
                      {/* "Assigned by" (2026-07-30) — the viewer's OWN rows
                          show who assigned them (assigner cards / personal
                          donut drills); rows about other people keep the
                          assignee line above instead. */}
                      {isOwned && t.assignerName && (
                        <p className="truncate text-xs text-gray-500">
                          Assigned by {t.assignerName}
                        </p>
                      )}
                    </div>
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
                            ? "border-blue-400 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50"
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
