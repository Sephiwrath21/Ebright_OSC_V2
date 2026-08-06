// Task Template Groups (2026-08-06): a named collection of several
// top-level TaskTemplate rows ("Template" on /task-manager/template) —
// grouping layer only. Each task inside a group is an ORDINARY TaskTemplate
// row (templateGroupId set, groupPosition for display order); all
// cascade-safety (pending-assignment cancellation, edit propagation,
// deletion impact) is delegated to the existing single-task functions in
// ./templates — this module only orchestrates them across a group's
// members and adds the group wrapper itself. Creating/editing a group
// never touches recipients/days/due-date/cadence — "Assign"
// (applyTemplateGroup) is a separate action that picks those once and fans
// out to assignFlowTask per member task.
import { z } from "zod";
import type { Prisma } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { native } from "./core";
import {
  deleteTaskTemplate,
  editTaskTemplate,
  getTemplateDeletionImpact,
  requireAssigner,
} from "./templates";
import { assignFlowTask } from "./tasks";
import { FLOW_DAYS, type FlowAssignInput } from "../ui/types";

const GROUP_TASK_MAX = 20;

const groupTaskSchema = z.object({
  /** Present = an existing member being kept (edit reconciliation); absent
   *  = a new task to create. */
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  subtasks: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
});

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tasks: z.array(groupTaskSchema.omit({ id: true })).min(1).max(GROUP_TASK_MAX),
});
export type CreateTemplateGroupInput = z.input<typeof createGroupSchema>;

const editGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tasks: z.array(groupTaskSchema).min(1).max(GROUP_TASK_MAX),
});
export type EditTemplateGroupInput = z.input<typeof editGroupSchema>;

export interface TemplateGroupSummary {
  id: string;
  name: string;
  taskCount: number;
  /** First 3 member task titles, group order — dashboard card preview. */
  previewTitles: string[];
  updatedAt: string; // ISO
}

export interface TemplateGroupTask {
  id: string;
  title: string;
  subtasks: string[];
}

export interface TemplateGroupDetail {
  id: string;
  name: string;
  tasks: TemplateGroupTask[];
}

/** Cards data for the /task-manager/template dashboard. */
export function listTemplateGroups(email: string): Promise<TemplateGroupSummary[]> {
  return native(async () => {
    const user = await requireAssigner(email);
    const groups = await prisma.taskTemplateGroup.findMany({
      where: { createdById: user.id, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        templates: {
          orderBy: { groupPosition: "asc" },
          select: { title: true },
        },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      taskCount: g.templates.length,
      previewTitles: g.templates.slice(0, 3).map((t) => t.title),
      updatedAt: g.updatedAt.toISOString(),
    }));
  }, "listTemplateGroups");
}

/** Full detail for the Edit modal's prefill. */
export function getTemplateGroup(email: string, groupId: string): Promise<TemplateGroupDetail> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      include: { templates: { orderBy: { groupPosition: "asc" } } },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");
    return {
      id: group.id,
      name: group.name,
      tasks: group.templates.map((t) => ({
        id: t.id,
        title: t.title,
        subtasks: Array.isArray(t.subtasks) ? (t.subtasks as string[]) : [],
      })),
    };
  }, "getTemplateGroup");
}

/** Creates the group and every member task in one transaction — never
 *  touches recipients/days/due-date/cadence (create-only, no assignee). */
export function createTemplateGroup(
  email: string,
  input: CreateTemplateGroupInput,
): Promise<{ id: string }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const body = createGroupSchema.parse(input);
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.taskTemplateGroup.create({
        data: { createdById: user.id, name: body.name },
      });
      for (const [index, t] of body.tasks.entries()) {
        await tx.taskTemplate.create({
          data: {
            createdById: user.id,
            name: t.title,
            title: t.title,
            subtasks: t.subtasks as unknown as Prisma.InputJsonValue,
            templateGroupId: g.id,
            groupPosition: index,
          },
        });
      }
      return g;
    });
    return { id: group.id };
  }, "createTemplateGroup");
}

export interface EditTemplateGroupResult {
  updatedTasks: number;
  createdTasks: number;
  removedTasks: number;
  employees: number;
}

/** Renames the group and reconciles its member tasks against the submitted
 *  list: kept members (id present) go through editTaskTemplate (propagates
 *  to pending instances, same as the single-task Edit tab); removed
 *  members go through deleteTaskTemplate (cancels their pending
 *  instances); new members (id absent) are created fresh. `employees` sums
 *  per-task counts and may double-count someone with pending tasks from
 *  more than one member of this group — an acceptable approximation for a
 *  summary count, same caveat the single-task Edit panel already has.
 *  Not wrapped in a transaction across members — if one member's edit/
 *  delete throws partway through (e.g. concurrently deleted by another
 *  admin), earlier iterations' changes are already committed and the
 *  group is left partially reconciled. Accepted trade-off, matching
 *  templates.ts's own non-transactional multi-step writes; callers should
 *  treat a thrown error as "re-fetch and re-check," not "nothing happened." */
export function editTemplateGroup(
  email: string,
  groupId: string,
  input: EditTemplateGroupInput,
): Promise<EditTemplateGroupResult> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const body = editGroupSchema.parse(input);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      select: { id: true },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");

    await prisma.taskTemplateGroup.update({ where: { id }, data: { name: body.name } });

    const existing = await prisma.taskTemplate.findMany({
      where: { templateGroupId: id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((t) => t.id));
    const submittedIds = new Set(body.tasks.filter((t) => t.id).map((t) => t.id as string));

    let removedTasks = 0;
    for (const memberId of existingIds) {
      if (!submittedIds.has(memberId)) {
        const result = await deleteTaskTemplate(email, memberId);
        removedTasks += result.removedTasks;
      }
    }

    let updatedTasks = 0;
    let createdTasks = 0;
    let employees = 0;
    for (const [index, t] of body.tasks.entries()) {
      if (t.id && existingIds.has(t.id)) {
        const result = await editTaskTemplate(email, t.id, { title: t.title, subtasks: t.subtasks });
        updatedTasks += result.updatedTasks;
        employees += result.employees;
        await prisma.taskTemplate.update({ where: { id: t.id }, data: { groupPosition: index } });
      } else {
        await prisma.taskTemplate.create({
          data: {
            createdById: user.id,
            name: t.title,
            title: t.title,
            subtasks: t.subtasks as unknown as Prisma.InputJsonValue,
            templateGroupId: id,
            groupPosition: index,
          },
        });
        createdTasks += 1;
      }
    }
    return { updatedTasks, createdTasks, removedTasks, employees };
  }, "editTemplateGroup");
}

export interface GroupDeletionImpact {
  pendingTasks: number;
  pendingEmployees: number;
  completedKept: number;
}

/** Aggregated pre-deletion preview across every member task — same
 *  double-counting caveat as editTemplateGroup's `employees`. */
export function getGroupDeletionImpact(
  email: string,
  groupId: string,
): Promise<GroupDeletionImpact> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");
    let pendingTasks = 0;
    let pendingEmployees = 0;
    let completedKept = 0;
    for (const t of group.templates) {
      const impact = await getTemplateDeletionImpact(email, t.id);
      pendingTasks += impact.pendingTasks;
      pendingEmployees += impact.pendingEmployees;
      completedKept += impact.completedKept;
    }
    return { pendingTasks, pendingEmployees, completedKept };
  }, "getGroupDeletionImpact");
}

/** Deletes every member task (cascade-safe — see deleteTaskTemplate) then
 *  the group row itself. Not wrapped in a transaction across members — see
 *  editTemplateGroup's equivalent note for the accepted partial-failure
 *  trade-off. */
export function deleteTemplateGroup(
  email: string,
  groupId: string,
): Promise<{ deleted: boolean; removedTasks: number; keptRecords: number }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");
    let removedTasks = 0;
    let keptRecords = 0;
    for (const t of group.templates) {
      const result = await deleteTaskTemplate(email, t.id);
      removedTasks += result.removedTasks;
      keptRecords += result.keptRecords;
    }
    await prisma.taskTemplateGroup.delete({ where: { id } });
    return { deleted: true, removedTasks, keptRecords };
  }, "deleteTemplateGroup");
}
