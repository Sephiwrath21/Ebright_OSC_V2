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
  FlowCategoryOption,
  FlowEntityDetail,
  FlowTaskRow,
  ProofRemoveHandler,
  ProofUploadHandler,
} from "./types";
import { groupTasksByCategory, groupTasksByPerson, UNCATEGORIZED_CARD_ID } from "./entity-card-grouping";
import {
  DUE_COL_WIDTH,
  HeaderResizeHandle,
  PROOF_COL_WIDTH,
  REASSIGN_COL_WIDTH,
  ReassignPicker,
  ResizableTaskList,
  RESIZABLE_TASK_NAME_DEFAULT,
  RESIZABLE_TASK_NAME_MAX,
  RESIZABLE_TASK_NAME_MIN,
  TaskRowLine,
  useResizableColumn,
  type ReassignControl,
} from "./bits";

type SortMode = "person" | "type";

/** Card grid columns cap at 3 (the confirmed "3x3" requirement for a full
 *  roster), but a grid that's ALWAYS 3-wide reserves a third-of-the-row
 *  width for a card even when there's only 1-2 cards to show (e.g. "Only
 *  Me") — starving the card's task titles of width they don't need to
 *  share with anyone (2026-08-15). Literal class strings (not a template
 *  string) so Tailwind's static scanner can still find them. */
function cardGridClass(count: number): string {
  if (count <= 1) return "grid grid-cols-1 gap-4";
  if (count === 2) return "grid grid-cols-1 gap-4 sm:grid-cols-2";
  return "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3";
}

function flattenTasks(entity: FlowEntityDetail) {
  return [...entity.tasks.completed, ...entity.tasks.pending, ...entity.tasks.na];
}

/** One weekday's worth of the viewer's own tasks (2026-08-15, embedded
 *  weekday-tab view — see EntityCardOverview's `myWeek` prop doc comment). */
export interface MyWeekDay {
  weekday: string;
  date: string;
  tasks: FlowTaskRow[];
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
  myWeek,
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
}) {
  const [sortMode, setSortMode] = React.useState<SortMode>("person");
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
  const scopeId = showViewToggle && onlyMe ? myUserId : undefined;

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

  return (
    <div
      ref={resizeContainerRef}
      style={resizeStyle}
      className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {/* Empty entityName (2026-08-15, myOverview's own sections) omits
              the "X — " prefix entirely — printing just "Daily"/"Monthly"
              alone, not "My Tasks — Daily", since the Person-sort card
              directly below already says "My Tasks" (isOwnCard check
              above) — showing that label twice, stacked, was itself the
              redundancy this was meant to fix. Department/Branch Overview
              still pass a real name here and keep the full "X — Y" form. */}
          {entityName ? `${entityName} — ${sectionLabel}` : sectionLabel}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {dateControl}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort"
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="person">Sort: Person</option>
            <option value="type">Sort: Type</option>
          </select>
          {showViewToggle && (
            <select
              value={onlyMe ? "onlyMe" : "all"}
              onChange={(e) => setOnlyMe(e.target.value === "onlyMe")}
              aria-label="View"
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              <option value="all">View All</option>
              <option value="onlyMe">Only Me</option>
            </select>
          )}
        </div>
      </div>

      {sortMode === "person" ? (
        <div className={cardGridClass(personCards.length)}>
          {personCards.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No one to show.</p>
          ) : (
            personCards.map((card) => {
              const isOwnCard = card.userId === myUserId;
              // Weekday-tab view (2026-08-15) — see the `myWeek` prop's own
              // doc comment for why this is scoped to "own card, alone on
              // screen" rather than every own-card appearance.
              const showMyWeek = isOwnCard && Boolean(myWeek) && personCards.length === 1;
              return (
                <div key={card.userId} className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
                    {/* Own card (2026-08-15): the viewer's name/avatar is
                        already shown top-right on every page — repeating it
                        as this card's header is redundant. Every OTHER
                        card still shows the person's name, since that's
                        the only way to tell whose tasks a card holds. */}
                    {isOwnCard ? "My Tasks" : card.name}
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
                                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span>{d.weekday}</span>
                              <span
                                className={active ? "text-blue-100" : "text-gray-400"}
                                aria-label={`${pendingCount} pending`}
                              >
                                {pendingCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
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
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                  <div
                    // Scrollable body (2026-08-15) — OTHER people's cards
                    // only, same treatment as the Type-sort card grid: a
                    // capped height with both-axis scroll instead of an
                    // ever-growing card in a "View All" grid. The own card
                    // (checkboxes/resize/weekday-tabs) is unaffected.
                    className={`px-3 py-1 ${isOwnCard ? "" : "max-h-80 overflow-auto"}`}
                  >
                    {card.tasks.length === 0 ? (
                      <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
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
                            ResizableTaskList's own header in bits.tsx. */}
                        {isOwnCard && (
                          <div className="flex items-center gap-3 border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                            <span className="w-4 shrink-0" aria-hidden />
                            <span className="w-3 shrink-0" aria-hidden />
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
                        {card.tasks.map((t: FlowTaskRow) => (
                          <TaskRowLine
                            key={t.runBlockId}
                            task={t}
                            myUserId={myUserId}
                            onComplete={onComplete}
                            onSkip={onSkip}
                            onReopen={onReopen}
                            onUploadProof={onUploadProof}
                            onRemoveProof={onRemoveProof}
                            hideCompleted={isOwnCard}
                            hideStatusChip
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
                            nameWidth={isOwnCard ? taskColWidth : undefined}
                            onResizeStart={isOwnCard ? onResizeStart : undefined}
                            // No Assignee column (2026-08-15) — every row
                            // here is the CARD OWNER's own task, so an
                            // "assigned by" column is redundant with the
                            // card header; Due date is back (was suppressed
                            // 2026-08-13) per the new 4-column header above.
                            hideAssignee
                            // Matches the header's PROOF_COL_WIDTH exactly
                            // (2026-08-15 fix) — without this the row cell
                            // defaulted to 40px while the header used 96px,
                            // so the centered "+" button sat under the
                            // header's left portion instead of its center.
                            proofWidth={PROOF_COL_WIDTH}
                            // Daily's date is implied by the section itself
                            // (2026-08-15) — keep the column/header (layout
                            // consistency with Monthly/HOD/CEO Assigned
                            // Task, which DO show a real date), just don't
                            // populate a redundant per-row value under it.
                            blankDueDate={sectionLabel === "Daily"}
                            reassign={reassign}
                          />
                        ))}
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
        <div className={cardGridClass(categoryCards.length)}>
          {categoryCards.map((card) => (
            <div
              key={card.id}
              className={`overflow-hidden rounded-xl border ${card.id === UNCATEGORIZED_CARD_ID ? "border-dashed border-gray-300" : "border-gray-200"}`}
            >
              <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
              <div className="max-h-80 overflow-auto px-3 py-2">
                {card.tasks.length === 0 ? (
                  <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                ) : (
                  <table className="w-max min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
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
                      {card.tasks.map((t) => {
                        const canReassignRow =
                          Boolean(reassign) &&
                          t.assigneeId === myUserId &&
                          t.status !== "DONE" &&
                          t.status !== "SKIPPED";
                        return (
                          <React.Fragment key={t.runBlockId}>
                            <tr className="border-t border-dashed border-gray-100">
                              <td className="whitespace-nowrap py-1.5 pr-4">{t.blockTitle}</td>
                              <td className="py-1.5 text-gray-500">
                                <div className="flex items-center justify-between gap-2">
                                  {!onlyMe && <span className="whitespace-nowrap">{t.assigneeName}</span>}
                                  {canReassignRow && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTypeReassignOpen(
                                          typeReassignOpen === t.runBlockId ? null : t.runBlockId,
                                        )
                                      }
                                      className="shrink-0 rounded-full border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:border-blue-300 hover:bg-blue-50"
                                    >
                                      Assign to Others
                                    </button>
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
          ))}
        </div>
      )}
    </div>
  );
}
