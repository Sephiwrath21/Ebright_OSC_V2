// Task Templates (2026-07-31): reusable "+ Task" structures — title,
// subtasks, cadence, guideline (link + image bytes) — owned per creator.
// CREATION happens inside assignFlowTask (the "Save as Template" flag on
// the assign input; same-name save overwrites = the edit path); this
// module is the read/manage side: list, load-for-prefill, rename, delete.
// Same allow-list as assigning — templates only exist for people who can
// use them.
import { z } from "zod";
import type { Prisma } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { isElevatedDeptSite } from "../analytics/_lib";
import { getUsersByIds } from "../lib/users";
import { native, requireUserByEmail } from "./core";
import { reassignFlowTask } from "./tasks";

const CADENCE_OPTION_OF = { DAILY: "daily", MONTHLY: "monthly", ADHOC: "adhoc" } as const;

export interface TaskTemplateSummary {
  id: string;
  name: string;
  title: string;
  subtaskCount: number;
  hasGuidelineUrl: boolean;
  hasGuidelineImage: boolean;
  updatedAt: string; // ISO
}

export interface TaskTemplateDetail {
  id: string;
  name: string;
  title: string;
  subtasks: string[];
  cadence: "daily" | "monthly" | "adhoc" | null;
  guidelineUrl: string | null;
  guidelineImage: { mime: string; dataBase64: string } | null;
}

async function requireAssigner(email: string) {
  const user = await requireUserByEmail(email);
  const allowed =
    user.role === "ADMIN" ||
    user.role === "OPS" ||
    user.role === "CEO" ||
    user.role === "HOD" ||
    isElevatedDeptSite(user);
  if (!allowed) {
    throw new ApiHttpError(403, "Only assign-capable accounts can manage task templates");
  }
  return user;
}

export function listTaskTemplates(email: string): Promise<TaskTemplateSummary[]> {
  return native(async () => {
    const user = await requireAssigner(email);
    const rows = await prisma.taskTemplate.findMany({
      where: { createdById: user.id },
      orderBy: { updatedAt: "desc" },
      // Never select the image BYTES for a list — load-for-prefill only.
      select: {
        id: true,
        name: true,
        title: true,
        subtasks: true,
        guidelineUrl: true,
        guidelineMime: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      subtaskCount: Array.isArray(r.subtasks) ? r.subtasks.length : 0,
      hasGuidelineUrl: r.guidelineUrl !== null,
      hasGuidelineImage: r.guidelineMime !== null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }, "listTaskTemplates");
}

/** Full template incl. the guideline image as base64 — feeds straight into
 *  the assign form's prefill (same shape the form submits back). */
export function getTaskTemplate(email: string, templateId: string): Promise<TaskTemplateDetail> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const row = await prisma.taskTemplate.findFirst({
      where: { id, createdById: user.id },
    });
    if (!row) throw new ApiHttpError(404, "Template not found");
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      subtasks: Array.isArray(row.subtasks) ? (row.subtasks as string[]) : [],
      cadence: row.cadence ? CADENCE_OPTION_OF[row.cadence] : null,
      guidelineUrl: row.guidelineUrl,
      guidelineImage:
        row.guidelineMime && row.guidelineImage
          ? { mime: row.guidelineMime, dataBase64: Buffer.from(row.guidelineImage).toString("base64") }
          : null,
    };
  }, "getTaskTemplate");
}

export function renameTaskTemplate(
  email: string,
  templateId: string,
  name: string,
): Promise<{ renamed: boolean }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const newName = z.string().trim().min(1).max(100).parse(name);
    const result = await prisma.taskTemplate.updateMany({
      where: { id, createdById: user.id },
      data: { name: newName },
    });
    if (result.count === 0) throw new ApiHttpError(404, "Template not found");
    return { renamed: true };
  }, "renameTaskTemplate");
}

/** "Still pending" for the deletion cascade = any non-terminal status —
 *  DONE and SKIPPED (N/A) both count as resolved history and are KEPT. */
const PENDING_STATUSES = ["PENDING", "ACTIVE", "OVERDUE", "ESCALATED"] as const;

export interface TemplateDeletionImpact {
  /** Pending task rows (incl. subtasks) that deletion would remove. */
  pendingTasks: number;
  /** Distinct employees who still have a pending task from this template. */
  pendingEmployees: number;
  /** Completed/N-A rows that will be KEPT untouched. */
  completedKept: number;
}

/** Pre-deletion preview for the confirmation dialog: how many pending
 *  assignments would be removed, from how many employees, and how many
 *  completed records stay. */
export function getTemplateDeletionImpact(
  email: string,
  templateId: string,
): Promise<TemplateDeletionImpact> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const template = await prisma.taskTemplate.findFirst({
      where: { id, createdById: user.id },
      select: { id: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");

    const blocks = await prisma.runBlock.findMany({
      where: { templateId: id, run: { status: { not: "CANCELLED" } } },
      select: { assigneeId: true, status: true },
    });
    const pending = blocks.filter((b) => (PENDING_STATUSES as readonly string[]).includes(b.status));
    return {
      pendingTasks: pending.length,
      pendingEmployees: new Set(pending.map((b) => b.assigneeId)).size,
      completedKept: blocks.length - pending.length,
    };
  }, "getTemplateDeletionImpact");
}

/** Shared cascade core: CANCEL the runs of every still-pending block of
 *  this template (parents AND subtasks — both are stamped). Cancelled runs
 *  are invisible to the whole data layer (fetchPeriodBlocks & the sidebar
 *  counts filter `run.status != CANCELLED`), so the tasks vanish from
 *  every assignee's lists; completed/N-A records keep their runs, blocks,
 *  and proof untouched. Nothing is hard-deleted. */
async function cancelPendingTemplateRuns(actorId: string, templateId: string, reason: string) {
  const blocks = await prisma.runBlock.findMany({
    where: { templateId, run: { status: { not: "CANCELLED" } } },
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
export function deleteTaskTemplate(
  email: string,
  templateId: string,
): Promise<{ deleted: boolean; removedTasks: number; keptRecords: number }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const template = await prisma.taskTemplate.findFirst({
      where: { id, createdById: user.id },
      select: { id: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");
    const result = await cancelPendingTemplateRuns(user.id, id, "template-deleted");
    await prisma.taskTemplate.delete({ where: { id } });
    return { deleted: true, ...result };
  }, "deleteTaskTemplate");
}

/** "Remove Task" in bulk (2026-07-31, + Task hub): cancel every pending
 *  instance of this template across all employees in ONE action —
 *  optionally deleting the template too. Completed records always kept. */
export function removeTemplateAssignments(
  email: string,
  templateId: string,
  opts: { deleteTemplate: boolean },
): Promise<{ removedTasks: number; keptRecords: number; templateDeleted: boolean }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const template = await prisma.taskTemplate.findFirst({
      where: { id, createdById: user.id },
      select: { id: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");
    const result = await cancelPendingTemplateRuns(user.id, id, "template-bulk-remove");
    if (opts.deleteTemplate) await prisma.taskTemplate.delete({ where: { id } });
    return { ...result, templateDeleted: opts.deleteTemplate };
  }, "removeTemplateAssignments");
}

export interface TemplateAssignee {
  userId: string;
  name: string;
  /** Pending MAIN tasks (subtasks not counted separately). */
  pendingTasks: number;
}

/** Who currently holds a PENDING instance of this template — feeds the
 *  Remove/Reassign panels and the confirmation counts. */
export function getTemplateAssignees(
  email: string,
  templateId: string,
): Promise<TemplateAssignee[]> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const template = await prisma.taskTemplate.findFirst({
      where: { id, createdById: user.id },
      select: { id: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");

    const parents = await prisma.runBlock.findMany({
      where: {
        templateId: id,
        parentId: null,
        status: { in: [...PENDING_STATUSES] },
        run: { status: { not: "CANCELLED" } },
      },
      select: { assigneeId: true },
    });
    const counts = new Map<string, number>();
    for (const p of parents) counts.set(p.assigneeId, (counts.get(p.assigneeId) ?? 0) + 1);
    const users = await getUsersByIds([...counts.keys()]);
    return [...counts.entries()]
      .map(([userId, pendingTasks]) => ({
        userId,
        name: users.get(userId)?.name ?? userId,
        pendingTasks,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, "getTemplateAssignees");
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

/** "Edit Task" (2026-07-31, + Task hub): update the TEMPLATE and propagate
 *  the new structure to every PENDING instance across all employees.
 *  - Pending parents: title + guideline swap in place (ONE fresh shared
 *    Guideline row for the whole edit, like assignment does).
 *  - Subtasks: each pending parent's PENDING subtasks are cancelled and
 *    recreated from the new list (fresh, unchecked). Completed/N-A
 *    subtasks stay untouched as history.
 *  - Completed parent instances (and their whole records) are never
 *    modified — they reflect the task as it was when finished.
 *  - Cadence/recipients/days are NOT part of editing: cadence changes only
 *    affect future assignments; recipients are per-assignment. */
export function editTaskTemplate(
  email: string,
  templateId: string,
  input: TemplateEditInput,
): Promise<{ updatedTasks: number; employees: number }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const body = editTemplateSchema.parse(input);
    const template = await prisma.taskTemplate.findFirst({
      where: { id, createdById: user.id },
      select: { id: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");

    // 1) the template itself (name unchanged — rename is its own action)
    await prisma.taskTemplate.update({
      where: { id },
      data: {
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
        run: { status: { not: "CANCELLED" } },
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
          run: { status: { not: "CANCELLED" } },
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
      for (const subtaskTitle of body.subtasks) {
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
  }, "editTaskTemplate");
}

/** "{subtask} — {assignee}" naming, matching assignFlowTask's sub-runs:
 *  parent run names are "{title} — {assignee}"; reuse the assignee part. */
function subRunName(subtaskTitle: string, parentRunName: string): string {
  const sep = parentRunName.lastIndexOf(" — ");
  return sep >= 0 ? `${subtaskTitle}${parentRunName.slice(sep)}` : subtaskTitle;
}

/** "Reassign Task" (2026-07-31, + Task hub): move ONE employee's pending
 *  instance(s) of this template — parent AND pending subtasks — to another
 *  employee, through reassignFlowTask so every authorization rule (incl.
 *  HOD same-department both ends) and audit entry applies per block. */
export function reassignTemplateTasks(
  email: string,
  templateId: string,
  fromUserId: string,
  toUserId: string,
): Promise<{ moved: number }> {
  return native(async () => {
    await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const from = z.string().min(1).parse(fromUserId);
    const to = z.string().min(1).parse(toUserId);
    const blocks = await prisma.runBlock.findMany({
      where: {
        templateId: id,
        assigneeId: from,
        status: { in: [...PENDING_STATUSES] },
        run: { status: { not: "CANCELLED" } },
      },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (blocks.length === 0) {
      throw new ApiHttpError(404, "That employee has no pending tasks from this template");
    }
    for (const b of blocks) {
      await reassignFlowTask(email, b.id, to);
    }
    return { moved: blocks.length };
  }, "reassignTemplateTasks");
}
