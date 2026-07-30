"use client";

// OSC integration package — shared presentational primitives. Pure SVG +
// standard Tailwind utility classes, no chart library, so the folder drops
// into OSC without new dependencies. Status colors follow the mockups:
// Completed green / Pending red / N/A yellow — never color alone (dot + label
// + count everywhere).

import * as React from "react";
import type {
  ActionResult,
  FlowBucketTotals,
  FlowDrillTask,
  FlowStaffMember,
  FlowTaskRow,
  ProofUploadHandler,
} from "./types";
import { flowBucketTotal, formatDueDate } from "./types";
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
export function PageSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 border-b border-gray-200 pb-2 text-sm font-semibold uppercase tracking-widest text-gray-500">
      {children}
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
  const isOwner = task.assigneeId === myUserId;

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

  const isResolved = task.status === "DONE" || task.status === "SKIPPED";
  const canReopen = Boolean(onReopen) && isResolved;
  const canMarkDone = Boolean(onComplete) && task.quickCompletable && task.status !== "DONE";
  const canMarkNA = Boolean(onSkip) && task.status !== "SKIPPED";

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        title="Change status"
        aria-label="Change status"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          setErrorText(null);
          setOpen((o) => !o);
        }}
        className="flex size-3 shrink-0 items-center justify-center disabled:opacity-50"
      >
        {circle}
      </button>
      {errorText && <InlineActionError text={errorText} />}
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-5 z-20 w-40 rounded-lg border border-gray-200 bg-white py-1.5 shadow-md"
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
        </div>
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
        📎 Guideline
      </button>
      {open && (
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
        </div>
      )}
    </>
  );
}

/** Client-side mirror of uploadFlowTaskProof's validation — same mimes and
 *  2 MB cap, so a bad pick fails instantly instead of round-tripping. */
const PROOF_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
const PROOF_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** The "Proof" column cell (2026-07-30): assignee-uploaded completion
 *  evidence, always optional (never gates the status dropdown). Owner of a
 *  proof-less row gets a ＋ upload button; once uploaded, EVERYONE sees a
 *  📎 that opens the image in a viewer modal (served by
 *  /api/task-manager/proof-image/[id]); the owner can replace it from
 *  there. Rows that are neither owned nor proven show a plain dash. */
function ProofCell({
  task,
  isOwned,
  onUploadProof,
}: {
  task: FlowTaskRow;
  isOwned: boolean;
  onUploadProof?: ProofUploadHandler;
}) {
  const [busy, setBusy] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  /** The "Attach proof" popover (2026-07-30): ONE surface accepting all 4
   *  input methods — file picker, drag-and-drop, clipboard paste, and
   *  camera capture — all funneling into the same uploadFile path. */
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  // A fresh upload shows its 📎 immediately (before the refreshed payload
  // arrives); `version` cache-busts the image URL after a replace, since a
  // re-upload keeps the same Proof id.
  const [localProofId, setLocalProofId] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** capture="environment" input — phones/tablets open the native camera
   *  app directly; desktop browsers ignore `capture` and fall back to the
   *  ordinary file picker (browser-defined behavior, no permission code). */
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const proofId = localProofId ?? task.proofId ?? null;
  const imageSrc = proofId
    ? `/api/task-manager/proof-image/${proofId}${version ? `?v=${version}` : ""}`
    : null;
  const canUpload = isOwned && Boolean(onUploadProof);

  /** The single upload path every input method funnels into — picker,
   *  drop, paste, and camera all end up here with a File. */
  const uploadFile = async (file: File) => {
    if (!onUploadProof) return;
    setErrorText(null);
    if (!PROOF_IMAGE_MIMES.includes(file.type)) {
      setErrorText("PNG, JPEG or WebP images only");
      return;
    }
    if (file.size > PROOF_IMAGE_MAX_BYTES) {
      setErrorText("Image is too large — max 2 MB");
      return;
    }
    setBusy(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const result = await onUploadProof(task.runBlockId, { mime: file.type, dataBase64 });
      if (result.ok) {
        setLocalProofId(result.proofId);
        setVersion((v) => v + 1);
        setAttachOpen(false);
      } else {
        setErrorText(result.message);
      }
    } catch {
      setErrorText("Could not read that file — please try again");
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadFile(file);
  };

  // While the popover is open: Ctrl/Cmd+V anywhere attaches the clipboard
  // image (screenshot-paste workflow), Escape closes. Document-level so
  // the user doesn't have to focus anything first.
  React.useEffect(() => {
    if (!attachOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void uploadFile(file);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAttachOpen(false);
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachOpen]);

  return (
    <span className="relative flex shrink-0 items-center justify-center">
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onFile}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFile}
          />
        </>
      )}
      {proofId ? (
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          title="View proof"
          aria-label={`View proof for ${task.blockTitle}`}
          className="inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-xs text-blue-600 hover:bg-blue-100"
        >
          📎
        </button>
      ) : canUpload ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setErrorText(null);
            setAttachOpen(true);
          }}
          title="Attach proof — drop, paste, upload, or take a photo"
          aria-label={`Attach proof for ${task.blockTitle}`}
          className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-sm leading-none text-gray-400 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
        >
          {busy ? "…" : "＋"}
        </button>
      ) : (
        <span className="text-xs text-gray-300">—</span>
      )}
      {errorText && !attachOpen && <InlineActionError text={errorText} />}
      {attachOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAttachOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">Attach proof</h4>
                <p className="truncate text-xs text-gray-500">{task.blockTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setAttachOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
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
                if (file) void uploadFile(file);
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50"
              }`}
            >
              <span className="text-xl" aria-hidden>
                🖼️
              </span>
              <p className="text-sm font-medium text-gray-600">Drop an image here</p>
              <p className="text-xs text-gray-400">or paste (Ctrl+V)</p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
              >
                📁 Upload file
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => cameraRef.current?.click()}
                className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
              >
                📷 Take Photo
              </button>
            </div>
            {busy && <p className="mt-2 text-xs text-gray-500">Uploading…</p>}
            {errorText && <p className="mt-2 text-xs text-red-600">{errorText}</p>}
            <p className="mt-2 text-[11px] text-gray-400">PNG / JPEG / WebP · max 2 MB</p>
          </div>
        </div>
      )}
      {viewerOpen && imageSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setViewerOpen(false)}
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
                onClick={() => setViewerOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <a href={imageSrc} target="_blank" rel="noopener noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt={`Proof for ${task.blockTitle}`}
                className="max-h-[60vh] w-full rounded-xl border border-gray-200 object-contain"
              />
            </a>
            {canUpload && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setViewerOpen(false);
                  setErrorText(null);
                  setAttachOpen(true);
                }}
                className="mt-3 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Replace image"}
              </button>
            )}
          </div>
        </div>
      )}
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
  nameWidth,
  proofWidth,
  assignerWidth,
  onResizeStart,
  hideCompleted,
  selected,
  onToggleSelect,
  tree,
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
   *  proof cell view-only (📎 still shows where proof exists). */
  onUploadProof?: ProofUploadHandler;
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
}) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const dueDisplay = formatDueDate(due);
  const isOwned = Boolean(myUserId) && task.assigneeId === myUserId;
  const canComplete = Boolean(onComplete) && task.quickCompletable && isOwned;

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
    <div
      className={`flex items-center gap-3 py-2.5 [&:has(button[aria-expanded="true"])]:relative [&:has(button[aria-expanded="true"])]:z-30 ${
        hideCompleted && (task.status === "DONE" || task.status === "SKIPPED") ? "opacity-60" : ""
      }`}
    >
      {hideCompleted && isOwned && onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onToggleSelect(task.runBlockId)}
          aria-label={`Select ${task.blockTitle}`}
          className="size-4 shrink-0 rounded border-gray-300 accent-blue-600"
        />
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
            className="flex w-4 shrink-0 items-center justify-center text-[10px] text-gray-400 hover:text-gray-600"
          >
            {tree.expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        ))}
      {isChild && <span className="w-5 shrink-0" aria-hidden />}
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
            className={`min-w-0 truncate text-sm font-semibold ${
              task.status === "DONE" ? "text-gray-400 line-through" : "text-gray-900"
            }`}
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
          <p className="truncate pr-2 text-xs text-gray-500">
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
          <ProofCell task={task} isOwned={isOwned} onUploadProof={onUploadProof} />
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
          original content-sized badge. */}
      {hideCompleted ? (
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
      )}
      {!hideCompleted && <StatusChip status={task.status} />}
    </div>
  );
}

const RESIZABLE_TASK_NAME_MIN = 120;
const RESIZABLE_TASK_NAME_MAX = 480;
const RESIZABLE_TASK_NAME_DEFAULT = 220;

/** Fixed widths for the non-resizable My Tasks columns (2026-07-30 final:
 *  ONLY Task is draggable — long names are the one thing worth revealing;
 *  Proof / Assigned by / Due date keep constant size, no handles). */
const PROOF_COL_WIDTH = 48;
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
 * badge. Completed (DONE) tasks default to VISIBLE — a single "Show
 * Completed" toggle (local state, resets on reload, defaults ON) lets the
 * viewer hide them for a decluttered Pending/N-A-only view. N/A (SKIPPED)
 * tasks have no toggle of their own — they're always shown, same as any
 * other non-terminal status.
 */
/** Pill-track toggle switch (gray/off, blue/on, sliding knob) — used by
 *  ResizableTaskList's "Show Completed"/"Show N/A" controls; generic enough
 *  to reuse anywhere else a plain on/off needs this exact visual style. */
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
}: {
  count: number;
  actions: { key: string; label: string; icon: React.ReactNode; onRun: () => Promise<ActionResult> }[];
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
          disabled={busy || !only}
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
        disabled={busy}
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
  emptyLabel,
  hideCompleted,
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
  emptyLabel: string;
  hideCompleted?: boolean;
}) {
  const [nameWidthPx, setNameWidthPx] = React.useState(RESIZABLE_TASK_NAME_DEFAULT);
  // Defaults to ON — completed tasks are visible immediately; toggling off
  // declutters down to Pending/N-A. N/A tasks have no toggle of their own —
  // they're always shown alongside Pending, same as any other non-terminal
  // status; only DONE is ever hidden here.
  const [showCompleted, setShowCompleted] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  /** Parents the viewer has collapsed — everything ELSE is expanded (the
   *  2026-07-30 confirmed default). */
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());
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
  const visibleTasks = hideCompleted
    ? tasks.filter((t) => (t.status === "DONE" ? showCompleted : true))
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
    // cuid ids sort in creation order = the order typed into the form.
    for (const kids of childrenOf.values()) {
      kids.sort((a, b) => (a.runBlockId < b.runBlockId ? -1 : 1));
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
      onRun: () => runBulk(onComplete, (t) => t.quickCompletable && t.status !== "DONE" && t.assigneeId === myUserId),
    });
  }
  if (onSkip) {
    bulkActions.push({
      key: "na",
      label: "Mark N/A",
      icon: <span className="size-2.5 shrink-0 rounded-full bg-amber-400" />,
      onRun: () => runBulk(onSkip, (t) => t.status !== "SKIPPED" && t.assigneeId === myUserId),
    });
  }

  const controlBar = hideCompleted && (ownedVisibleTasks.length > 0 || completedCount > 0) && (
    <div className="flex items-center justify-between gap-3 pb-2">
      <div className="flex items-center gap-3">
        {ownedVisibleTasks.length > 0 && (
          <>
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
              <BulkActionsButton count={selectedIds.size} actions={bulkActions} />
            )}
          </>
        )}
      </div>
      {completedCount > 0 && (
        <ToggleSwitch checked={showCompleted} onChange={() => setShowCompleted((s) => !s)} label="Show Completed" />
      )}
    </div>
  );

  if (visibleTasks.length === 0) {
    return (
      <div>
        {controlBar}
        <p className="py-6 text-center text-sm text-gray-400">
          {completedCount > 0 ? "All caught up." : emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      {controlBar}
      {/* Column header row (2026-07-30, ClickUp reference) — personal My
          Tasks lists only. Spacers mirror the rows' leading checkbox +
          status circle. ONLY the Task header carries a drag handle (its
          width lives in the container's CSS variable); Proof and Assigned
          by are fixed-width, and Due date is pinned to the right edge
          (ml-auto) taking whatever remains. */}
      {hideCompleted && (
        <div className="flex items-center gap-3 border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          <span className="w-4 shrink-0" aria-hidden />
          {hasTree && <span className="w-4 shrink-0" aria-hidden />}
          <span className="w-3 shrink-0" aria-hidden />
          <span className="relative shrink-0 truncate" style={{ width: "var(--tm-col-name)" }}>
            Task
            <HeaderResizeHandle onPointerDown={onResizeStart} />
          </span>
          <span className="shrink-0 truncate text-center" style={{ width: PROOF_COL_WIDTH }}>
            Proof
          </span>
          {/* "Assignee" per the 2026-07-30 final spec (the shown value is
              the run's starter — assignerName — but the user explicitly
              chose this label over "Assigned by"). */}
          <span className="shrink-0 truncate" style={{ width: ASSIGNER_COL_WIDTH }}>
            Assignee
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
                onResizeStart={onResizeStart}
                selected={selectedIds.has(t.runBlockId)}
                onToggleSelect={hideCompleted ? toggleSelect : undefined}
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
 *  can't drift apart. Renders under the task row inside EntityDrillModal. */
function ReassignPicker({
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
  /** Proof upload — the viewer's OWN rows get the ＋/📎 cell (see
   *  ProofCell); omitted on read-only oversight cards, where existing
   *  proof still shows its 📎. */
  onUploadProof?: ProofUploadHandler;
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
        onRun: () => runBulk(onComplete, (t) => t.quickCompletable && t.assigneeId === myUserId),
      });
    }
    if (onSkip) {
      bulkActions.push({
        key: "na",
        label: "Mark N/A",
        icon: <span className="size-2.5 shrink-0 rounded-full bg-amber-400" />,
        onRun: () => runBulk(onSkip, (t) => t.assigneeId === myUserId),
      });
    }
  } else if (onReopen) {
    bulkActions.push({
      key: "reopen",
      label: "Mark Pending",
      icon: <span className="size-2.5 shrink-0 rounded-full border-2 border-red-400 bg-white" />,
      onRun: () => runBulk(onReopen, (t) => t.assigneeId === myUserId),
    });
  }

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
              <BulkActionsButton count={selectedIds.size} actions={bulkActions} />
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
                    {(t.proofId || (isOwned && onUploadProof)) && (
                      <ProofCell task={t} isOwned={isOwned} onUploadProof={onUploadProof} />
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
