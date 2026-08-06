// Task Templates — pre-authorized Core logic (2026-08-06): the actual
// cascade-safe mutation/read logic behind ./templates's exported
// deleteTaskTemplate/editTaskTemplate/getTemplateDeletionImpact, factored
// out so an ALREADY-authorized caller (data/template-groups.ts, whose own
// requireGroupAccess uses a DIFFERENT per-scope allow-list than
// ./templates's requireAssigner) can invoke the same logic without
// re-running requireAssigner's narrower check — which would incorrectly
// reject a Branch Manager requireGroupAccess already authorized. See
// template-groups.ts's file header for the full double-gating
// explanation.
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

/** Shared cascade core: CANCEL the runs of every still-pending block of
 *  this template (parents AND subtasks — both are stamped). Cancelled runs
 *  are invisible to the whole data layer (fetchPeriodBlocks & the sidebar
 *  counts filter `run.status != CANCELLED`), so the tasks vanish from
 *  every assignee's lists; completed/N-A records keep their runs, blocks,
 *  and proof untouched. Nothing is hard-deleted. Exported so ./templates's
 *  removeTemplateAssignments (bulk "Remove Task") can reuse it without
 *  duplicating the logic. */
export async function cancelPendingTemplateRuns(actorId: string, templateId: string, reason: string) {
  const blocks = await prisma.runBlock.findMany({
    where: { templateId, run: { status: { not: "CANCELLED" }, archivedAt: null } },
    select: { runId: true, status: true },
  });
  const pendingRunIds = [
    ...new Set(
      blocks
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
        detail: { reason, templateId, cancelledRuns: pendingRunIds.length },
      },
    });
  }
  return { removedTasks: pendingRunIds.length, keptRecords: blocks.length - pendingRunIds.length };
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

  // 2) pending parents (with their run, for cloning subtask runs)
  const parents = await prisma.runBlock.findMany({
    where: {
      templateId: id,
      parentId: null,
      status: { in: [...PENDING_STATUSES] },
      run: { status: { not: "CANCELLED" }, archivedAt: null },
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
