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
 *  `dueWeekday` (2026-08-07, added for Branch Package Schedule): optional
 *  JS `Date.getDay()` filter (0=Sun..6=Sat, matching tasks-internal.ts's
 *  DAY_INDEX) applied AFTER the DB fetch. Without it, cancelling one
 *  (templateId, assigneeId) pair cancels EVERY pending block for that pair
 *  regardless of which day it's due — fine for the existing callers (they
 *  mean "cancel this person's entire pending run of this template"), but
 *  wrong for Branch Package Schedule, where clearing/changing ONE grid cell
 *  (branch, weekday) must cancel only that weekday's recurring assignment
 *  and leave the same manager's OTHER-weekday assignment of the same
 *  package/template untouched. Both existing call sites omit it and keep
 *  their unfiltered (all-weekdays) behavior unchanged.
 *
 *  `dueDateRange` (2026-08-22, added for removeTemplateAssigneeCore's
 *  "cancel today's instance only" rule): a plain DB `dueAt` range filter,
 *  applied alongside the others. A null `dueAt` is naturally excluded by a
 *  Postgres range comparison (unlike dueWeekday's post-fetch `getDay()`
 *  check above, this needs no special null-handling). */
export async function cancelPendingTemplateRuns(
  actorId: string,
  templateId: string,
  reason: string,
  assigneeId?: string,
  dueWeekday?: number,
  dueDateRange?: { from: Date; to: Date },
) {
  const blocks = await prisma.runBlock.findMany({
    where: {
      templateId,
      ...(assigneeId ? { assigneeId } : {}),
      ...(dueDateRange ? { dueAt: { gte: dueDateRange.from, lt: dueDateRange.to } } : {}),
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    select: { runId: true, status: true, dueAt: true },
  });
  // `b.dueAt?.getDay()` is `undefined` for a null dueAt, which never equals
  // a numeric dueWeekday — a block with no due date is silently excluded
  // whenever a weekday filter is applied. Harmless today: every current
  // dueWeekday caller (Branch Package Schedule) always creates its blocks
  // via assignFlowTaskCore with `days: [weekday]`, which always sets dueAt.
  const matchingBlocks =
    dueWeekday === undefined ? blocks : blocks.filter((b) => b.dueAt?.getDay() === dueWeekday);
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
          ...(dueWeekday !== undefined ? { dueWeekday } : {}),
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
  title: z.string().trim().min(1).max(200),
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
}

/** Who currently holds a PENDING instance of this template AND hasn't been
 *  excluded (removeTemplateAssigneeCore) — Core version with NO
 *  templateGroupId filter (unlike ./templates's own getTemplateAssignees),
 *  so data/template-groups.ts can call this on group-member rows to
 *  aggregate a group's assignees. An excluded person's still-pending
 *  instance is real and untouched (see removeTemplateAssigneeCore's doc
 *  comment) but they no longer count as "currently assigned" here — the
 *  whole point of exclusion is that they've been removed going forward. */
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
      select: { assigneeId: true },
    }),
    prisma.taskTemplateExcludedAssignee.findMany({ where: { templateId: id }, select: { userId: true } }),
  ]);
  const excludedIds = new Set(excluded.map((e) => e.userId));
  const counts = new Map<string, number>();
  for (const p of parents) {
    if (excludedIds.has(p.assigneeId)) continue;
    counts.set(p.assigneeId, (counts.get(p.assigneeId) ?? 0) + 1);
  }
  const users = await getUsersByIds([...counts.keys()]);
  return [...counts.entries()]
    .map(([userId, pendingTasks]) => ({
      userId,
      name: users.get(userId)?.name ?? userId,
      pendingTasks,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Remove Assignee" (View Assignees modal, 2026-08-22 rule — corrected
 *  same day): cancels ONLY today's instance (per the module's todayStart()
 *  day-boundary convention, same one engine/recurrence.ts uses — respects
 *  TM_RESET_HOUR, not naive midnight) — this person is no longer expected
 *  to complete a task that started today. Anything due BEFORE today is
 *  left completely untouched regardless of status (pending, overdue,
 *  completed). It also records a TaskTemplateExcludedAssignee row, which:
 *   1) drops this person out of getTemplateAssigneesCore's "currently
 *      assigned" list (above) even while a past-dated pending instance is
 *      still naturally running its course, and
 *   2) makes engine/recurrence.ts's advanceRecurringBlocks stop generating
 *      NEW successors for this (template, assignee) pair from here on.
 *  Idempotent (upsert on the unique (templateId, userId) pair; re-running
 *  this on a later day cancels THAT day's instance, if any). No
 *  templateGroupId filter — same reasoning as getTemplateAssigneesCore,
 *  meant to be usable on group members via data/template-groups.ts.
 *  pendingKept is purely informational: how many past-dated instances are
 *  still open and will keep running exactly as before. */
export async function removeTemplateAssigneeCore(
  user: { id: string },
  templateId: string,
  assigneeId: string,
): Promise<{ excluded: true; cancelledToday: number; pendingKept: number }> {
  const id = z.string().min(1).parse(templateId);
  const targetAssigneeId = z.string().min(1).parse(assigneeId);
  const template = await prisma.taskTemplate.findFirst({
    where: { id, createdById: user.id },
    select: { id: true },
  });
  if (!template) throw new ApiHttpError(404, "Template not found");

  const totalPendingBefore = await prisma.runBlock.count({
    where: {
      templateId: id,
      assigneeId: targetAssigneeId,
      status: { in: [...PENDING_STATUSES] },
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
  });

  const todayBoundary = todayStart();
  const tomorrowBoundary = new Date(todayBoundary.getTime() + 24 * 60 * 60 * 1000);
  const { removedTasks: cancelledToday } = await cancelPendingTemplateRuns(
    user.id,
    id,
    "template-assignee-removed",
    targetAssigneeId,
    undefined,
    { from: todayBoundary, to: tomorrowBoundary },
  );

  await prisma.taskTemplateExcludedAssignee.upsert({
    where: { templateId_userId: { templateId: id, userId: targetAssigneeId } },
    create: { templateId: id, userId: targetAssigneeId },
    update: {},
  });
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "TEMPLATE_ASSIGNEE_EXCLUDED",
      detail: { templateId: id, assigneeId: targetAssigneeId, cancelledToday, pendingKept: totalPendingBefore - cancelledToday },
    },
  });
  return { excluded: true, cancelledToday, pendingKept: totalPendingBefore - cancelledToday };
}
