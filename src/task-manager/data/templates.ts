// Task Templates (2026-07-31): reusable "+ Task" structures — title,
// subtasks, cadence, guideline (link + image bytes) — owned per creator.
// CREATION happens inside assignFlowTask (the "Save as Template" flag on
// the assign input; same-name save overwrites = the edit path); this
// module is the read/manage side: list, load-for-prefill, rename, delete.
// Same allow-list as assigning — templates only exist for people who can
// use them.
import { z } from "zod";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { isElevatedDeptSite } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";

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

/** Delete a template AND cascade to its assignments (2026-07-31 rule):
 *  - PENDING tasks (any non-terminal status) vanish from every assignee's
 *    lists — implemented by CANCELLING their runs, which the entire data
 *    layer already excludes (fetchPeriodBlocks & the sidebar counts filter
 *    `run.status != CANCELLED`). Nothing is hard-deleted, so this is
 *    recoverable by hand if ever needed, and audit logs stay coherent.
 *  - COMPLETED / N-A tasks keep their runs, blocks, and proof untouched.
 *  - The template row itself is removed from the Templates list. */
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

    const blocks = await prisma.runBlock.findMany({
      where: { templateId: id, run: { status: { not: "CANCELLED" } } },
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
          actorId: user.id,
          action: "RUN_CANCELLED",
          detail: {
            reason: "template-deleted",
            templateId: id,
            cancelledRuns: pendingRunIds.length,
          },
        },
      });
    }
    await prisma.taskTemplate.delete({ where: { id } });
    return {
      deleted: true,
      removedTasks: pendingRunIds.length,
      keptRecords: blocks.length - pendingRunIds.length,
    };
  }, "deleteTaskTemplate");
}
