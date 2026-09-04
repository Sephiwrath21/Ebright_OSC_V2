// Task Templates — pre-authorized Core logic (2026-08-06): the actual
// cascade-safe mutation/read logic behind ./templates's exported
// deleteTaskTemplate/editTaskTemplate/getTemplateDeletionImpact, factored
// out so an ALREADY-authorized caller (data/template-groups.ts, whose own
// requireGroupEditAccess — Super Admin + elevated dept-site only, identical
// for both TEMPLATE and PACKAGE scope — is a DIFFERENT allow-list than
// ./templates's requireAssigner) can invoke the same logic without
// re-running requireAssigner's check. Keeping the two allow-lists decoupled
// this way avoids double-gating (an already-authorized caller getting
// silently rejected by a second, differently-shaped check) if either one's
// allow-list changes independently later. See template-groups.ts's file
// header for the full double-gating explanation.
//
// Deliberately NOT re-exported by data.ts's `export * from "./data/templates"`
// barrel (this file isn't re-exported by that barrel at all): every Core
// function here takes a bare `{ id: string }` user with no proof of
// authorization, so any caller reachable via the public
// `@/task-manager/data` barrel must go through the auth-checked wrappers
// in ./templates instead. Only data/template-groups.ts imports from this
// file, and it does so directly (`./templates-internal`), never through
// the barrel.
import { z } from "zod";
import type { Prisma } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { todayStart } from "../lib/dates";
import { getUsersByIds } from "../lib/users";
import { prisma } from "../prisma";
import { FLOW_DAYS } from "../ui/types";

// JS Date.getDay() -> FLOW_DAYS weekday name — local mirror of
// tasks-internal.ts's own DAY_INDEX (reversed), same precedent as
// template-groups.ts's own JS_DAY_TO_FLOW_DAY (that file's own doc comment
// explains why this stays a small local copy per file rather than one
// shared export: DAY_INDEX itself isn't exported, only assignFlowTaskCore
// is meant to be called from outside tasks-internal.ts). Monday (1)
// deliberately absent — see template-groups.ts's copy for why.
const JS_DAY_TO_FLOW_DAY: Partial<Record<number, (typeof FLOW_DAYS)[number]>> = {
  0: "Sun",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};
// Reverse of the above — needed by removeTemplateAssigneeCore to turn its
// caller-selected FLOW_DAYS weekday list into cancelPendingTemplateRuns'
// own JS-Date.getDay() dueWeekday filter (2026-08-29, per-weekday removal).
const FLOW_DAY_TO_JS_DAY: Record<(typeof FLOW_DAYS)[number], number> = {
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
};

/** "Still pending" for the deletion cascade = any non-terminal status —
 *  DONE and SKIPPED (N/A) both count as resolved history and are KEPT.
 *  Shared with ./templates's own single-task functions (getTemplateAssignees,
 *  archiveTemplateTasks, unarchiveTemplateTasks, reassignTemplateTasks,
 *  removeTemplateAssignments) — exported from here so ./templates imports
 *  it back rather than duplicating the list. */
export const PENDING_STATUSES = ["PENDING", "ACTIVE", "OVERDUE", "ESCALATED"] as const;

export interface TemplateDeletionImpact {
  /** Pending task rows (incl. subtasks) that deletion would remove. */
  pendingTasks: number;
  /** Distinct employees who still have a pending task from this template. */
  pendingEmployees: number;
  /** Completed/N-A rows that will be KEPT untouched. */
  completedKept: number;
}

/** Pre-deletion preview core: how many pending assignments would be
 *  removed, from how many employees, and how many completed records
 *  stay. */
export async function getTemplateDeletionImpactCore(
  user: { id: string },
  templateId: string,
): Promise<TemplateDeletionImpact> {
  const id = z.string().min(1).parse(templateId);
  const template = await prisma.taskTemplate.findFirst({
    where: { id, createdById: user.id },
    select: { id: true },
  });
  if (!template) throw new ApiHttpError(404, "Template not found");

  const blocks = await prisma.runBlock.findMany({
    where: { templateId: id, run: { status: { not: "CANCELLED" }, archivedAt: null } },
    select: { assigneeId: true, status: true },
  });
  const pending = blocks.filter((b) => (PENDING_STATUSES as readonly string[]).includes(b.status));
  return {
    pendingTasks: pending.length,
    pendingEmployees: new Set(pending.map((b) => b.assigneeId)).size,
    completedKept: blocks.length - pending.length,
  };
}

/** Pre-EDIT preview core (2026-08-22) — separate from
 *  getTemplateDeletionImpactCore above because editTaskTemplateCore's real
 *  eligibility is narrower than plain "pending": PARENT blocks only
 *  (subtasks update as a side effect of their parent, not counted
 *  separately) and excludes PAST-DUE instances (dueAt non-null and before
 *  today — same protection editTaskTemplateCore itself applies, so this
 *  preview's count matches what the save button is actually about to do).
 *  Deletion's own cascade (cancelPendingTemplateRuns) has NO such
 *  exclusions — it cancels every pending block regardless of due date —
 *  so getTemplateDeletionImpactCore stays correct and unchanged for the
 *  Remove-template confirm dialog; this is ONLY for the Edit confirm
 *  dialog. */
export async function getTemplateEditImpactCore(
  user: { id: string },
  templateId: string,
): Promise<TemplateDeletionImpact> {
  const id = z.string().min(1).parse(templateId);
  const template = await prisma.taskTemplate.findFirst({
    where: { id, createdById: user.id },
    select: { id: true },
  });
  if (!template) throw new ApiHttpError(404, "Template not found");
  const boundary = todayStart();

  const blocks = await prisma.runBlock.findMany({
    where: { templateId: id, run: { status: { not: "CANCELLED" }, archivedAt: null } },
    select: { assigneeId: true, status: true, parentId: true, dueAt: true },
  });
  const willUpdate = blocks.filter(
    (b) =>
      b.parentId === null &&
      (PENDING_STATUSES as readonly string[]).includes(b.status) &&
      (!b.dueAt || b.dueAt >= boundary),
  );
  return {
    pendingTasks: willUpdate.length,
    pendingEmployees: new Set(willUpdate.map((b) => b.assigneeId)).size,
    completedKept: blocks.length - willUpdate.length,
  };
}

/** Shared cascade core: CANCEL the runs of every still-pending block of
 *  this template (parents AND subtasks — both are stamped). Cancelled runs
 *  are invisible to the whole data layer (fetchPeriodBlocks & the sidebar
 *  counts filter `run.status != CANCELLED`), so the tasks vanish from
 *  every assignee's lists; completed/N-A records keep their runs, blocks,
 *  and proof untouched. Nothing is hard-deleted. Exported so ./templates's
 *  removeTemplateAssignments (bulk "Remove Task") can reuse it without
 *  duplicating the logic.
 *
 *  `dueWeekday` (2026-08-07, added for Branch Package Schedule; accepts an
 *  array too as of 2026-08-29 for removeTemplateAssigneeCore's per-weekday
 *  removal): optional JS `Date.getDay()` filter (0=Sun..6=Sat, matching
 *  tasks-internal.ts's DAY_INDEX) applied AFTER the DB fetch. Without it,
 *  cancelling one (templateId, assigneeId) pair cancels EVERY pending block
 *  for that pair regardless of which day it's due — fine for callers that
 *  mean "cancel this person's entire pending run of this template", but
 *  wrong for Branch Package Schedule (ONE grid cell, ONE weekday) and for
 *  Remove Assignee (now also scoped to the selected weekday(s) only).
 *
 *  `dueDateRange` (2026-08-22, added for removeTemplateAssigneeCore's
 *  same-day-onward rule; `to` made optional 2026-08-27 — see that
 *  function's own doc comment for the bug this fixed): a plain DB `dueAt`
 *  range filter, applied alongside the others. `to` omitted = no upper
 *  bound (everything from `from` onward). A null `dueAt` is naturally
 *  excluded by a Postgres range comparison (unlike dueWeekday's post-fetch
 *  `getDay()` check above, this needs no special null-handling). */
export async function cancelPendingTemplateRuns(
  actorId: string,
  templateId: string,
  reason: string,
  assigneeId?: string,
  dueWeekday?: number | number[],
  dueDateRange?: { from: Date; to?: Date },
) {
  const dueWeekdays = dueWeekday === undefined ? undefined : Array.isArray(dueWeekday) ? dueWeekday : [dueWeekday];
  const blocks = await prisma.runBlock.findMany({
    where: {
      templateId,
      ...(assigneeId ? { assigneeId } : {}),
      ...(dueDateRange
        ? { dueAt: { gte: dueDateRange.from, ...(dueDateRange.to ? { lt: dueDateRange.to } : {}) } }
        : {}),
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    select: { runId: true, status: true, dueAt: true },
  });
  // `b.dueAt?.getDay()` is `undefined` for a null dueAt, which is never
  // `.includes()`d in dueWeekdays — a block with no due date is silently
  // excluded whenever a weekday filter is applied. Harmless today: every
  // current dueWeekday caller creates its blocks via assignFlowTaskCore
  // with `days: [...]`, which always sets dueAt.
  const matchingBlocks =
    dueWeekdays === undefined ? blocks : blocks.filter((b) => b.dueAt !== null && dueWeekdays.includes(b.dueAt.getDay()));
  const pendingRunIds = [
    ...new Set(
      matchingBlocks
        .filter((b) => (PENDING_STATUSES as readonly string[]).includes(b.status))
        .map((b) => b.runId),
    ),
  ];
  if (pendingRunIds.length > 0) {
    await prisma.flowRun.updateMany({
      where: { id: { in: pendingRunIds } },
      data: { status: "CANCELLED" },
    });
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "RUN_CANCELLED",
        detail: {
          reason,
          templateId,
          cancelledRuns: pendingRunIds.length,
          ...(assigneeId ? { assigneeId } : {}),
          ...(dueWeekdays !== undefined ? { dueWeekdays } : {}),
        },
      },
    });
  }
  return {
    removedTasks: pendingRunIds.length,
    keptRecords: matchingBlocks.length - pendingRunIds.length,
  };
}

/** Delete a template AND cascade to its assignments (2026-07-31 rule) —
 *  see cancelPendingTemplateRuns for the pending/completed split. */
export async function deleteTaskTemplateCore(user: { id: string }, templateId: string) {
  const id = z.string().min(1).parse(templateId);
  const template = await prisma.taskTemplate.findFirst({
    where: { id, createdById: user.id },
    select: { id: true },
  });
  if (!template) throw new ApiHttpError(404, "Template not found");
  const result = await cancelPendingTemplateRuns(user.id, id, "template-deleted");
  await prisma.taskTemplate.delete({ where: { id } });
  return { deleted: true, ...result };
}

const editTemplateSchema = z.object({
  // No max() on title (2026-08-28, user request) — see the identical
  // change to template-groups.ts's groupTaskSchema for why this is safe
  // (both title columns are unbounded Postgres TEXT).
  title: z.string().trim().min(1),
  subtasks: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  guidelineUrl: z.string().trim().url().max(2000).optional(),
  guidelineImage: z
    .object({
      mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      dataBase64: z.string().min(1).max(2 * 1024 * 1024 * 1.37),
    })
    .nullable()
    .optional(),
});
export type TemplateEditInput = z.input<typeof editTemplateSchema>;

/** "{subtask} — {assignee}" naming, matching assignFlowTask's sub-runs:
 *  parent run names are "{title} — {assignee}"; reuse the assignee part. */
function subRunName(subtaskTitle: string, parentRunName: string): string {
  const sep = parentRunName.lastIndexOf(" — ");
  return sep >= 0 ? `${subtaskTitle}${parentRunName.slice(sep)}` : subtaskTitle;
}

/** "Edit Task" core: update the TEMPLATE and propagate the new structure
 *  to every PENDING instance across all employees.
 *  - Pending parents: title + guideline swap in place (ONE fresh shared
 *    Guideline row for the whole edit, like assignment does).
 *  - Subtasks: each pending parent's PENDING subtasks are cancelled and
 *    recreated from the new list (fresh, unchecked). Completed/N-A
 *    subtasks stay untouched as history.
 *  - Completed parent instances (and their whole records) are never
 *    modified — they reflect the task as it was when finished.
 *  - Past-due protection (2026-08-07): a pending parent is ALSO excluded
 *    from the sync if it's past-due — `dueAt` non-null AND before
 *    `todayStart()` — even though its status is still non-terminal (e.g.
 *    OVERDUE/ESCALATED). This is a SEPARATE exclusion from, and additive
 *    to, the existing status-based one above: a block can be non-terminal
 *    status (still "pending" in the PENDING_STATUSES sense) AND past-due
 *    at the same time, and it's specifically that combination this
 *    excludes — an overdue instance reflects the task as it was assigned,
 *    same rationale as completed instances, and must not be silently
 *    rewritten out from under whoever already missed it. Null-`dueAt`
 *    (adhoc/undated) instances are NOT considered past and stay eligible.
 *    Applies to BOTH the single-task "+ Task" hub's Edit tab and
 *    Template/Package group edits, since both call this shared Core.
 *  - Cadence/recipients/days are NOT part of editing: cadence changes only
 *    affect future assignments; recipients are per-assignment. */
export async function editTaskTemplateCore(
  user: { id: string },
  templateId: string,
  input: TemplateEditInput,
): Promise<{ updatedTasks: number; employees: number }> {
  const id = z.string().min(1).parse(templateId);
  const body = editTemplateSchema.parse(input);
  const template = await prisma.taskTemplate.findFirst({
    where: { id, createdById: user.id },
    select: { id: true },
  });
  if (!template) throw new ApiHttpError(404, "Template not found");
  const boundary = todayStart();

  // 1) the template itself. The template NAME follows the title
  // (2026-07-31 fix): after an edit, the picker label and the task
  // title always read the same — no stale "Task (template)" name.
  // (Manual Rename in the Manage panel still works for a deliberate
  // divergence; the next title edit re-syncs.)
  await prisma.taskTemplate.update({
    where: { id },
    data: {
      name: body.title,
      title: body.title,
      subtasks: body.subtasks as unknown as Prisma.InputJsonValue,
      guidelineUrl: body.guidelineUrl ?? null,
      guidelineMime: body.guidelineImage?.mime ?? null,
      guidelineImage: body.guidelineImage
        ? Buffer.from(body.guidelineImage.dataBase64, "base64")
        : null,
    },
  });

  // 2) pending parents (with their run, for cloning subtask runs) —
  // excludes past-due instances (dueAt non-null and before today), see
  // the past-due-protection doc note above.
  const parents = await prisma.runBlock.findMany({
    where: {
      templateId: id,
      parentId: null,
      status: { in: [...PENDING_STATUSES] },
      run: { status: { not: "CANCELLED" }, archivedAt: null },
      OR: [{ dueAt: null }, { dueAt: { gte: boundary } }],
    },
    include: { run: true, runItems: true },
  });

  // ONE fresh shared Guideline row for the whole edit (or none).
  let guidelineId: string | null = null;
  if (body.guidelineUrl || body.guidelineImage) {
    const guideline = await prisma.guideline.create({
      data: {
        url: body.guidelineUrl ?? null,
        imageMime: body.guidelineImage?.mime ?? null,
        imageData: body.guidelineImage
          ? Buffer.from(body.guidelineImage.dataBase64, "base64")
          : null,
      },
    });
    guidelineId = guideline.id;
  }

  for (const parent of parents) {
    await prisma.runBlock.update({
      where: { id: parent.id },
      data: { title: body.title, guidelineId },
    });
    // Cancel this parent's PENDING subtasks (each is its own run)...
    const pendingSubs = await prisma.runBlock.findMany({
      where: {
        parentId: parent.id,
        status: { in: [...PENDING_STATUSES] },
        run: { status: { not: "CANCELLED" }, archivedAt: null },
      },
      select: { runId: true },
    });
    if (pendingSubs.length > 0) {
      await prisma.flowRun.updateMany({
        where: { id: { in: pendingSubs.map((s) => s.runId) } },
        data: { status: "CANCELLED" },
      });
    }
    // ...and recreate from the NEW list, same pattern as assignment.
    for (const [subtaskIndex, subtaskTitle] of body.subtasks.entries()) {
      const subRun = await prisma.flowRun.create({
        data: {
          flowId: parent.run.flowId,
          flowVersion: parent.run.flowVersion,
          templateSnapshot: parent.run.templateSnapshot as Prisma.InputJsonValue,
          name: subRunName(subtaskTitle, parent.run.name),
          startedById: parent.run.startedById,
          triggerType: "MANUAL",
          status: "ACTIVE",
        },
      });
      await prisma.runBlock.create({
        data: {
          runId: subRun.id,
          blockId: parent.blockId,
          nodeId: parent.nodeId,
          title: subtaskTitle,
          assigneeId: parent.assigneeId,
          status: "ACTIVE",
          startedAt: new Date(),
          dueAt: parent.dueAt,
          cadence: parent.cadence,
          parentId: parent.id,
          templateId: id,
          categoryId: parent.categoryId,
          subtaskOrder: subtaskIndex,
          runItems: {
            create: parent.runItems.map((it) => ({
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
    }
  }
  if (parents.length > 0) {
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "BLOCK_STATUS_CHANGED",
        detail: {
          reason: "template-edited",
          templateId: id,
          updatedParents: parents.length,
        },
      },
    });
  }
  return {
    updatedTasks: parents.length,
    employees: new Set(parents.map((p) => p.assigneeId)).size,
  };
}

export interface TemplateAssignee {
  userId: string;
  name: string;
  /** Pending MAIN tasks (subtasks not counted separately). */
  pendingTasks: number;
  /** Which FLOW_DAYS weekday(s) this person currently has a pending
   *  instance due on (2026-08-26, "View Assignees" modal — lets a viewer
   *  see at a glance whether e.g. Tuesday is already covered for this
   *  task). Derived from each pending block's own dueAt, not from any
   *  cadence/schedule config — an undated pending block (dueAt null, e.g.
   *  an ad hoc-tagged one) contributes no day. Sorted in FLOW_DAYS order,
   *  deduped (a person can hold only one pending instance per weekday of a
   *  single template at a time, but this stays a Set for safety). */
  days: (typeof FLOW_DAYS)[number][];
}

/** Who currently holds a PENDING instance of this template on at least one
 *  NON-excluded weekday (removeTemplateAssigneeCore) — Core version with NO
 *  templateGroupId filter (unlike ./templates's own getTemplateAssignees),
 *  so data/template-groups.ts can call this on group-member rows to
 *  aggregate a group's assignees. Exclusion is now PER-WEEKDAY (2026-08-29):
 *  a person excluded on only some of their days still shows here, just with
 *  `days`/`pendingTasks` narrowed down to the days that aren't excluded —
 *  only a person excluded on EVERY day they'd otherwise appear on drops out
 *  entirely. Their still-pending instances on an excluded day are real and
 *  untouched (see removeTemplateAssigneeCore's doc comment) but don't count
 *  as "currently assigned" here — the whole point of exclusion is that
 *  they've been removed from that day going forward. */
export async function getTemplateAssigneesCore(
  user: { id: string },
  templateId: string,
): Promise<TemplateAssignee[]> {
  const id = z.string().min(1).parse(templateId);
  const template = await prisma.taskTemplate.findFirst({
    where: { id, createdById: user.id },
    select: { id: true },
  });
  if (!template) throw new ApiHttpError(404, "Template not found");

  const [parents, excluded] = await Promise.all([
    prisma.runBlock.findMany({
      where: {
        templateId: id,
        parentId: null,
        status: { in: [...PENDING_STATUSES] },
        run: { status: { not: "CANCELLED" }, archivedAt: null },
      },
      select: { assigneeId: true, dueAt: true },
    }),
    prisma.taskTemplateExcludedAssignee.findMany({ where: { templateId: id }, select: { userId: true, weekday: true } }),
  ]);
  const excludedDays = new Set(excluded.map((e) => `${e.userId}::${e.weekday}`));
  const counts = new Map<string, number>();
  const days = new Map<string, Set<(typeof FLOW_DAYS)[number]>>();
  for (const p of parents) {
    const day = p.dueAt ? JS_DAY_TO_FLOW_DAY[p.dueAt.getDay()] : undefined;
    // An undated block (no day to exclude by) always counts; a dated one
    // is skipped only if THIS SPECIFIC (assignee, weekday) is excluded —
    // their other days of the same template are unaffected.
    if (day && excludedDays.has(`${p.assigneeId}::${day}`)) continue;
    counts.set(p.assigneeId, (counts.get(p.assigneeId) ?? 0) + 1);
    if (day) {
      const set = days.get(p.assigneeId) ?? new Set();
      set.add(day);
      days.set(p.assigneeId, set);
    }
  }
  const users = await getUsersByIds([...counts.keys()]);
  return [...counts.entries()]
    .map(([userId, pendingTasks]) => ({
      userId,
      name: users.get(userId)?.name ?? userId,
      pendingTasks,
      days: FLOW_DAYS.filter((d) => days.get(userId)?.has(d)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Remove Assignee" (View Assignees modal, 2026-08-22 rule — corrected
 *  same day; 2026-08-27 fix; made PER-WEEKDAY 2026-08-29 — see below for
 *  both): for each of the given `weekdays`, cancels every instance due on
 *  that weekday, TODAY OR LATER (per the module's todayStart() day-boundary
 *  convention, same one engine/recurrence.ts uses — respects TM_RESET_HOUR,
 *  not naive midnight) — this person is no longer expected to complete any
 *  of them. The person's OTHER weekdays of this same template (not in
 *  `weekdays`) are entirely untouched, and anything due BEFORE today is
 *  left completely untouched regardless of status (pending, overdue,
 *  completed), on ANY weekday. It also records one TaskTemplateExcludedAssignee
 *  row per given weekday, which:
 *   1) narrows this person's `days`/`pendingTasks` in
 *      getTemplateAssigneesCore's "currently assigned" list (above) down to
 *      their non-excluded weekdays, even while a past-dated pending
 *      instance on an excluded day is still naturally running its course,
 *      and
 *   2) makes engine/recurrence.ts's advanceRecurringBlocks stop generating
 *      NEW successors due on that weekday for this (template, assignee)
 *      pair from here on — NOT permanently, though: assignFlowTaskCore
 *      (data/tasks-internal.ts, the shared fan-out every assign path
 *      funnels through) clears the row for whichever weekday(s) are being
 *      (re-)assigned the moment someone explicitly re-assigns this
 *      template's task to this person on that day again (2026-08-28 fix)
 *      — an explicit re-assign is a deliberate "put them back on this"
 *      decision, so it un-does the exclusion rather than leaving the fresh
 *      task to silently never auto-recur past its own due date.
 *
 *  2026-08-27 bug fix (the cancellation window): this used to cancel ONLY
 *  today's instance (a `dueAt` window of exactly [today, tomorrow)), on the
 *  assumption that at most one pending instance could exist at a time.
 *  That's false for a template assigned across several weekdays at once
 *  (e.g. "Tue-Sat" — assignFlowTaskCore's `days` fan-out creates one block
 *  PER selected day in a single call, all up front) — this week's
 *  later-weekday blocks (e.g. Thu/Fri/Sat, already created days earlier
 *  alongside Tuesday's) are due AFTER today but are NOT new recurrence
 *  successors the exclusion row would have blocked; they already existed,
 *  so they kept showing up on the removed person's list for days after
 *  removal. Now cancelling everything from today onward (dueDateRange has
 *  no `to` bound) closes that gap while the documented "before today"
 *  exception (overdue work already in progress) is unchanged.
 *
 *  2026-08-29: made per-weekday (was all-or-nothing per (templateId,
 *  userId)) — a person on a template spanning several days can now be
 *  removed from just some of them, per the View Assignees modal's own
 *  day-picker (shown whenever a person holds more than one day).
 *
 *  Idempotent (upsert on the unique (templateId, userId, weekday) triple
 *  per given weekday). No templateGroupId filter — same reasoning as
 *  getTemplateAssigneesCore, meant to be usable on group members via
 *  data/template-groups.ts. pendingKept is purely informational: how many
 *  of the SELECTED weekdays' past-dated instances are still open and will
 *  keep running exactly as before. */
export async function removeTemplateAssigneeCore(
  user: { id: string },
  templateId: string,
  assigneeId: string,
  weekdays: (typeof FLOW_DAYS)[number][],
): Promise<{ excluded: true; cancelledPending: number; pendingKept: number }> {
  const id = z.string().min(1).parse(templateId);
  const targetAssigneeId = z.string().min(1).parse(assigneeId);
  const targetWeekdays = z.array(z.enum(FLOW_DAYS)).min(1).parse(weekdays);
  const template = await prisma.taskTemplate.findFirst({
    where: { id, createdById: user.id },
    select: { id: true },
  });
  if (!template) throw new ApiHttpError(404, "Template not found");

  const jsWeekdays = targetWeekdays.map((d) => FLOW_DAY_TO_JS_DAY[d]);
  const pendingBefore = await prisma.runBlock.findMany({
    where: {
      templateId: id,
      assigneeId: targetAssigneeId,
      status: { in: [...PENDING_STATUSES] },
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    select: { dueAt: true },
  });
  const totalPendingBefore = pendingBefore.filter(
    (b) => b.dueAt !== null && jsWeekdays.includes(b.dueAt.getDay()),
  ).length;

  // Today OR LATER (no `to` bound) — 2026-08-27 fix, see this function's
  // own doc comment for why an upper bound left later-this-week instances
  // (already created ahead of time by a multi-day fan-out) uncancelled.
  // Scoped to jsWeekdays only — 2026-08-29 fix, the other weekdays of this
  // same template stay completely untouched.
  const todayBoundary = todayStart();
  const { removedTasks: cancelledPending } = await cancelPendingTemplateRuns(
    user.id,
    id,
    "template-assignee-removed",
    targetAssigneeId,
    jsWeekdays,
    { from: todayBoundary },
  );

  await Promise.all(
    targetWeekdays.map((weekday) =>
      prisma.taskTemplateExcludedAssignee.upsert({
        where: { templateId_userId_weekday: { templateId: id, userId: targetAssigneeId, weekday } },
        create: { templateId: id, userId: targetAssigneeId, weekday },
        update: {},
      }),
    ),
  );
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "TEMPLATE_ASSIGNEE_EXCLUDED",
      detail: {
        templateId: id,
        assigneeId: targetAssigneeId,
        weekdays: targetWeekdays,
        cancelledPending,
        pendingKept: totalPendingBefore - cancelledPending,
      },
    },
  });
  return { excluded: true, cancelledPending, pendingKept: totalPendingBefore - cancelledPending };
}
