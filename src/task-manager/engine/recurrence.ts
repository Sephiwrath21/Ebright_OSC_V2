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
      await prisma.runBlock.create({
        data: {
          runId: run.id,
          blockId: block.blockId,
          nodeId: block.nodeId,
          title: block.title,
          assigneeId: block.assigneeId,
          status: "ACTIVE",
          startedAt: now,
          dueAt: nextDueAt,
          cadence: "DAILY",
          recurrenceOfId: block.id,
          // Successors inherit the assigner's Guideline (shared row — the
          // image bytes are never duplicated) AND the template link, so
          // template-wide bulk ops (edit/remove/reassign/archive) keep
          // reaching next week's occurrences.
          guidelineId: block.guidelineId,
          templateId: block.templateId,
          categoryId: block.categoryId,
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
    } catch (err) {
      // A concurrent catch-up already created this block's successor —
      // remove our orphaned run and move on.
      await prisma.flowRun.delete({ where: { id: run.id } }).catch(() => {});
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        runId: run.id,
        actorId: block.run.startedById,
        action: "BLOCK_RECURRED",
        detail: {
          from: block.id,
          previousStatus: block.status,
          previousDueAt: block.dueAt.toISOString(),
          nextDueAt: nextDueAt.toISOString(),
        },
      },
    });
    created++;
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

    const run = await prisma.flowRun.create({
      data: {
        flowId: sub.run.flowId,
        flowVersion: sub.run.flowVersion,
        templateSnapshot: sub.run.templateSnapshot as Prisma.InputJsonValue,
        name: sub.run.name,
        startedById: sub.run.startedById,
        triggerType: "MANUAL",
        status: "ACTIVE",
      },
    });
    try {
      await prisma.runBlock.create({
        data: {
          runId: run.id,
          blockId: sub.blockId,
          nodeId: sub.nodeId,
          title: sub.title,
          assigneeId: sub.assigneeId,
          status: "ACTIVE",
          startedAt: now,
          dueAt: nextDueAt,
          cadence: "DAILY",
          recurrenceOfId: sub.id,
          parentId: newParentId,
          guidelineId: sub.guidelineId,
          templateId: sub.templateId,
          categoryId: sub.categoryId,
          subtaskOrder: sub.subtaskOrder,
          runItems: {
            create: sub.runItems.map((it) => ({
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
    } catch (err) {
      await prisma.flowRun.delete({ where: { id: run.id } }).catch(() => {});
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        runId: run.id,
        actorId: sub.run.startedById,
        action: "BLOCK_RECURRED",
        detail: {
          from: sub.id,
          previousStatus: sub.status,
          previousDueAt: sub.dueAt.toISOString(),
          nextDueAt: nextDueAt.toISOString(),
          subtaskOf: newParentId,
        },
      },
    });
    created++;
  }
  return created;
}
