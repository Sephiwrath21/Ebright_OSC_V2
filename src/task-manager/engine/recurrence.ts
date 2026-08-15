// Weekly auto-recurrence — the "recurring series" model. FINAL design
// (2026-07-25, superseding the earlier opt-in toggle iterations): recurrence
// is UNIVERSAL and fully automatic — EVERY Daily-cadence task with a due day
// recurs weekly, no toggle or setting anywhere. Triggered by the hourly
// in-server sweep (src/instrumentation.ts) plus the lazy catch-up on read.
//
// When a recurring block's due DAY has passed, the catch-up creates NEXT
// week's occurrence — same title/assignee/day, fresh items, status ACTIVE —
// in a NEW run linked back via the UNIQUE recurrenceOfId. The finished block
// is never modified, so per-day history (the Daily date filter's strict
// window) keeps showing what actually happened on each date. Multi-week
// gaps (nobody opened the app) collapse into ONE catch-up occurrence in the
// current week, not a backlog of missed ones.
//
// Trigger: called from the Task Manager data reads (data/queries.ts) behind
// a small in-process throttle — no cron, no Redis needed. When the reminder
// worker phase lands (spec §6), this same function can run from a real
// scheduled job unchanged.
//
// Idempotency/races: recurrenceOfId is UNIQUE — a block can have at most one
// successor. Two concurrent catch-ups compute the same target; the loser
// hits P2002 and cleans up its orphan run. Manpower-Schedule slot tasks
// (scheduleSlotId set, cadence ADHOC) can never qualify: the eligibility
// WHERE requires cadence DAILY + scheduleSlotId null + repeatWeekly true.
//
// No template/pattern-level "series owner" (2026-08-15): a successor's
// assignee is always copied from whatever `assigneeId` its predecessor row
// holds AT THE MOMENT it advances — there's no separate field tracking who
// a recurring series is "really for", so a one-off reassignment (Assign to
// Others) of a not-yet-recurred block WOULD otherwise leak into that
// series' future occurrences once the sweep eventually reads the mutated
// row. `protectRecurringSeries` (below) is how reassignFlowTask avoids
// that — see its own doc comment.

import { Prisma } from "@/generated/task-manager-client";
import { todayStart } from "@/task-manager/lib/dates";
import { prisma } from "@/task-manager/prisma";

/** Pure: the next occurrence of dueAt's weekday (same time-of-day) that is
 *  >= boundary. Already-current dates return unchanged. */
export function nextWeeklyDueAt(dueAt: Date, boundary: Date): Date {
  const next = new Date(dueAt);
  while (next < boundary) next.setDate(next.getDate() + 7);
  return next;
}

/** A block loaded with everything createSuccessorBlock needs to clone it —
 *  both advanceRecurringBlocks' bulk `findMany` and protectRecurringSeries'
 *  single `findUnique` already fetch this shape (an extra `successor`
 *  include on the latter is fine — a wider fetch still satisfies this
 *  type). Named via Prisma's own generated payload type rather than a
 *  hand-written interface so it can never silently drift from the real
 *  schema. */
type RunBlockForSuccessor = Prisma.RunBlockGetPayload<{ include: { run: true; runItems: true } }>;

/** Creates ONE successor RunBlock (+ its own FlowRun + cloned runItems +
 *  BLOCK_RECURRED audit log) for `block`, due at `opts.dueAt`, assigned to
 *  `opts.assigneeId`, linked back via recurrenceOfId — the exact successor
 *  shape advanceRecurringBlocks has always created, extracted (2026-08-15)
 *  so protectRecurringSeries can produce an identical one without
 *  duplicating/risking drift from this logic. Callers own the due-date
 *  policy (the sweep's overdue catch-up via nextWeeklyDueAt vs.
 *  protectRecurringSeries' proactive dueAt+7) and the assignee — this
 *  function only knows how to clone a block forward, not why or when.
 *  Idempotent via recurrenceOfId's unique constraint: returns null (not
 *  throwing) if a concurrent caller already created this block's successor,
 *  same P2002 handling the sweep has always had. */
async function createSuccessorBlock(
  block: RunBlockForSuccessor,
  opts: {
    dueAt: Date;
    assigneeId: string;
    now: Date;
    parentId?: string;
    subtaskOrder?: number | null;
  },
): Promise<{ id: string } | null> {
  const run = await prisma.flowRun.create({
    data: {
      flowId: block.run.flowId,
      flowVersion: block.run.flowVersion,
      templateSnapshot: block.run.templateSnapshot as Prisma.InputJsonValue,
      name: block.run.name,
      startedById: block.run.startedById,
      triggerType: "MANUAL",
      status: "ACTIVE",
    },
  });
  try {
    const successor = await prisma.runBlock.create({
      data: {
        runId: run.id,
        blockId: block.blockId,
        nodeId: block.nodeId,
        title: block.title,
        assigneeId: opts.assigneeId,
        status: "ACTIVE",
        startedAt: opts.now,
        dueAt: opts.dueAt,
        cadence: "DAILY",
        recurrenceOfId: block.id,
        // Successors inherit the assigner's Guideline (shared row — the
        // image bytes are never duplicated) AND the template link, so
        // template-wide bulk ops (edit/remove/reassign/archive) keep
        // reaching next week's occurrences.
        guidelineId: block.guidelineId,
        templateId: block.templateId,
        categoryId: block.categoryId,
        parentId: opts.parentId,
        subtaskOrder: opts.subtaskOrder ?? undefined,
        runItems: {
          create: block.runItems.map((it) => ({
            itemId: it.itemId,
            order: it.order,
            type: it.type,
            label: it.label,
            required: it.required,
            config: it.config as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        runId: run.id,
        actorId: block.run.startedById,
        action: "BLOCK_RECURRED",
        detail: {
          from: block.id,
          previousStatus: block.status,
          previousDueAt: block.dueAt ? block.dueAt.toISOString() : null,
          nextDueAt: opts.dueAt.toISOString(),
        },
      },
    });
    return successor;
  } catch (err) {
    // A concurrent caller already created this block's successor — remove
    // our orphaned run and move on.
    await prisma.flowRun.delete({ where: { id: run.id } }).catch(() => {});
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}

const CATCHUP_INTERVAL_MS = 60_000;
let lastCatchupAt = 0;

/** Test hook: reset the in-process throttle. */
export function resetRecurrenceThrottle(): void {
  lastCatchupAt = 0;
}

/** Advance every eligible recurring block. Returns how many successors were
 *  created (0 when throttled or nothing is due). Never throws on races. */
export async function advanceRecurringBlocks(now: Date = new Date()): Promise<number> {
  if (now.getTime() - lastCatchupAt < CATCHUP_INTERVAL_MS) return 0;
  lastCatchupAt = now.getTime();

  // "Today" per the module's day-boundary convention (shared with
  // editTaskTemplateCore's past-due-protection filter — see lib/dates.ts):
  // before TM_RESET_HOUR o'clock, "today" still counts as yesterday, so due
  // blocks don't advance until the reset time arrives. The lazy on-read
  // trigger makes the flip near-instant at that hour; the hourly sweep is
  // the backstop.
  const boundary = todayStart(now);
  // UNIVERSAL: every DAILY task with a due day recurs — no flag (the
  // repeatWeekly column is retired; see its schema comment). Manpower
  // Schedule slot tasks are excluded by scheduleSlotId (and are ADHOC
  // anyway); Monthly/Ad hoc never match the cadence gate. SUBTASKS
  // (parentId set) are excluded too: they never advance on their own —
  // the second pass below clones them under their parent's successor, so
  // the tree recurs as a unit.
  const due = await prisma.runBlock.findMany({
    where: {
      cadence: "DAILY",
      scheduleSlotId: null,
      dueAt: { lt: boundary },
      successor: null,
      parentId: null,
      // Removed (run CANCELLED) and archived tasks must NOT recur — without
      // this, a bulk-removed/archived Daily task would resurrect as next
      // week's occurrence (2026-07-31 fix).
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    include: { run: true, runItems: true },
  });

  let created = 0;
  for (const block of due) {
    if (!block.dueAt) continue;
    const nextDueAt = nextWeeklyDueAt(block.dueAt, boundary);
    const successor = await createSuccessorBlock(block, {
      dueAt: nextDueAt,
      assigneeId: block.assigneeId,
      now,
    });
    if (successor) created++;
  }

  // ---- Second pass: subtasks (2026-07-30). A subtask advances iff its
  // PARENT's successor already exists (created above, or by an earlier
  // sweep that crashed before finishing the family) — the clone lands
  // under that successor, so next week's parent arrives with next week's
  // subtasks. Idempotent the same way as the main loop: recurrenceOfId is
  // unique, and running this query re-checks `successor: null` each sweep.
  const dueSubtasks = await prisma.runBlock.findMany({
    where: {
      cadence: "DAILY",
      scheduleSlotId: null,
      dueAt: { lt: boundary },
      successor: null,
      parentId: { not: null },
      parent: { successor: { isNot: null } },
      // Same removed/archived exclusion as the parent sweep above.
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    include: {
      run: true,
      runItems: true,
      parent: { select: { successor: { select: { id: true } } } },
    },
  });
  for (const sub of dueSubtasks) {
    const newParentId = sub.parent?.successor?.id;
    if (!sub.dueAt || !newParentId) continue;
    const nextDueAt = nextWeeklyDueAt(sub.dueAt, boundary);
    const successor = await createSuccessorBlock(sub, {
      dueAt: nextDueAt,
      assigneeId: sub.assigneeId,
      now,
      parentId: newParentId,
      subtaskOrder: sub.subtaskOrder,
    });
    if (successor) created++;
  }
  return created;
}

/** Locks in a recurring block's next weekly occurrence for its CURRENT
 *  assignee, if it doesn't already have one (2026-08-15) — called by
 *  reassignFlowTask right before a one-off "Assign to Others" handoff
 *  flips a block's assignee, so that handoff can only ever affect THIS
 *  occurrence. Without this, the series would silently drift: there's no
 *  template/pattern-level "series owner" field (see this module's header
 *  comment) — advanceRecurringBlocks always copies a successor's assignee
 *  from whatever `assigneeId` the predecessor row holds at the moment it
 *  advances, so once this block's due day eventually passes, the sweep
 *  would read the just-reassigned (new) assignee and copy THAT forward
 *  into next week's occurrence, and the week after that, indefinitely.
 *
 *  A no-op for anything that doesn't actually qualify for recurrence — same
 *  eligibility as the sweep (DAILY cadence, no Manpower-Schedule slot, has
 *  a dueAt, run not cancelled/archived) — so reassigning a Monthly/Ad hoc/
 *  Manpower-synced task, or one that's already DONE/SKIPPED, is unaffected;
 *  those were never going to recur regardless. Only ever called on a
 *  top-level block (parentId null) — a lone subtask is reassigned via its
 *  own runBlockId with its own eligibility check, same rule the sweep
 *  itself uses (subtasks never advance on their own, only alongside their
 *  parent), so this function's subtask-locking below only fires from the
 *  PARENT's own reassignment, covering every DIRECT subtask under it (they
 *  recur as a unit with their parent — see the schema's own parentId
 *  comment) rather than needing its own separate call site.
 *
 *  Idempotent: a block/subtask that already has a successor (from an
 *  earlier reassignment, or the normal sweep having already advanced it)
 *  is left untouched — safe to call on every reassignment unconditionally,
 *  including a second reassignment of the same still-not-yet-due block
 *  (only this week's row changes; the already-locked-in successor is
 *  never touched again). */
export async function protectRecurringSeries(blockId: string, now: Date = new Date()): Promise<void> {
  const block = await prisma.runBlock.findUnique({
    where: { id: blockId },
    include: { run: true, runItems: true, successor: { select: { id: true } } },
  });
  if (!block) return;
  const eligible =
    block.cadence === "DAILY" &&
    block.scheduleSlotId === null &&
    block.parentId === null &&
    block.dueAt !== null &&
    block.run.status !== "CANCELLED" &&
    block.run.archivedAt === null;
  if (!eligible || block.successor || !block.dueAt) return;

  const nextDueAt = new Date(block.dueAt);
  nextDueAt.setDate(nextDueAt.getDate() + 7);
  const successor = await createSuccessorBlock(block, {
    dueAt: nextDueAt,
    assigneeId: block.assigneeId,
    now,
  });
  if (!successor) return; // a concurrent caller already locked this block in

  const subtasks = await prisma.runBlock.findMany({
    where: {
      parentId: block.id,
      cadence: "DAILY",
      scheduleSlotId: null,
      dueAt: { not: null },
      successor: null,
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    include: { run: true, runItems: true },
  });
  for (const sub of subtasks) {
    if (!sub.dueAt) continue;
    const subNextDueAt = new Date(sub.dueAt);
    subNextDueAt.setDate(subNextDueAt.getDate() + 7);
    await createSuccessorBlock(sub, {
      dueAt: subNextDueAt,
      assigneeId: sub.assigneeId,
      now,
      parentId: successor.id,
      subtaskOrder: sub.subtaskOrder,
    });
  }
}
