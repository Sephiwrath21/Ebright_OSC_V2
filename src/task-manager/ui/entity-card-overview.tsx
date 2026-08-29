"use client";

// Overview page card grid (2026-08-12, restructured 2026-08-12 same day:
// stacked-sections redesign) — renders ONE section's worth of card grid:
// Sort: Person/Type, and (when showViewToggle) View: All/Only Me. Reused
// by TaskOverviewStack (task-overview-stack.tsx) to render up to four
// sections (Daily/Monthly/HOD Assigned Task/CEO Assigned Task) stacked —
// this component itself has no Filter switch anymore; the CALLER decides
// which dataset (and hence which section) a given instance represents.
//
// Person-sort rows reuse TaskRowLine (bits.tsx) — the same row component
// "My Tasks" lists use — which already renders the StatusDropdown/
// ProofCell/GuidelineIndicator machinery AND already gates every action to
// `task.assigneeId === myUserId` internally (StatusDropdown/ProofCell both
// check `isOwned` and silently degrade to a read-only circle/dash for any
// task that isn't the viewer's own). This is exactly the confirmed Task
// Interactivity rule (own card actionable, everyone else's read-only) —
// achieved for free by passing the SAME action props to every row in every
// card, with no extra per-card conditional logic needed here. Due Date and
// the status text badge are suppressed on every row via TaskRowLine's
// hideDueDate/hideStatusChip (2026-08-13) — a plain checklist (dot + title)
// was always the design intent; those two columns were an artifact of
// reusing TaskRowLine's richer "My Tasks" rendering, not a deliberate
// addition.
//
// "Assign to Others" (2026-08-13, self-service): every row — own card AND
// Type-sort rows alike — gets a reassign trigger when it's the VIEWER'S
// OWN pending task, letting them hand it off to a teammate without needing
// a manager role. TaskRowLine handles this itself (own isOwned check,
// gated to pending); the Type-sort table below wires the same
// ReassignPicker (bits.tsx) directly, since it doesn't use TaskRowLine.
// reassignFlowTask (data layer) re-enforces the same-department/branch
// scope regardless of what this UI shows. Reassigning an OTHER person's
// task from this card grid (manager oversight, not self-service) is still
// not supported here — unchanged, known gap from the original redesign;
// use the existing delegated/ad hoc oversight cards elsewhere on this page
// for that.
import * as React from "react";
import { useRouter } from "next/navigation";
import type {
  ActionResult,
  FlowBucketTotals,
  FlowCategoryOption,
  FlowDrillTask,
  FlowEntityDetail,
  FlowTaskRow,
  MyManpowerActualSlot,
  ProofRemoveHandler,
  ProofUploadHandler,
} from "./types";
import { flowBucketTotal } from "./types";
import { useCardMode } from "./card-mode-context";
import {
  groupTasksByCategory,
  groupTasksByPerson,
  UNCATEGORIZED_CARD_ID,
  type PersonCard,
} from "./entity-card-grouping";
import {
  ACCORDION_BUCKET_ORDER,
  BUCKET_META,
  BUCKET_SOLID,
  BUCKET_TEXT,
  BUCKET_TINT,
  ChevronIcon,
  DUE_COL_WIDTH,
  EntityDrillModal,
  HeaderResizeHandle,
  PROOF_COL_WIDTH,
  REASSIGN_COL_WIDTH,
  ReassignPicker,
  ResizableTaskList,
  RESIZABLE_TASK_NAME_DEFAULT,
  RESIZABLE_TASK_NAME_MAX,
  RESIZABLE_TASK_NAME_MIN,
  RowActionsMenu,
  StatusDonut,
  StatusHeaderSpacer,
  TaskRowLine,
  TOTAL_TEXT,
  TOTAL_TINT,
  useResizableColumn,
  type BucketKey,
  type ReassignControl,
} from "./bits";

type SortMode = "person" | "type";

/** Card grid columns cap at 3 (the confirmed "3x3" requirement for a full
 *  roster), but a grid that's ALWAYS 3-wide reserves a third-of-the-row
 *  width for a card even when there's only 1-2 cards to show (e.g. "Only
 *  Me") — starving the card's task titles of width they don't need to
 *  share with anyone (2026-08-15). Literal class strings (not a template
 *  string) so Tailwind's static scanner can still find them.
 *  `pie` (2026-08-26, user feedback — image comparison: "Only Me" in Pie
 *  mode stretched to full width, while a multi-card Pie grid's cards stay
 *  compact) overrides the count-based sizing entirely: Pie cards ALWAYS
 *  use the same responsive column template regardless of count, so a lone
 *  one sizes exactly like one column of a multi-card grid instead of
 *  stretching. List mode keeps its own per-count sizing unchanged — that
 *  full-width-when-alone behavior was a deliberate, separate, already-
 *  requested feature for List's wide task-title rows, which Pie cards
 *  don't have. */
function cardGridClass(count: number, pie: boolean): string {
  if (pie) return "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3";
  if (count <= 1) return "grid grid-cols-1 gap-4";
  if (count === 2) return "grid grid-cols-1 gap-4 sm:grid-cols-2";
  return "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3";
}

function flattenTasks(entity: FlowEntityDetail) {
  return [...entity.tasks.completed, ...entity.tasks.pending, ...entity.tasks.na];
}

/** groupByStatus's Sort: Type ordering (2026-08-19, master toggle removed
 *  2026-08-21) — Pending always first, matching ResizableTaskList's own
 *  fixed Pending/Completed/N-A group order used for Person-sort's cards in
 *  the same mode. Sort: Type has no per-group chevrons (it's a flat table,
 *  not ResizableTaskList), so with the master toggle gone there's no way to
 *  reveal a hidden status here — always shows everything now. */
function statusGroupedTasks(tasks: FlowTaskRow[]): FlowTaskRow[] {
  const pending = tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED");
  const completed = tasks.filter((t) => t.status === "DONE" || t.status === "SKIPPED");
  return [...pending, ...completed];
}

/** List/Donut toggle's "Donut" card (2026-08-22, user request) — a
 *  per-person completion summary in the same visual LANGUAGE as the
 *  ClickUp Task page's member card (DepartmentMembers.tsx: donut ring +
 *  Done/Pending/N-A/Total stat chips + Completed/Pending/Not Applicable
 *  accordions), rebuilt with Task Manager's own StatusDonut/BUCKET_META
 *  components and Tailwind/dark-mode conventions rather than a visual
 *  copy — that page runs on a different data source (ClickUp's own
 *  integration, @/lib/clickup) and a different inline-style/CSS-token
 *  styling system entirely, so nothing from it could be reused directly.
 *  See the "List/Donut" toggle button just above in the header for where
 *  this is switched on, and the groupByStatus doc comment for why it
 *  never applies to HOD/CEO Assigned Task. */
function PersonDonutCard({ card }: { card: PersonCard }) {
  // Rows open EntityDrillModal on click, same as DepartmentDonutCard
  // (department-donut-overview.tsx) rather than expanding inline
  // (2026-08-25, reverted back from inline expansion — user request to
  // match the department card's own same-day round trip back to the
  // modal, for consistency across every donut card in the app).
  const [drill, setDrill] = React.useState<BucketKey | null>(null);

  const { totals, byBucket } = React.useMemo(() => {
    // byBucket keeps EVERY task, including subtasks — the drill modal
    // still lists/lets you complete them individually, same as ClickUp's
    // own expandable checklist. totals is the donut/percentage's own
    // count and does NOT count subtasks separately (2026-08-29, user
    // report — a parent with 5 subtasks was inflating this card's total
    // from 9 to 14, dragging 89% down to 57%): only top-level tasks
    // (parentId null/undefined) are tallied, matching the same rule
    // countBuckets/groupByDimension/buildEntityPayload already apply
    // server-side for every OTHER donut in the app — this is the one card
    // that computed its own totals client-side instead of receiving them
    // pre-computed, so it needed the identical guard added by hand.
    const buckets: Record<BucketKey, FlowDrillTask[]> = { completed: [], pending: [], na: [] };
    const bucketTotals: FlowBucketTotals = { completed: 0, pending: 0, na: 0 };
    for (const t of card.tasks) {
      const key: BucketKey = t.status === "DONE" ? "completed" : t.status === "SKIPPED" ? "na" : "pending";
      buckets[key].push(t);
      if (t.parentId == null) bucketTotals[key] += 1;
    }
    return { totals: bucketTotals, byBucket: buckets };
  }, [card.tasks]);

  const total = flowBucketTotal(totals);
  const percent = total > 0 ? Math.round((totals.completed / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <StatusDonut totals={totals} size={140} onSegmentClick={setDrill}>
        <span className="text-lg font-bold text-gray-900 dark:text-slate-100">{percent}%</span>
      </StatusDonut>

      <div className="grid w-full grid-cols-4 gap-1.5">
        {ACCORDION_BUCKET_ORDER.map((key) => {
          const b = BUCKET_META.find((m) => m.key === key)!;
          return (
            <div key={b.key} className={`rounded-lg px-1 py-1.5 text-center ${BUCKET_TINT[b.key]}`}>
              <div className={`text-sm font-bold ${BUCKET_TEXT[b.key]}`}>{totals[b.key]}</div>
              {/* BUCKET_TINT is the same pale shade in both modes for every
                  bucket now (2026-08-26) — the label text is just plain
                  black, unconditionally, no dark: override needed. */}
              <div className="text-[10px] font-medium text-gray-900">{b.label}</div>
            </div>
          );
        })}
        <div className={`rounded-lg px-1 py-1.5 text-center ${TOTAL_TINT}`}>
          <div className={`text-sm font-bold ${TOTAL_TEXT}`}>{total}</div>
          <div className="text-[10px] font-medium text-gray-900">Total</div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-1.5">
        {ACCORDION_BUCKET_ORDER.map((key) => {
          const b = BUCKET_META.find((m) => m.key === key)!;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setDrill(b.key)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left ${BUCKET_TINT[b.key]}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <ChevronIcon expanded={false} className={`size-3.5 ${BUCKET_TEXT[b.key]}`} />
                {b.label}
              </span>
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-gray-900 ${BUCKET_SOLID[b.key]}`}
              >
                {/* totals[b.key], NOT byBucket[b.key].length (2026-08-29
                    fix) — byBucket keeps subtasks for the drill modal's own
                    list (clicking still opens it via setDrill below,
                    unchanged), but the badge itself must match the top
                    stat-chip row, which already excludes them. This was
                    the second of two spots in this card with the same
                    stale-count bug — the stat chips read `totals` and were
                    already correct; this badge still read the raw
                    (subtask-inclusive) array length. */}
                {totals[b.key]}
              </span>
            </button>
          );
        })}
      </div>

      {drill && (
        <EntityDrillModal name={card.name} tasks={byBucket} bucketKey={drill} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

/** One weekday's worth of the viewer's own tasks (2026-08-15, embedded
 *  weekday-tab view — see EntityCardOverview's `myWeek` prop doc comment). */
export interface MyWeekDay {
  weekday: string;
  date: string;
  tasks: FlowTaskRow[];
  /** Manpower Scheduling's ACTUAL slot(s) for this day (2026-08-18), Coach/
   *  Branch Full Time Exec only — see MyManpowerActualSlot's own doc comment.
   *  Undefined/empty for every other role and for days with no assignment. */
  schedule?: MyManpowerActualSlot[];
}

/** EntityCardOverview's `myWeek` prop shape, exported so every caller
 *  building a "daily" SectionData (task-overview-stack.tsx, page.tsx,
 *  task-manager-view.tsx) shares one definition instead of copies that can
 *  drift. See EntityCardOverview's own `myWeek` prop doc comment for the
 *  two-way date-picker sync this enables. */
export interface MyWeekConfig {
  days: MyWeekDay[];
  selectedDate: string;
  nav: { basePath: string; extraParams?: Record<string, string> };
}

/** One day-range chunk's worth of the viewer's own tasks (2026-08-15,
 *  Home's "My Month" tab view — the Monthly sibling of MyWeekDay/myWeek
 *  above). */
export interface MyMonthChunk {
  label: string; // "1–7" / "22–31" etc — types.ts's chunkLabel
  range: string; // "1-7" — the ?mrange= value this chunk represents
  tasks: FlowTaskRow[];
}

/** EntityCardOverview's `myMonth` prop shape — same idea as MyWeekConfig,
 *  generalized from weekdays to the 4 day-range chunks MonthRangeDropdown
 *  already offers (Full month itself has no tab — same "no combined tab"
 *  precedent myWeek already sets for the whole week). Exported for the
 *  same reason MyWeekConfig is: one shared shape for every caller. */
export interface MyMonthConfig {
  chunks: MyMonthChunk[];
  selectedRange: string; // current ?mrange= value, e.g. "1-7"
  /** The resolved Monthly anchor month (YYYY-MM-DD, same shape MonthDropdown's
   *  own `value` prop takes) — carried explicitly by selectMyMonthRange below
   *  since `nav.extraParams` deliberately EXCLUDES both mdate/mrange (the
   *  same "caller re-adds whichever one it owns" convention MonthDropdown's
   *  and MonthRangeDropdown's own navigate functions already follow), so a
   *  tab click must re-add mdate itself or the month silently resets to
   *  current-month on navigation. */
  anchorMonth: string;
  nav: { basePath: string; extraParams?: Record<string, string> };
}

/** View toggle persistence (2026-08-14) — ONE shared preference per user,
 *  covering every section (Daily/Monthly/HOD/CEO Assigned Task) this
 *  component renders, not four independent memories: "remember the user's
 *  last selection" reads as one setting, not per-section state. localStorage
 *  (per browser/device, not synced across them), keyed by userId — matches
 *  this file's existing tm-subtask-warning precedent (bits.tsx) rather than
 *  adding a new DB preference field/migration for one lightweight UI
 *  toggle. Restores on the NEXT page load/navigation, same as that
 *  precedent — does not live-sync between already-mounted sections within
 *  one page view (switching Daily doesn't instantly flip an already-open
 *  Monthly section; both read the stored value fresh on their own mount). */
function onlyMeStorageKey(userId: string): string {
  return `tm-overview-onlyme-${userId}`;
}

function readStoredOnlyMe(userId: string): boolean | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(onlyMeStorageKey(userId));
  if (stored === "true") return true;
  if (stored === "false") return false;
  return null;
}

export function EntityCardOverview({
  sectionLabel,
  entityName,
  entity,
  categories,
  myUserId,
  dateControl,
  showViewToggle,
  defaultOnlyMe,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  reassign,
  canReassignOthers,
  myWeek,
  myMonth,
  groupByStatus,
}: {
  /** The section's own heading, e.g. "Daily" / "Monthly" / "HOD Assigned
   *  Task" / "CEO Assigned Task" — TaskOverviewStack renders it above this
   *  card grid, not this component itself (keeps the heading and the
   *  card-grid body as two independently-composable pieces). */
  sectionLabel: string;
  entityName: string;
  entity: FlowEntityDetail;
  categories: FlowCategoryOption[];
  /** The viewer's own id — drives which row in a Person-sort card is
   *  actionable (via TaskRowLine's own isOwned check) and, when
   *  showViewToggle, "Only Me". */
  myUserId: string;
  /** The existing date/range filter control for this section (unchanged) —
   *  e.g. DailyDatePicker for a Daily section. Omit for sections with no
   *  date filter (HOD/CEO Assigned Task are all-time). */
  dateControl?: React.ReactNode;
  /** Whether to render the View: All/Only Me control — true for a real
   *  multi-person roster (entity-owning roles, or a MEMBER's whole-
   *  department/branch Daily section); false for a synthetic one-member
   *  entity, where there's nothing to toggle. An explicit prop from the
   *  caller (not inferred from entity.members.length) — a genuinely real
   *  one-person department shouldn't lose the toggle just because it
   *  happens to have one member. */
  showViewToggle: boolean;
  /** Initial state of the View toggle when showViewToggle is true
   *  (2026-08-15) — true = "Only Me" is the DEFAULT view, not "View All".
   *  Callers pass isPersonalAccountView(view) from role-views.ts: a real
   *  person lands on their own tasks first; a shared/site account (which
   *  has none) still defaults to the full roster. Purely the initial
   *  React.useState value — the viewer can still switch either way via the
   *  dropdown regardless of this prop. Ignored when showViewToggle is
   *  false. Defaults to false (View All) if omitted, matching every
   *  existing call site before this prop existed. */
  defaultOnlyMe?: boolean;
  /** Task action handlers — passed straight through to TaskRowLine for
   *  every row in every Person-sort card; each handler is a no-op for any
   *  task that isn't the viewer's own (TaskRowLine/StatusDropdown/ProofCell
   *  already enforce this via task.assigneeId === myUserId). Omit any of
   *  these to disable that specific action everywhere in this section. */
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  onSkip?: (runBlockId: string) => Promise<ActionResult>;
  onReopen?: (runBlockId: string) => Promise<ActionResult>;
  onUploadProof?: ProofUploadHandler;
  onRemoveProof?: ProofRemoveHandler;
  /** "Assign to Others" self-service handoff (2026-08-13) — passed straight
   *  through to every row (Person-sort via TaskRowLine, Type-sort via a
   *  direct ReassignPicker wiring below); only ever surfaces on the
   *  viewer's own pending task, regardless of which card/row it appears
   *  in. Omit to disable the action everywhere in this section. */
  reassign?: ReassignControl;
  /** Manager mode for Person-sort's View All grid (2026-08-15): when true,
   *  the reassign trigger also appears on OTHER people's rows (not just the
   *  viewer's own), passed to TaskRowLine as `reassignAnyOwner` — the
   *  caller (page.tsx / scoped-overview-section.tsx) decides who qualifies
   *  (ADMIN/ELEVATED_DEPT_SITE, per the 2026-08-15 product decision); the
   *  server re-checks the actor's role on every reassign call regardless.
   *  Has no effect on the own card (already reassignable via `reassign`
   *  alone) or on the Type-sort grid (self-service only, unchanged). */
  canReassignOthers?: boolean;
  /** Weekday-tab view for the viewer's OWN card (2026-08-15) — Daily
   *  section only (the caller only ever builds this for the "Daily"
   *  SectionData; Monthly/HOD/CEO Assigned have no per-weekday concept).
   *  When provided, the own card renders a weekday-tab column beside its
   *  task list instead of the single globally-selected date's `card.tasks`
   *  — the rest of the section (other people's cards, Type-sort) is
   *  unaffected. Only rendered when the own card is the ONLY card on
   *  screen (Sort: Person, "Only Me" — the reference design's actual
   *  layout); a "View All" grid with several narrow cards per row keeps
   *  the own card's plain single-date list, to avoid squeezing the wider
   *  tab+list layout into a cramped grid cell.
   *
   *  Two-way synced with the section's own `dateControl` date-arrow picker
   *  (2026-08-15): `selectedDate` is the server-resolved "currently active"
   *  date (whatever the picker shows, defaulting to today when nothing's
   *  picked) — `days`/its per-day counts are computed server-side for the
   *  WEEK CONTAINING that date, so moving the picker to a different week
   *  recomputes the whole tab list on the next server render. Clicking a
   *  tab navigates via `nav` (the exact basePath/extraParams the section's
   *  own DailyDatePicker instance already carries, so tab clicks produce
   *  an identical URL shape to clicking that picker's own arrows) rather
   *  than owning separate client state, keeping the picker's displayed
   *  value and the highlighted tab from ever drifting apart. */
  myWeek?: MyWeekConfig;
  /** Month-range-chunk tab view for the viewer's OWN card (2026-08-15) —
   *  Monthly section only, Home's "My Month" (the Monthly sibling of
   *  `myWeek` above — same "own card, alone on screen" gate, same
   *  two-way sync with the section's own dateControl, just tabbed by day-
   *  range chunk instead of weekday). `/task-manager` never sets this —
   *  its own Monthly section keeps the dropdown-based range picker,
   *  unchanged (2026-08-15 product decision: My Month is Home-only for
   *  now). */
  myMonth?: MyMonthConfig;
  /** Standardized Pending-first/collapsible pattern (2026-08-19, HOD/CEO
   *  Assigned Task only — TaskOverviewStack passes this true ONLY for those
   *  two keys, never Daily/Monthly/Ad hoc). Swaps Sort: Person's per-card
   *  category/type sub-grouping for the SAME status-bucket grouping
   *  (Pending/Completed/N-A, each independently collapsible via its own
   *  chevron) "Tasks I Assigned" uses, via a genuinely shared
   *  ResizableTaskList instance per card rather than a lookalike. No master
   *  "Show Completed" toggle (removed 2026-08-21, user feedback) — each
   *  group's chevron controls only itself, uncontrolled/per-card, same as
   *  "Tasks I Assigned". Sort: Type keeps its category grouping and always
   *  shows every status (no hide-by-default there, same reasoning). No
   *  "Assign to Others" on these two sections either (TaskOverviewStack
   *  withholds `reassign` for hodAssigned/ceoAssigned specifically). */
  groupByStatus?: boolean;
}) {
  const [sortMode, setSortMode] = React.useState<SortMode>("person");
  // List/Donut view toggle (2026-08-22) — Sort: Person cards only; the
  // button itself is hidden for groupByStatus sections (HOD/CEO Assigned
  // Task), so this simply never flips to "donut" there. Shared across every
  // section on the page (2026-08-22, page-level toggle) when a
  // CardModeProvider wraps this component (see card-mode-context.tsx) —
  // falls back to independent local state, with its own toggle button
  // rendered below, when unwrapped (every call site besides /task-manager's
  // Department/Branch/All Departments dropdown flow).
  const sharedCardMode = useCardMode();
  const [localCardMode, setLocalCardMode] = React.useState<"list" | "donut">("list");
  const cardMode = sharedCardMode ? sharedCardMode.mode : localCardMode;
  const setCardMode = sharedCardMode ? sharedCardMode.setMode : setLocalCardMode;
  // Main task / subtask tree for Sort:Person's card body (2026-08-22, bug
  // fix) — every task (parent AND child alike) used to render as a flat
  // sibling TaskRowLine, with no indication a task like "Process Street"
  // actually has real child RunBlocks underneath it (confirmed via the
  // DB: parentId IS correctly set, this was purely a rendering gap, not a
  // data gap). Reuses TaskRowLine's own `tree` prop — the exact same
  // chevron/indent mechanism ResizableTaskList's "My Tasks" view already
  // uses — via a local childrenOf/topLevel grouping built per type-group
  // below, instead of duplicating a second tree-rendering implementation.
  // Expanded by default, same convention as ResizableTaskList's own
  // collapsedIds (tracks the exceptions, not the norm).
  const [collapsedParentIds, setCollapsedParentIds] = React.useState<Set<string>>(new Set());
  const toggleParentExpand = (id: string) =>
    setCollapsedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Hydration-safe (2026-08-14 fix): the FIRST render must produce IDENTICAL
  // output on the server and the client, so this starts from the role-based
  // defaultOnlyMe on both — never localStorage — even though localStorage IS
  // available by the time the client's first render happens (React still
  // diffs it against the server-rendered HTML from before hydration, so
  // "server used one value, client used another" is a real mismatch here:
  // onlyMe drives scopeId -> personCards -> cardGridClass's actual
  // className, not just some later-opened modal's behavior). The stored
  // choice is applied a moment later, in the effect below, which only ever
  // runs client-side AFTER hydration has already reconciled — updating
  // state there is a normal post-mount re-render, not a hydration mismatch.
  // First-time default (never explicitly chosen before, on THIS
  // browser/device) stays defaultOnlyMe forever; once the user has ever
  // picked a value, that stored choice wins from then on regardless of role.
  const [onlyMe, setOnlyMeState] = React.useState(defaultOnlyMe ?? false);
  React.useEffect(() => {
    const stored = readStoredOnlyMe(myUserId);
    if (stored !== null) setOnlyMeState(stored);
    // Intentionally myUserId-only: re-sync if the viewer identity changes,
    // but don't re-run (and stomp an in-progress local change) on every
    // defaultOnlyMe/render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId]);
  const setOnlyMe = (value: boolean) => {
    setOnlyMeState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(onlyMeStorageKey(myUserId), String(value));
    }
  };
  const [typeReassignOpen, setTypeReassignOpen] = React.useState<string | null>(null);
  const typeGridRef = React.useRef<HTMLDivElement>(null);
  // Auto-close the Type-sort grid's open ReassignPicker on an outside
  // click/tap or Escape (2026-08-15) — same fix as TaskRowLine's own
  // reassignContainerRef effect below; previously the only way to close it
  // was reopening that row's ⋮ menu and toggling "Assign to Others" again.
  // Scoped to the WHOLE grid (typeGridRef, set on the Type-sort card
  // container below) since typeReassignOpen is one shared id for every
  // category card, not per-row state — clicking a DIFFERENT row's trigger
  // still works normally (that click is "inside" the grid).
  React.useEffect(() => {
    if (!typeReassignOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (typeGridRef.current && !typeGridRef.current.contains(e.target as Node)) {
        setTypeReassignOpen(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTypeReassignOpen(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [typeReassignOpen]);
  // Task-column resize (2026-08-15) — ONE width shared by every card this
  // section renders (Person-sort's own card AND every Type-sort category
  // card alike, whichever is currently visible — never both at once, so
  // sharing causes no confusion), same reuse of ResizableTaskList's
  // mechanism the "My Tasks" page already uses (see useResizableColumn's
  // own doc comment in bits.tsx), plus persistence that page doesn't have:
  // keyed per-user, restored on the next visit rather than resetting.
  // Distinct CSS var name (--tm-overview-col-task, not --tm-col-name) so
  // this never collides with an unrelated ResizableTaskList elsewhere on
  // the same page — though scoped to containerRef's own subtree either way.
  const { containerRef: resizeContainerRef, containerStyle: resizeStyle, onResizeStart } = useResizableColumn({
    cssVar: "--tm-overview-col-task",
    defaultWidth: RESIZABLE_TASK_NAME_DEFAULT,
    min: RESIZABLE_TASK_NAME_MIN,
    max: RESIZABLE_TASK_NAME_MAX,
    storageKey: `tm-overview-taskwidth-${myUserId}`,
  });
  const taskColWidth = "var(--tm-overview-col-task)";

  const tasks = flattenTasks(entity);
  // A synthetic self-entity (toSelfEntityDetail's one-member roster, used
  // for every showViewToggle:false section — OPS/CEO's own Monthly on
  // /task-manager, and Home's personal Daily/Monthly/third-card sections)
  // has no View All/Only Me toggle because it's ALWAYS implicitly "only
  // me" — there's no one else in it. Sort: Type's "hide empty categories"
  // rule (2026-08-15) should apply here too, same as it does whenever a
  // real multi-person entity's viewer picks Only Me — without this, an
  // empty category card (e.g. "SMS" with zero tasks for this person)
  // incorrectly stays visible, since scopeId was only ever driven by the
  // (nonexistent, for this entity) toggle state.
  const isSelfOnlyEntity = entity.members.length === 1 && entity.members[0].userId === myUserId;
  const scopeId = (showViewToggle && onlyMe) || isSelfOnlyEntity ? myUserId : undefined;

  const personCards = sortMode === "person" ? groupTasksByPerson(entity.members, tasks, scopeId) : [];
  const categoryCards = sortMode === "type" ? groupTasksByCategory(categories, tasks, scopeId) : [];

  // Weekday-tab selection for the own card's myWeek view (2026-08-15) — NOT
  // local state: derived straight from myWeek.selectedDate (the server-
  // resolved, picker-synced "currently active" date, see the prop's own
  // doc comment), so the highlighted tab can never drift from what the
  // picker shows. Falls back to the first day in range on the rare case
  // selectedDate's weekday isn't one of them (role's range excludes it).
  const router = useRouter();
  const selectedMyWeekDay = myWeek?.days.find((d) => d.date === myWeek.selectedDate) ?? myWeek?.days[0];
  const selectMyWeekDate = (date: string) => {
    if (!myWeek) return;
    const qs = new URLSearchParams({ ...myWeek.nav.extraParams, date });
    router.push(`${myWeek.nav.basePath}?${qs.toString()}`);
  };
  const selectedMyMonthChunk =
    myMonth?.chunks.find((c) => c.range === myMonth.selectedRange) ?? myMonth?.chunks[0];
  const selectMyMonthRange = (range: string) => {
    if (!myMonth) return;
    const qs = new URLSearchParams({ ...myMonth.nav.extraParams, mdate: myMonth.anchorMonth, mrange: range });
    router.push(`${myMonth.nav.basePath}?${qs.toString()}`);
  };

  return (
    <div
      ref={resizeContainerRef}
      style={resizeStyle}
      className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            {/* Empty entityName (2026-08-15, myOverview's own sections) omits
                the "X — " prefix entirely — printing just "Daily"/"Monthly"
                alone, not "My Tasks — Daily", since the Person-sort card
                directly below already says "My Tasks" (isOwnCard check
                above) — showing that label twice, stacked, was itself the
                redundancy this was meant to fix. Department/Branch Overview
                still pass a real name here and keep the full "X — Y" form.
                HOD/CEO Assigned Task (groupByStatus) no longer collapses
                the whole section (2026-08-19, user feedback) — always a
                plain heading now, same as every other section. */}
            {entityName ? `${entityName} — ${sectionLabel}` : sectionLabel}
          </h2>
          {/* Moved here from the right-side controls (2026-08-26, user
              feedback) — sits right after the heading now, on the left. */}
          {dateControl}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort"
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="person">Sort: Person</option>
            <option value="type">Sort: Type</option>
          </select>
          {/* List/Donut toggle (2026-08-22) — Sort: Person only, and not on
              HOD/CEO Assigned Task (groupByStatus) sections, where a
              donut summary doesn't fit the "assigned by" semantics. Hidden
              here entirely when a page-level CardModeProvider is present
              (sharedCardMode) — CardModeToggle, rendered once near the
              Department/Branch dropdown, is the only control in that case. */}
          {sortMode === "person" && !groupByStatus && !sharedCardMode && (
            <div
              role="radiogroup"
              aria-label="Card style"
              className="flex items-center gap-0.5 rounded-full border border-gray-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
            >
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "list"}
                onClick={() => setCardMode("list")}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  cardMode === "list"
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                List
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "donut"}
                onClick={() => setCardMode("donut")}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  cardMode === "donut"
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Pie
              </button>
            </div>
          )}
          {showViewToggle && (
            <select
              value={onlyMe ? "onlyMe" : "all"}
              onChange={(e) => setOnlyMe(e.target.value === "onlyMe")}
              aria-label="View"
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">View All</option>
              <option value="onlyMe">Only Me</option>
            </select>
          )}
        </div>
      </div>

      {(sortMode === "person" ? (
        <div className={cardGridClass(personCards.length, cardMode === "donut")}>
          {personCards.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">No one to show.</p>
          ) : (
            personCards.map((card) => {
              const isOwnCard = card.userId === myUserId;
              // Weekday-tab view (2026-08-15) — see the `myWeek` prop's own
              // doc comment for why this is scoped to "own card, alone on
              // screen" rather than every own-card appearance. Also gated on
              // cardMode !== "donut" (2026-08-22, user report) — without
              // this, picking "Donut" for the lone own card (Only Me) had no
              // visible effect at all: the weekday/month-tab list took
              // priority unconditionally, so the toggle never actually
              // reached PersonDonutCard for this specific case even though
              // it worked correctly everywhere else (View All, or any other
              // person's card).
              const showMyWeek = isOwnCard && Boolean(myWeek) && personCards.length === 1 && cardMode !== "donut";
              const showMyMonth = isOwnCard && Boolean(myMonth) && personCards.length === 1 && cardMode !== "donut";
              // Type sub-grouping within each card (2026-08-15) — reuses
              // Sort: Type's own grouping function (entity-card-grouping.ts)
              // on this ONE person's already-scoped task list, so "Sort:
              // Person" cards show a Flowghan/SMS/Uncategorized breakdown
              // per person instead of needing to switch to Sort: Type to
              // see it. Groups with nothing for this person are dropped
              // (unlike the Type-sort card grid itself, which always shows
              // every active category) — a person-card subheading for a
              // type they have zero tasks in is just noise.
              const typeGroups = groupTasksByCategory(categories, card.tasks).filter((g) => g.tasks.length > 0);
              return (
                <div key={card.userId} className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 dark:bg-slate-800 dark:text-slate-200">
                    {/* Own card: always the real name (2026-08-19 — Only
                        Me mode previously showed "My Tasks" instead, on the
                        theory that the viewer's name/avatar already shows
                        top-right so repeating it here felt redundant; user
                        feedback was that the card still needs its own name,
                        e.g. the Daily weekday-tab view where this card is
                        the ONLY thing on screen with no other named card for
                        context). Same real name in every mode now — Only
                        Me, View All, Daily, Monthly — consistent with how
                        every other person's card already worked. */}
                    {card.name}
                  </div>
                  {showMyWeek && myWeek ? (
                    <div className="flex gap-3 p-3">
                      <div role="tablist" className="w-32 shrink-0 space-y-0.5">
                        {myWeek.days.map((d) => {
                          const pendingCount = d.tasks.filter(
                            (t) => t.status !== "DONE" && t.status !== "SKIPPED",
                          ).length;
                          const active = d.date === myWeek.selectedDate;
                          return (
                            <button
                              key={d.date}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => selectMyWeekDate(d.date)}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
                                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                              }`}
                            >
                              <span>{d.weekday}</span>
                              <span
                                className={active ? "text-blue-100" : "text-gray-400 dark:text-slate-500"}
                                aria-label={`${pendingCount} pending`}
                              >
                                {pendingCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        {selectedMyWeekDay && selectedMyWeekDay.schedule && selectedMyWeekDay.schedule.length > 0 && (
                          <div className="mb-2 space-y-1">
                            {selectedMyWeekDay.schedule.map((s, i) => (
                              <div
                                key={i}
                                className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              >
                                {s.start} – {s.end}: {s.label}
                              </div>
                            ))}
                          </div>
                        )}
                        {selectedMyWeekDay && (
                          <ResizableTaskList
                            key={selectedMyWeekDay.date}
                            tasks={selectedMyWeekDay.tasks}
                            myUserId={myUserId}
                            onComplete={onComplete}
                            onSkip={onSkip}
                            onReopen={onReopen}
                            onUploadProof={onUploadProof}
                            onRemoveProof={onRemoveProof}
                            emptyLabel={`No tasks for ${selectedMyWeekDay.weekday}.`}
                            hideCompleted
                            hideAssignee
                            blankDueDate
                            reassign={reassign}
                            // Trimmed from 400 (2026-08-26, user report — some
                            // viewers saw an unwanted horizontal scrollbar just
                            // to complete a task). 400 was sized on the
                            // (mistaken) assumption that blankDueDate frees up
                            // its column's width — it doesn't, the DUE_COL_WIDTH
                            // spacer stays reserved (empty) for row alignment,
                            // so the real total (checkbox + status + 400 Task +
                            // Proof 96 + blank Due 120 + Reassign 112 + gaps) ran
                            // past the available width on anything narrower than
                            // a wide desktop monitor, alongside this tab list's
                            // own 128px sidebar. Still fully draggable up to
                            // RESIZABLE_TASK_NAME_MAX afterward.
                            defaultNameWidth={260}
                          />
                        )}
                      </div>
                    </div>
                  ) : showMyMonth && myMonth ? (
                    // Sized (2026-08-22, user feedback) — this branch had no
                    // height of its own, unlike its siblings (max-h-80
                    // below), so a short tab list next to a one-line empty
                    // state left the card looking sparse. min-h gives it
                    // real presence; the task list area also scrolls past
                    // that height instead of growing unbounded.
                    <div className="flex min-h-[22rem] gap-3 p-4">
                      <div role="tablist" className="w-36 shrink-0 space-y-1">
                        {myMonth.chunks.map((c) => {
                          const pendingCount = c.tasks.filter(
                            (t) => t.status !== "DONE" && t.status !== "SKIPPED",
                          ).length;
                          const active = c.range === myMonth.selectedRange;
                          return (
                            <button
                              key={c.range}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => selectMyMonthRange(c.range)}
                              className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-medium ${
                                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                              }`}
                            >
                              <span>{c.label}</span>
                              <span
                                className={active ? "text-blue-100" : "text-gray-400 dark:text-slate-500"}
                                aria-label={`${pendingCount} pending`}
                              >
                                {pendingCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="min-h-0 min-w-0 max-h-[26rem] flex-1 overflow-auto">
                        {selectedMyMonthChunk && (
                          <ResizableTaskList
                            key={selectedMyMonthChunk.range}
                            tasks={selectedMyMonthChunk.tasks}
                            myUserId={myUserId}
                            onComplete={onComplete}
                            onSkip={onSkip}
                            onReopen={onReopen}
                            onUploadProof={onUploadProof}
                            onRemoveProof={onRemoveProof}
                            emptyLabel={`No tasks for ${selectedMyMonthChunk.label}.`}
                            hideCompleted
                            hideAssignee
                            blankDueDate
                            reassign={reassign}
                            // Trimmed from 400 (2026-08-26, user report — some
                            // viewers saw an unwanted horizontal scrollbar just
                            // to complete a task). 400 was sized on the
                            // (mistaken) assumption that blankDueDate frees up
                            // its column's width — it doesn't, the DUE_COL_WIDTH
                            // spacer stays reserved (empty) for row alignment,
                            // so the real total (checkbox + status + 400 Task +
                            // Proof 96 + blank Due 120 + Reassign 112 + gaps) ran
                            // past the available width on anything narrower than
                            // a wide desktop monitor, alongside this tab list's
                            // own 128px sidebar. Still fully draggable up to
                            // RESIZABLE_TASK_NAME_MAX afterward.
                            defaultNameWidth={260}
                          />
                        )}
                      </div>
                    </div>
                  ) : cardMode === "donut" ? (
                    // List/Donut toggle (2026-08-22, user request) — an
                    // alternate rendering of the SAME card.tasks, styled
                    // like the ClickUp Task page's per-member donut card
                    // (DepartmentMembers.tsx) but using Task Manager's own
                    // Tailwind/dark-mode design language and StatusDonut
                    // component instead of a visual copy. Never reached for
                    // groupByStatus sections (HOD/CEO Assigned Task) — the
                    // toggle button itself is hidden there, so cardMode
                    // stays "list" by default; see the header control below.
                    <PersonDonutCard card={card} />
                  ) : (
                  <div
                    // Scrollable body (2026-08-15) — a capped height with
                    // both-axis scroll instead of an ever-growing/overflowing
                    // card, same treatment as the Type-sort card grid; own
                    // card included now too (a long task title was
                    // overflowing past the card's edge with no way to see
                    // the rest of it). The resize handle below is unrelated
                    // and still works alongside this — resize to size the
                    // Task column intentionally, scroll as the fallback for
                    // whatever still doesn't fit.
                    className="max-h-80 overflow-auto px-3 py-1"
                  >
                    {card.tasks.length === 0 ? (
                      <p className="py-2 text-xs italic text-gray-400 dark:text-slate-500">No tasks this period.</p>
                    ) : groupByStatus ? (
                      // HOD/CEO Assigned Task (2026-08-19, master toggle
                      // removed 2026-08-21): status-bucket grouping instead
                      // of category/type sub-grouping — the SAME
                      // ResizableTaskList "Tasks I Assigned" uses, not a
                      // lookalike. Uncontrolled (no showCompleted/
                      // onShowCompletedChange passed) — each group
                      // (Pending/Completed/N-A) collapses independently via
                      // its own chevron, per card, same as "Tasks I
                      // Assigned". No reassign — TaskOverviewStack withholds
                      // it for hodAssigned/ceoAssigned, so "Assign to
                      // Others" doesn't appear on these two sections.
                      <ResizableTaskList
                        tasks={card.tasks}
                        myUserId={myUserId}
                        onComplete={onComplete}
                        onSkip={onSkip}
                        onReopen={onReopen}
                        onUploadProof={onUploadProof}
                        onRemoveProof={onRemoveProof}
                        emptyLabel="No tasks this period."
                        hideCompleted
                        hideAssignee
                        defaultNameWidth={280}
                      />
                    ) : (
                      <>
                        {/* Column header (2026-08-15) — only on the card
                            actually rendering these columns: Proof/Due
                            date/Assign to Others only ever appear in
                            hideCompleted mode (isOwnCard), so a header
                            naming them on a read-only OTHER-person card
                            would be misleading (nothing below it would
                            populate those cells). Spacers mirror the rows'
                            leading checkbox slot (w-4) + status circle/
                            StatusDropdown (size-3) — same convention as
                            ResizableTaskList's own header in bits.tsx. Sits
                            above every type group below, not repeated per
                            group — it's labeling columns, not group data. */}
                        {isOwnCard && (
                          <div className="flex items-center gap-3 border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:border-slate-800 dark:text-slate-500">
                            <span className="w-4 shrink-0" aria-hidden />
                            <StatusHeaderSpacer />
                            <span className="relative shrink-0 truncate" style={{ width: taskColWidth }}>
                              Task
                              <HeaderResizeHandle onPointerDown={onResizeStart} />
                            </span>
                            <span className="shrink-0 text-center leading-tight" style={{ width: PROOF_COL_WIDTH }}>
                              Proof of Completion
                            </span>
                            <span className="shrink-0" style={{ width: DUE_COL_WIDTH }}>
                              Due date
                            </span>
                            <span className="shrink-0 text-center" style={{ width: REASSIGN_COL_WIDTH }}>
                              Assign to Others
                            </span>
                          </div>
                        )}
                        {typeGroups.map((group) => {
                          // Parent/subtask tree, scoped to this ONE type
                          // group (a subtask always shares its parent's
                          // categoryId, so both land in the same group —
                          // see editTaskTemplateCore/assignFlowTaskCore).
                          const groupIds = new Set(group.tasks.map((t) => t.runBlockId));
                          const childrenOfGroup = new Map<string, FlowTaskRow[]>();
                          for (const t of group.tasks) {
                            if (t.parentId && groupIds.has(t.parentId)) {
                              const kids = childrenOfGroup.get(t.parentId);
                              if (kids) kids.push(t);
                              else childrenOfGroup.set(t.parentId, [t]);
                            }
                          }
                          for (const kids of childrenOfGroup.values()) {
                            kids.sort((a, b) => (a.subtaskOrder ?? Number.MAX_SAFE_INTEGER) - (b.subtaskOrder ?? Number.MAX_SAFE_INTEGER));
                          }
                          const topLevel = group.tasks.filter((t) => !t.parentId || !groupIds.has(t.parentId));
                          const sharedRowProps = {
                            myUserId,
                            onComplete,
                            onSkip,
                            onReopen,
                            onUploadProof,
                            onRemoveProof,
                            hideCompleted: isOwnCard,
                            hideStatusChip: true,
                            // Draggable Task column (2026-08-15) — OWN CARD
                            // ONLY (2026-08-15 fix): the resize header above
                            // only renders for isOwnCard, but this prop was
                            // applied unconditionally, giving every OTHER
                            // person's card the same fixed shrink-0 width
                            // too. In a 3-per-row "View All" grid those
                            // cards are much narrower than that fixed width,
                            // so the row overflowed and the card's own
                            // overflow-hidden (for its rounded corners)
                            // clipped the title mid-word — a regression, not
                            // the intended "wrap normally" behavior
                            // established earlier. Other cards now go back
                            // to undefined (TaskRowLine's flex-1 fallback),
                            // matching their pre-resize-feature behavior.
                            // Subtask rows share the SAME nameWidth as their
                            // parent (matches ResizableTaskList's own
                            // precedent — the drag handle resizes one shared
                            // column regardless of which row it's grabbed
                            // from).
                            nameWidth: isOwnCard ? taskColWidth : undefined,
                            onResizeStart: isOwnCard ? onResizeStart : undefined,
                            // No Assignee column (2026-08-15) — every row
                            // here is the CARD OWNER's own task, so an
                            // "assigned by" column is redundant with the
                            // card header; Due date is back (was suppressed
                            // 2026-08-13) per the new 4-column header above.
                            hideAssignee: true,
                            // Matches the header's PROOF_COL_WIDTH exactly
                            // (2026-08-15 fix) — without this the row cell
                            // defaulted to 40px while the header used 96px,
                            // so the centered "+" button sat under the
                            // header's left portion instead of its center.
                            proofWidth: PROOF_COL_WIDTH,
                            // Daily's date is implied by the section itself
                            // (2026-08-15) — keep the column/header (layout
                            // consistency with Monthly/HOD/CEO Assigned
                            // Task, which DO show a real date), just don't
                            // populate a redundant per-row value under it.
                            blankDueDate: sectionLabel === "Daily",
                            reassign,
                            reassignAnyOwner: canReassignOthers,
                            reassignAsMenu: true,
                          };
                          return (
                            <div key={group.id}>
                              <p className="mt-2 truncate text-[11px] font-semibold uppercase tracking-wide text-gray-400 first:mt-0 dark:text-slate-500">
                                {group.name}
                              </p>
                              {topLevel.map((t: FlowTaskRow) => {
                                const kids = childrenOfGroup.get(t.runBlockId) ?? [];
                                const expanded = !collapsedParentIds.has(t.runBlockId);
                                return (
                                  <React.Fragment key={t.runBlockId}>
                                    <TaskRowLine
                                      task={t}
                                      {...sharedRowProps}
                                      tree={
                                        kids.length > 0
                                          ? { kind: "parent", count: kids.length, expanded, onToggle: () => toggleParentExpand(t.runBlockId) }
                                          : undefined
                                      }
                                    />
                                    {expanded &&
                                      kids.map((k) => (
                                        <TaskRowLine key={k.runBlockId} task={k} {...sharedRowProps} tree={{ kind: "child" }} />
                                      ))}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div ref={typeGridRef} className={cardGridClass(categoryCards.length, false)}>
          {categoryCards.map((card) => {
            // groupByStatus (2026-08-19): pending-first, Completed/N-A
            // hidden unless the section's own "Show Completed" master
            // toggle is on — see statusGroupedTasks's own doc comment.
            const displayTasks = groupByStatus ? statusGroupedTasks(card.tasks) : card.tasks;
            return (
            <div
              key={card.id}
              className={`overflow-hidden rounded-xl border ${card.id === UNCATEGORIZED_CARD_ID ? "border-dashed border-gray-300 dark:border-slate-600" : "border-gray-200 dark:border-slate-700"}`}
            >
              <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 dark:bg-slate-800 dark:text-slate-200">{card.name}</div>
              <div className="max-h-80 overflow-auto px-3 py-2">
                {displayTasks.length === 0 ? (
                  <p className="py-2 text-xs italic text-gray-400 dark:text-slate-500">No tasks this period.</p>
                ) : (
                  <table className="w-max min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-slate-400">
                        {/* No column resize here (2026-08-15) — long content
                            scrolls (the card body above is the scroll
                            container, both axes) instead of being resized
                            or truncated. The Person-sort "My Tasks" card
                            keeps its own resize handle unchanged. */}
                        <th className="pb-1 pr-4 font-medium">Task</th>
                        {/* Only Me (2026-08-15): every row already belongs to
                            the viewer, so naming them per-row is redundant —
                            View All still needs it to tell people apart.
                            The <th> itself stays either way (so tbody's two
                            <td>s per row — Task, then this one, which also
                            houses "Assign to Others" — always match thead's
                            column count); just the label text is blank. */}
                        <th className="pb-1 font-medium">{!onlyMe && "Assignee"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayTasks.map((t) => {
                        const canReassignRow =
                          Boolean(reassign) &&
                          t.assigneeId === myUserId &&
                          t.status !== "DONE" &&
                          t.status !== "SKIPPED";
                        return (
                          <React.Fragment key={t.runBlockId}>
                            <tr className="border-t border-dashed border-gray-100 dark:border-slate-800">
                              <td className="whitespace-nowrap py-1.5 pr-4 dark:text-slate-200">{t.blockTitle}</td>
                              <td className="py-1.5 text-gray-500 dark:text-slate-400">
                                <div className="flex items-center justify-between gap-2">
                                  {!onlyMe && <span className="whitespace-nowrap">{t.assigneeName}</span>}
                                  {canReassignRow && (
                                    <RowActionsMenu
                                      onAssignToOthers={() =>
                                        setTypeReassignOpen(
                                          typeReassignOpen === t.runBlockId ? null : t.runBlockId,
                                        )
                                      }
                                    />
                                  )}
                                </div>
                              </td>
                            </tr>
                            {canReassignRow && reassign && typeReassignOpen === t.runBlockId && (
                              <tr>
                                <td colSpan={2} className="pb-2">
                                  <ReassignPicker
                                    staff={reassign.staff}
                                    currentAssigneeId={t.assigneeId}
                                    onPick={async (userId) => {
                                      const r = await reassign.action(t.runBlockId, userId);
                                      if (r.ok) setTypeReassignOpen(null);
                                      return r;
                                    }}
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
