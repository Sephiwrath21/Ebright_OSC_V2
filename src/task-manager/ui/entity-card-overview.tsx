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
import type {
  ActionResult,
  FlowCategoryOption,
  FlowEntityDetail,
  FlowTaskRow,
  ProofRemoveHandler,
  ProofUploadHandler,
} from "./types";
import { groupTasksByCategory, groupTasksByPerson, UNCATEGORIZED_CARD_ID } from "./entity-card-grouping";
import { ReassignPicker, TaskRowLine, type ReassignControl } from "./bits";

type SortMode = "person" | "type";

function flattenTasks(entity: FlowEntityDetail) {
  return [...entity.tasks.completed, ...entity.tasks.pending, ...entity.tasks.na];
}

export function EntityCardOverview({
  sectionLabel,
  entityName,
  entity,
  categories,
  myUserId,
  dateControl,
  showViewToggle,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  reassign,
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
}) {
  const [sortMode, setSortMode] = React.useState<SortMode>("person");
  const [onlyMe, setOnlyMe] = React.useState(false);
  const [typeReassignOpen, setTypeReassignOpen] = React.useState<string | null>(null);

  const tasks = flattenTasks(entity);
  const scopeId = showViewToggle && onlyMe ? myUserId : undefined;

  const personCards = sortMode === "person" ? groupTasksByPerson(entity.members, tasks, scopeId) : [];
  const categoryCards = sortMode === "type" ? groupTasksByCategory(categories, tasks, scopeId) : [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {entityName} — {sectionLabel}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {personCards.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No one to show.</p>
          ) : (
            personCards.map((card) => {
              const isOwnCard = card.userId === myUserId;
              return (
                <div key={card.userId} className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
                  <div className="px-3 py-1">
                    {card.tasks.length === 0 ? (
                      <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                    ) : (
                      card.tasks.map((t: FlowTaskRow) => (
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
                          hideDueDate
                          hideStatusChip
                          reassign={reassign}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categoryCards.map((card) => (
            <div
              key={card.id}
              className={`overflow-hidden rounded-xl border ${card.id === UNCATEGORIZED_CARD_ID ? "border-dashed border-gray-300" : "border-gray-200"}`}
            >
              <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
              <div className="px-3 py-2">
                {card.tasks.length === 0 ? (
                  <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="pb-1 font-medium">Task</th>
                        <th className="pb-1 font-medium">Assignee</th>
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
                              <td className="truncate py-1.5 pr-2">{t.blockTitle}</td>
                              <td className="py-1.5 text-gray-500">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">{t.assigneeName}</span>
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
