// Task Template Groups (2026-08-06): a named collection of several
// top-level TaskTemplate rows — grouping layer only. Each task inside a
// group is an ORDINARY TaskTemplate row (templateGroupId set, groupPosition
// for display order); all cascade-safety (pending-assignment cancellation,
// edit propagation, deletion impact) is delegated to the existing
// single-task Core logic in ./templates-internal — this module only
// orchestrates it across a group's members and adds the group wrapper
// itself. Creating/editing a group never touches recipients/days/due-date/
// cadence — "Assign" (applyTemplateGroup) is a separate action that picks
// those once and fans out to assignFlowTaskCore per member task.
//
// Scope (2026-08-06): this same data model/logic powers TWO pages —
// /task-manager/template ("Template", scope TEMPLATE) and
// /task-manager/package ("Package", scope PACKAGE). Every function below
// takes `scope` and threads it through every query/write, so the two
// pages' data can never cross. Authorization is deliberately NOT the
// shared requireAssigner in ./templates, since editing that would also
// widen the OLD single-task "+ Task -> Start from a template" hub's
// access, which nobody asked for.
//
// Two-tier authorization (2026-08-06, revised): general management
// (list/view/create/edit/delete a group — requireGroupAccess) is open to
// the same assign-capable allow-list for BOTH scopes, so any account that
// can manage templates can also manage packages. "Assign" — actually
// fanning a group out to recipients, plus View/Remove Assignees, which is
// about the same population — is gated separately via
// requireGroupAssignAccess: unrestricted for TEMPLATE (same allow-list as
// management), but PACKAGE-scope assignment stays Branch Manager only.
// This means a non-Branch-Manager can see and edit a package but gets a
// 403 (surfaced as an inline error message, not a page redirect, since
// Assign/View Assignees are action closures called after the page has
// already loaded) if they try to assign it or view/remove its assignees.
//
// Delegation target (2026-08-06 fix, two rounds): the per-member edit/
// delete/impact calls below go to ./templates-internal's Core functions
// (deleteTaskTemplateCore/editTaskTemplateCore/getTemplateDeletionImpactCore),
// NOT to ./templates's exported deleteTaskTemplate/editTaskTemplate/
// getTemplateDeletionImpact — those re-run requireAssigner internally,
// whose allow-list has zero overlap with Branch Manager. Same reasoning,
// same fix, applies to "Assign" (applyTemplateGroup): it calls
// ./tasks-internal's assignFlowTaskCore, NOT ./tasks's exported
// assignFlowTask — that function re-runs its OWN separate actor check
// (also with zero Branch Manager overlap). Both ./templates-internal and
// ./tasks-internal are intentionally NOT re-exported by data.ts's
// `export *` barrel, so this file imports them directly rather than via
// `@/task-manager/data`.
import { z } from "zod";
import type { Prisma, TemplateGroupScope } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { isElevatedDeptSite } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";
import {
  deleteTaskTemplateCore,
  editTaskTemplateCore,
  getTemplateAssigneesCore,
  getTemplateDeletionImpactCore,
  removeTemplateAssigneeCore,
} from "./templates-internal";
import { assignFlowTaskCore } from "./tasks-internal";
import { FLOW_DAYS, type FlowAssignInput } from "../ui/types";

const GROUP_TASK_MAX = 20;

const NOUN: Record<TemplateGroupScope, string> = { TEMPLATE: "template", PACKAGE: "package" };
const NOT_FOUND_MESSAGE: Record<TemplateGroupScope, string> = {
  TEMPLATE: "Template not found",
  PACKAGE: "Package not found",
};

const ASSIGN_CAPABLE_ROLES = ["ADMIN", "OPS", "CEO", "HOD", "BRANCH"] as const;

function isAssignCapable(user: { role: string; department: string | null }): boolean {
  return (
    (ASSIGN_CAPABLE_ROLES as readonly string[]).includes(user.role) || isElevatedDeptSite(user)
  );
}

/** General management (list/view/create/edit/delete a group): the same
 *  assign-capable allow-list for both scopes — Package management is not
 *  restricted to Branch Manager. Deliberately separate from
 *  ./templates's requireAssigner — see the file header for why that
 *  shared helper stays untouched. */
async function requireGroupAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  if (!isAssignCapable(user)) {
    throw new ApiHttpError(403, `Only assign-capable accounts can manage ${NOUN[scope]}s`);
  }
  return user;
}

/** Assignment access (Assign, View Assignees, Remove Assignee): unrestricted
 *  for TEMPLATE (same allow-list as management), but PACKAGE assignment
 *  stays limited to Branch Manager plus the existing elevated dept-site
 *  "superadmin-equivalent" accounts (Operations/Optimisation) — the same
 *  carve-out isAssignCapable already grants for general Package
 *  management, so an elevated dept-site account isn't blocked from
 *  assigning a package it can otherwise fully manage. Recipients are
 *  restricted separately (see applyTemplateGroup's PACKAGE target check
 *  below) — widening who may ACT here does not widen who may be picked. */
async function requireGroupAssignAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  const allowed =
    scope === "PACKAGE" ? user.role === "BRANCH" || isElevatedDeptSite(user) : isAssignCapable(user);
  if (!allowed) {
    throw new ApiHttpError(
      403,
      scope === "PACKAGE"
        ? "Only branch managers can assign packages"
        : "Only assign-capable accounts can assign task templates",
    );
  }
  return user;
}

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

/** Cards data for the /task-manager/template or /task-manager/package dashboard. */
export function listTemplateGroups(
  email: string,
  scope: TemplateGroupScope,
): Promise<TemplateGroupSummary[]> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const groups = await prisma.taskTemplateGroup.findMany({
      where: { createdById: user.id, scope, archivedAt: null },
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
export function getTemplateGroup(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
): Promise<TemplateGroupDetail> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { orderBy: { groupPosition: "asc" } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
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
  scope: TemplateGroupScope,
  input: CreateTemplateGroupInput,
): Promise<{ id: string }> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const body = createGroupSchema.parse(input);
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.taskTemplateGroup.create({
        data: { createdById: user.id, name: body.name, scope },
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
  scope: TemplateGroupScope,
  input: EditTemplateGroupInput,
): Promise<EditTemplateGroupResult> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const body = editGroupSchema.parse(input);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      select: { id: true },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);

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
        const result = await deleteTaskTemplateCore(user, memberId);
        removedTasks += result.removedTasks;
      }
    }

    let updatedTasks = 0;
    let createdTasks = 0;
    let employees = 0;
    for (const [index, t] of body.tasks.entries()) {
      if (t.id && existingIds.has(t.id)) {
        const result = await editTaskTemplateCore(user, t.id, { title: t.title, subtasks: t.subtasks });
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
  scope: TemplateGroupScope,
): Promise<GroupDeletionImpact> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
    let pendingTasks = 0;
    let pendingEmployees = 0;
    let completedKept = 0;
    for (const t of group.templates) {
      const impact = await getTemplateDeletionImpactCore(user, t.id);
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
  scope: TemplateGroupScope,
): Promise<{ deleted: boolean; removedTasks: number; keptRecords: number }> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
    let removedTasks = 0;
    let keptRecords = 0;
    for (const t of group.templates) {
      const result = await deleteTaskTemplateCore(user, t.id);
      removedTasks += result.removedTasks;
      keptRecords += result.keptRecords;
    }
    await prisma.taskTemplateGroup.delete({ where: { id } });
    return { deleted: true, removedTasks, keptRecords };
  }, "deleteTemplateGroup");
}

const applyGroupSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  days: z.array(z.enum(FLOW_DAYS)).optional(),
  dueDate: z.string().optional(),
  cadence: z.enum(["daily", "monthly", "adhoc"]),
});
export type ApplyTemplateGroupInput = z.input<typeof applyGroupSchema>;

/** "Assign" (2026-08-06): one recipient/day/due-date/cadence choice for the
 *  WHOLE group, fanned out as one assignFlowTaskCore call per member task —
 *  the same pipeline "Start from a template" already uses, just looped.
 *  fromTemplateId is set per task so each created assignment links back to
 *  its own TaskTemplate row. Delegates to ./tasks-internal's
 *  assignFlowTaskCore (2026-08-06 fix) rather than ./tasks's exported
 *  assignFlowTask — that function re-runs its OWN actor check
 *  (ADMIN|OPS|CEO|HOD|isElevatedDeptSite, no BRANCH) independent of this
 *  file's requireGroupAssignAccess above, which would 403 every
 *  Branch-Manager call regardless of scope even though
 *  requireGroupAssignAccess already authorized this exact actor for this
 *  exact operation — same double-gating class as the earlier templates.ts
 *  fix. Not wrapped in a
 *  transaction across members — if one member's assignFlowTaskCore call
 *  throws partway through, earlier iterations already created real
 *  FlowRun/RunBlock rows and the partial `created` count is lost to the
 *  caller. assignFlowTaskCore has no idempotency guard, so a naive "retry
 *  the whole group" in response to that error would RE-ASSIGN the
 *  already-succeeded member tasks too, duplicating live tasks for the same
 *  recipients. Callers (the Assign modal) should not blindly retry on
 *  failure — surface the error and let the admin verify actual state
 *  before re-attempting. */
export function applyTemplateGroup(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
  input: ApplyTemplateGroupInput,
): Promise<{ created: number }> {
  return native(async () => {
    const user = await requireGroupAssignAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const body = applyGroupSchema.parse(input);
    // Server-side backstop for the Package-assign recipient restriction:
    // the Assign modal's picker already only offers BRANCH-role staff for
    // PACKAGE scope, but requireGroupAssignAccess above only gates WHO may
    // call this function, not WHO the submitted userIds belong to — an
    // already-authorized Branch Manager caller could otherwise submit any
    // staff id directly (bypassing the UI-only restriction) and
    // assignFlowTaskCore would create the assignment regardless, since it
    // has no PACKAGE-scope-aware target check of its own.
    if (scope === "PACKAGE") {
      const targets = await prisma.user.findMany({
        where: { id: { in: body.userIds } },
        select: { role: true },
      });
      if (targets.some((t) => t.role !== "BRANCH")) {
        throw new ApiHttpError(400, "Packages can only be assigned to branch managers");
      }
    }
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { orderBy: { groupPosition: "asc" } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
    if (group.templates.length === 0) {
      throw new ApiHttpError(400, `This ${NOUN[scope]} has no tasks to assign`);
    }

    let created = 0;
    for (const t of group.templates) {
      const subtasks = Array.isArray(t.subtasks) ? (t.subtasks as string[]) : [];
      const result = await assignFlowTaskCore(user, {
        title: t.title,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
        userIds: body.userIds,
        days: body.days,
        dueDate: body.dueDate,
        cadence: body.cadence,
        fromTemplateId: t.id,
      } satisfies FlowAssignInput);
      created += result.created;
    }
    return { created };
  }, "applyTemplateGroup");
}

export interface TemplateGroupAssignee {
  userId: string;
  name: string;
  pendingTasks: number;
}

/** Everyone currently holding a pending instance of ANY task in this
 *  group, aggregated across all member tasks — a person with pending
 *  tasks from 2 different member tasks shows once, with a summed count.
 *  Feeds the "View Assignees" modal. */
export function getGroupAssignees(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
): Promise<TemplateGroupAssignee[]> {
  return native(async () => {
    const user = await requireGroupAssignAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);

    const merged = new Map<string, { name: string; pendingTasks: number }>();
    for (const t of group.templates) {
      const assignees = await getTemplateAssigneesCore(user, t.id);
      for (const a of assignees) {
        const existing = merged.get(a.userId);
        merged.set(a.userId, {
          name: a.name,
          pendingTasks: (existing?.pendingTasks ?? 0) + a.pendingTasks,
        });
      }
    }
    return [...merged.entries()]
      .map(([userId, v]) => ({ userId, name: v.name, pendingTasks: v.pendingTasks }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, "getGroupAssignees");
}

/** "Remove" for one assignee (View Assignees modal): cancels that
 *  person's pending instances across every member task in this group —
 *  completed/N-A history kept, same split cancelPendingTemplateRuns
 *  already uses. Other assignees and the group/template itself are
 *  untouched. */
export function removeGroupAssignee(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
  userId: string,
): Promise<{ removedTasks: number; keptRecords: number }> {
  return native(async () => {
    const user = await requireGroupAssignAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const targetUserId = z.string().min(1).parse(userId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);

    let removedTasks = 0;
    let keptRecords = 0;
    for (const t of group.templates) {
      const result = await removeTemplateAssigneeCore(user, t.id, targetUserId);
      removedTasks += result.removedTasks;
      keptRecords += result.keptRecords;
    }
    return { removedTasks, keptRecords };
  }, "removeGroupAssignee");
}
