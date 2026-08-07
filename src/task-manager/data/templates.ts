// Task Templates (2026-07-31): reusable "+ Task" structures — title,
// subtasks, cadence, guideline (link + image bytes) — owned per creator.
// CREATION happens inside assignFlowTask (the "Save as Template" flag on
// the assign input; same-name save overwrites = the edit path); this
// module is the read/manage side: list, load-for-prefill, rename, delete.
// Same allow-list as assigning — templates only exist for people who can
// use them.
//
// Cascade-safe Core logic for delete/edit/deletion-impact lives in
// ./templates-internal (2026-08-06) — factored out so
// data/template-groups.ts, which authorizes actors via its own
// requireGroupAccess (a DIFFERENT per-scope allow-list than this file's
// requireAssigner), can reuse that logic for an already-authorized actor
// without re-running requireAssigner's narrower check. That file is
// deliberately NOT re-exported by data.ts's `export * from "./data/templates"`
// barrel, since its Core functions take a bare `{ id: string }` user with
// no proof of authorization — see its file header for the full
// explanation. The two TYPES it owns (TemplateDeletionImpact,
// TemplateEditInput) are re-exported below since types carry no runtime
// capability and this file's own exported functions still need to
// reference them.
import { z } from "zod";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { isElevatedDeptSite } from "../analytics/_lib";
import { getUsersByIds } from "../lib/users";
import { native, requireUserByEmail } from "./core";
import { reassignFlowTask } from "./tasks";
import {
  PENDING_STATUSES,
  cancelPendingTemplateRuns,
  deleteTaskTemplateCore,
  editTaskTemplateCore,
  getTemplateDeletionImpactCore,
  type TemplateDeletionImpact,
  type TemplateEditInput,
} from "./templates-internal";

export type { TemplateDeletionImpact, TemplateEditInput };

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

export async function requireAssigner(email: string) {
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
      // Archived templates leave every active surface (assign picker,
      // Edit/Remove/Reassign tabs) — the Archive tab lists them instead.
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { createdById: user.id, archivedAt: null, templateGroupId: null },
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
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { id, createdById: user.id, templateGroupId: null },
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
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { id, createdById: user.id, templateGroupId: null },
      data: { name: newName },
    });
    if (result.count === 0) throw new ApiHttpError(404, "Template not found");
    return { renamed: true };
  }, "renameTaskTemplate");
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
    return getTemplateDeletionImpactCore(user, templateId);
  }, "getTemplateDeletionImpact");
}

/** Delete a template AND cascade to its assignments (2026-07-31 rule) —
 *  see ./templates-internal's cancelPendingTemplateRuns for the
 *  pending/completed split. */
export function deleteTaskTemplate(
  email: string,
  templateId: string,
): Promise<{ deleted: boolean; removedTasks: number; keptRecords: number }> {
  return native(async () => {
    const user = await requireAssigner(email);
    return deleteTaskTemplateCore(user, templateId);
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
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { id, createdById: user.id, templateGroupId: null },
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
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { id, createdById: user.id, templateGroupId: null },
      select: { id: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");

    const parents = await prisma.runBlock.findMany({
      where: {
        templateId: id,
        parentId: null,
        status: { in: [...PENDING_STATUSES] },
        run: { status: { not: "CANCELLED" }, archivedAt: null },
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

/** "Edit Task" (2026-07-31, + Task hub): update the TEMPLATE and propagate
 *  the new structure to every PENDING instance across all employees. See
 *  ./templates-internal's editTaskTemplateCore for the full cascade
 *  behavior (guideline swap, pending-subtask regeneration, etc.). */
export function editTaskTemplate(
  email: string,
  templateId: string,
  input: TemplateEditInput,
): Promise<{ updatedTasks: number; employees: number }> {
  return native(async () => {
    const user = await requireAssigner(email);
    return editTaskTemplateCore(user, templateId, input);
  }, "editTaskTemplate");
}

// ---------------------------------------------------------------------
// Archive / Unarchive (2026-07-31) — the REVERSIBLE counterpart to bulk
// Remove. Archiving stamps FlowRun.archivedAt on the target's PENDING
// instances (completed/N-A history is never touched — those runs keep
// showing in history exactly as before, since only pending runs get
// stamped) and, for whole-template archives, TaskTemplate.archivedAt too
// (removing it from the assign picker). Everything is restorable.

export interface ArchivedTemplateEntry {
  id: string;
  name: string;
  title: string;
  archivedTasks: number; // archived pending MAIN tasks across employees
  archivedAt: string; // ISO
}
export interface ArchivedInstanceEntry {
  templateId: string;
  templateName: string;
  userId: string;
  userName: string;
  archivedTasks: number;
}
export interface ArchivedItems {
  templates: ArchivedTemplateEntry[];
  /** Per-employee archives under templates that are themselves ACTIVE. */
  instances: ArchivedInstanceEntry[];
}

/** Archive a whole template (userId omitted) or one employee's pending
 *  instances of it. Returns how many runs were archived. */
export function archiveTemplateTasks(
  email: string,
  templateId: string,
  userId?: string,
): Promise<{ archivedRuns: number; templateArchived: boolean }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const template = await prisma.taskTemplate.findFirst({
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { id, createdById: user.id, templateGroupId: null },
      select: { id: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");

    const blocks = await prisma.runBlock.findMany({
      where: {
        templateId: id,
        ...(userId ? { assigneeId: userId } : {}),
        status: { in: [...PENDING_STATUSES] },
        run: { status: { not: "CANCELLED" }, archivedAt: null },
      },
      select: { runId: true },
    });
    const runIds = [...new Set(blocks.map((b) => b.runId))];
    if (runIds.length > 0) {
      await prisma.flowRun.updateMany({
        where: { id: { in: runIds } },
        data: { archivedAt: new Date() },
      });
    }
    if (!userId) {
      await prisma.taskTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
    }
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "BLOCK_STATUS_CHANGED",
        detail: {
          reason: "archived",
          templateId: id,
          scope: userId ?? "template",
          archivedRuns: runIds.length,
        },
      },
    });
    return { archivedRuns: runIds.length, templateArchived: !userId };
  }, "archiveTemplateTasks");
}

/** Restore: whole template (clears TaskTemplate.archivedAt AND un-archives
 *  every archived run of it) or one employee's instances. */
export function unarchiveTemplateTasks(
  email: string,
  templateId: string,
  userId?: string,
): Promise<{ restoredRuns: number; templateRestored: boolean }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const template = await prisma.taskTemplate.findFirst({
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { id, createdById: user.id, templateGroupId: null },
      select: { id: true, archivedAt: true },
    });
    if (!template) throw new ApiHttpError(404, "Template not found");

    const blocks = await prisma.runBlock.findMany({
      where: {
        templateId: id,
        ...(userId ? { assigneeId: userId } : {}),
        run: { status: { not: "CANCELLED" }, archivedAt: { not: null } },
      },
      select: { runId: true },
    });
    const runIds = [...new Set(blocks.map((b) => b.runId))];
    if (runIds.length > 0) {
      await prisma.flowRun.updateMany({
        where: { id: { in: runIds } },
        data: { archivedAt: null },
      });
    }
    const restoreTemplate = !userId && template.archivedAt !== null;
    if (restoreTemplate) {
      await prisma.taskTemplate.update({ where: { id }, data: { archivedAt: null } });
    }
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "BLOCK_STATUS_CHANGED",
        detail: {
          reason: "unarchived",
          templateId: id,
          scope: userId ?? "template",
          restoredRuns: runIds.length,
        },
      },
    });
    return { restoredRuns: runIds.length, templateRestored: restoreTemplate };
  }, "unarchiveTemplateTasks");
}

/** Everything currently archived, for the Archive tab's "Archived" list:
 *  the actor's archived templates + per-employee archives under their
 *  still-active templates. */
export function listArchivedItems(email: string): Promise<ArchivedItems> {
  return native(async () => {
    const user = await requireAssigner(email);
    const all = await prisma.taskTemplate.findMany({
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { createdById: user.id, templateGroupId: null },
      select: { id: true, name: true, title: true, archivedAt: true },
    });
    const byId = new Map(all.map((t) => [t.id, t]));

    // Archived PARENT blocks across this actor's templates, one query.
    const archivedParents = await prisma.runBlock.findMany({
      where: {
        templateId: { in: all.map((t) => t.id) },
        parentId: null,
        run: { status: { not: "CANCELLED" }, archivedAt: { not: null } },
      },
      select: { templateId: true, assigneeId: true },
    });

    const templates: ArchivedTemplateEntry[] = all
      .filter((t) => t.archivedAt !== null)
      .map((t) => ({
        id: t.id,
        name: t.name,
        title: t.title,
        archivedTasks: archivedParents.filter((p) => p.templateId === t.id).length,
        archivedAt: t.archivedAt!.toISOString(),
      }))
      .sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));

    // Per-employee archives under ACTIVE templates.
    const counts = new Map<string, number>(); // `${templateId}:${userId}`
    for (const p of archivedParents) {
      const t = byId.get(p.templateId!);
      if (!t || t.archivedAt !== null) continue;
      const key = `${p.templateId}:${p.assigneeId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const users = await getUsersByIds([...counts.keys()].map((k) => k.split(":")[1]));
    const instances: ArchivedInstanceEntry[] = [...counts.entries()]
      .map(([key, archivedTasks]) => {
        const [tplId, uid] = key.split(":");
        return {
          templateId: tplId,
          templateName: byId.get(tplId)?.name ?? tplId,
          userId: uid,
          userName: users.get(uid)?.name ?? uid,
          archivedTasks,
        };
      })
      .sort(
        (a, b) =>
          a.templateName.localeCompare(b.templateName) || a.userName.localeCompare(b.userName),
      );

    return { templates, instances };
  }, "listArchivedItems");
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
        run: { status: { not: "CANCELLED" }, archivedAt: null },
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
