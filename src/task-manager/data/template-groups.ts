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
// Two-tier authorization (2026-08-07 permission matrix, revised again):
// View tier (list/view a group — requireGroupViewAccess) and Edit tier
// (create/edit/delete/assign/view-assignees/remove-assignee —
// requireGroupEditAccess) are now both driven by role-views.ts's
// taskManagerNavAccess/canManageTaskTemplateGroups, the SAME functions the
// Task Manager sidebar's visibility filter consults — so the sidebar and
// this file's server-side enforcement can never drift apart. Edit tier is
// identical across both scopes (Super Admin + elevated Operations/
// Optimisation dept-site only); View tier differs only by scope: TEMPLATE
// excludes Branch Manager, PACKAGE (and PACKAGE_TABLE) include it. This
// means a View-only role (HOD/CEO, and — Package only — Branch Manager)
// can see a group but gets a 403 (surfaced as an inline error message, not
// a page redirect, since these are action closures called after the page
// has already loaded) if they try to create/edit/delete/assign it or view/
// remove its assignees.
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
import type { Cadence, Prisma, TemplateGroupScope } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { todayStart } from "../lib/dates";
import { prisma } from "../prisma";
import { native, requireUserByEmail } from "./core";
import { canManageTaskTemplateGroups, taskManagerNavAccess } from "../role-views";
import {
  deleteTaskTemplateCore,
  editTaskTemplateCore,
  getTemplateAssigneesCore,
  getTemplateDeletionImpactCore,
  PENDING_STATUSES,
  removeTemplateAssigneeCore,
} from "./templates-internal";
import { assignFlowTaskCore } from "./tasks-internal";
import { formatLocalDate } from "../analytics/_lib";
import { FLOW_DAYS, type FlowAssignInput } from "../ui/types";

const GROUP_TASK_MAX = 20;

const NOUN: Record<TemplateGroupScope, string> = { TEMPLATE: "template", PACKAGE: "package" };
const NOT_FOUND_MESSAGE: Record<TemplateGroupScope, string> = {
  TEMPLATE: "Template not found",
  PACKAGE: "Package not found",
};

/** View access (list/view a group): the 2026-08-07 permission matrix's
 *  View tier, scope-aware via taskManagerNavAccess — TEMPLATE excludes
 *  Branch Manager, PACKAGE/PACKAGE_TABLE include it. This is the SAME
 *  function the sidebar's visibility check calls (taskManagerNavAccess)
 *  — a role hidden from the sidebar always also 403s here. */
async function requireGroupViewAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  const access = taskManagerNavAccess(user);
  const allowed = scope === "PACKAGE" ? access.package : access.template;
  if (!allowed) {
    throw new ApiHttpError(403, `You don't have access to view ${NOUN[scope]}s`);
  }
  return user;
}

/** Edit access (create/edit/delete/assign/view-assignees/remove-assignee):
 *  identical for both scopes — Super Admin + elevated dept-site only. */
async function requireGroupEditAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  if (!canManageTaskTemplateGroups(user)) {
    throw new ApiHttpError(403, `Only Super Admin and Operations can manage ${NOUN[scope]}s`);
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
    const user = await requireGroupViewAccess(email, scope);
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
    const user = await requireGroupViewAccess(email, scope);
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
    const user = await requireGroupEditAccess(email, scope);
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
  /** New-member-task fan-out (2026-08-07): how many existing group
   *  assignees (found via their OTHER still-pending member-task
   *  instances) a brand-new member task was auto-created for, replicating
   *  each one's own cadence/day — see editTemplateGroup's "new member
   *  task" branch. */
  newTaskAssignedTo: number;
  /** Existing assignees who had nothing pending left to copy a schedule
   *  from (e.g. every other member task already DONE/past-due-excluded
   *  for them) — deliberately skipped rather than defaulted to a guessed
   *  cadence/day. */
  newTaskSkipped: number;
}

// Reverse of tasks-internal.ts's DAY_INDEX (JS Date.getDay() -> FLOW_DAYS
// weekday name) — DAY_INDEX itself isn't exported from that file (only
// assignFlowTaskCore is meant to be called from here), so this is a local
// mirror, same precedent as branch-package-schedule.ts's own
// WEEKDAY_TO_JS_DAY mirror of the same map. Monday (1) is deliberately
// absent: FLOW_DAYS/DAY_INDEX have no Monday option, so a "daily"-cadence
// RunBlock (which only ever gets a dueAt via nextOccurrence(day) for a
// FLOW_DAYS day, or via weekly recurrence off of one) can never actually
// land on one.
const JS_DAY_TO_FLOW_DAY: Partial<Record<number, (typeof FLOW_DAYS)[number]>> = {
  0: "Sun",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

const CADENCE_FROM_PRISMA: Record<Cadence, "daily" | "monthly" | "adhoc"> = {
  DAILY: "daily",
  MONTHLY: "monthly",
  ADHOC: "adhoc",
};

/** For each id in `templateIds` (a group's OTHER, already-existing member
 *  tasks), find every CURRENT assignee — anyone with at least one
 *  non-cancelled/non-archived top-level RunBlock of any of those tasks —
 *  and map them to a representative still-pending, not-past-due block to
 *  replicate a schedule from (any one is fine — a person with divergent
 *  schedules across several member tasks of the same group is an accepted
 *  edge case, not reconciled here), or `null` if NONE of their instances
 *  currently qualify (e.g. every one is already DONE/SKIPPED, or is
 *  pending-status but past-due per Task 2's protection window). The
 *  eligibility test for "currently qualifies" is the SAME one
 *  editTaskTemplateCore's own pending-parent query uses (PENDING_STATUSES
 *  + not-cancelled/archived + the past-due `dueAt` exclusion via
 *  todayStart()), reused so "who still has this group's work" can never
 *  disagree between the two functions — but unlike that query, an
 *  assignee here is NOT dropped just because their representative isn't
 *  eligible; they stay in the map as a `null` entry precisely so
 *  editTemplateGroup's fan-out can count them in `newTaskSkipped` instead
 *  of silently omitting them (design decision #4: report the skip count,
 *  don't swallow it). Feeds editTemplateGroup's new-member-task fan-out. */
async function getGroupMemberSchedules(
  templateIds: string[],
): Promise<Map<string, { cadence: Cadence | null; dueAt: Date | null } | null>> {
  const map = new Map<string, { cadence: Cadence | null; dueAt: Date | null } | null>();
  if (templateIds.length === 0) return map;
  const boundary = todayStart();
  const blocks = await prisma.runBlock.findMany({
    where: {
      templateId: { in: templateIds },
      parentId: null,
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    select: { assigneeId: true, status: true, cadence: true, dueAt: true },
  });
  for (const b of blocks) {
    const eligible =
      (PENDING_STATUSES as readonly string[]).includes(b.status) &&
      (b.dueAt === null || b.dueAt >= boundary);
    if (eligible) {
      // A real representative always wins over (replaces) a prior `null`
      // placeholder from an earlier-seen, non-eligible instance of theirs.
      if (!map.get(b.assigneeId)) map.set(b.assigneeId, { cadence: b.cadence, dueAt: b.dueAt });
    } else if (!map.has(b.assigneeId)) {
      map.set(b.assigneeId, null);
    }
  }
  return map;
}

/** Derive the `{days, cadence}` or `{dueDate, cadence}` to hand
 *  assignFlowTaskCore so a new member task replicates one assignee's
 *  existing schedule (from a representative RunBlock of one of their
 *  OTHER pending member-task instances in the same group). For "daily"
 *  cadence (the only cadence recurrence actually perpetuates, see
 *  engine/recurrence.ts), the day of week is derived from `dueAt` — a
 *  "daily" block with no dueAt has nothing to derive a weekday from and
 *  returns null (caller must skip, never guess). For "monthly"/"adhoc",
 *  there's no repeating "day" concept — the representative's own `dueAt`
 *  (if any) IS the one-off date to replicate as `dueDate`; a null dueAt
 *  (an undated ad hoc instance) replicates as undated too, which is a
 *  valid, derivable schedule, not a skip. A null `cadence` (untagged
 *  legacy block — see FlowTaskRow.cadence's doc comment in ui/types.ts)
 *  has nothing to replicate and also returns null — same as a `null` rep
 *  itself (the assignee has nothing currently eligible to copy from at
 *  all, see getGroupMemberSchedules). */
function deriveFanOutSchedule(
  rep: { cadence: Cadence | null; dueAt: Date | null } | null,
): { days?: (typeof FLOW_DAYS)[number][]; dueDate?: string; cadence: "daily" | "monthly" | "adhoc" } | null {
  if (!rep || !rep.cadence) return null;
  const cadence = CADENCE_FROM_PRISMA[rep.cadence];
  if (cadence === "daily") {
    if (!rep.dueAt) return null;
    const day = JS_DAY_TO_FLOW_DAY[rep.dueAt.getDay()];
    return day ? { days: [day], cadence } : null;
  }
  if (!rep.dueAt) return { cadence };
  return { dueDate: formatLocalDate(rep.dueAt), cadence };
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
    const user = await requireGroupEditAccess(email, scope);
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

    // New-member-task fan-out (2026-08-07): the schedule map is built once
    // from the group's PRE-EDIT member tasks (`existingIds`, snapshotted
    // above before this loop touches anything) and reused for every new
    // task added in this same submission — a group edit can add more than
    // one new member task at once, and each should fan out independently
    // against the same "who already has this group's other work" snapshot,
    // not against tasks created earlier in this very loop. Only queried
    // when at least one task in the submission is actually new, to avoid
    // the extra round-trip on a plain rename/reorder/edit-only submission.
    const hasNewTask = body.tasks.some((t) => !(t.id && existingIds.has(t.id)));
    const memberSchedules = hasNewTask
      ? await getGroupMemberSchedules([...existingIds])
      : new Map<string, { cadence: Cadence | null; dueAt: Date | null } | null>();

    let updatedTasks = 0;
    let createdTasks = 0;
    let employees = 0;
    let newTaskAssignedTo = 0;
    let newTaskSkipped = 0;
    for (const [index, t] of body.tasks.entries()) {
      if (t.id && existingIds.has(t.id)) {
        const result = await editTaskTemplateCore(user, t.id, { title: t.title, subtasks: t.subtasks });
        updatedTasks += result.updatedTasks;
        employees += result.employees;
        await prisma.taskTemplate.update({ where: { id: t.id }, data: { groupPosition: index } });
      } else {
        const newTask = await prisma.taskTemplate.create({
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

        for (const [assigneeId, rep] of memberSchedules) {
          const schedule = deriveFanOutSchedule(rep);
          if (!schedule) {
            newTaskSkipped += 1;
            continue;
          }
          await assignFlowTaskCore(user, {
            title: t.title,
            subtasks: t.subtasks.length > 0 ? t.subtasks : undefined,
            userIds: [assigneeId],
            days: schedule.days,
            dueDate: schedule.dueDate,
            cadence: schedule.cadence,
            fromTemplateId: newTask.id,
          } satisfies FlowAssignInput);
          newTaskAssignedTo += 1;
        }
      }
    }
    return { updatedTasks, createdTasks, removedTasks, employees, newTaskAssignedTo, newTaskSkipped };
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
    const user = await requireGroupEditAccess(email, scope);
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
    const user = await requireGroupEditAccess(email, scope);
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
 *  assignFlowTask — that function re-runs its OWN separate actor check
 *  (ADMIN|OPS|CEO|HOD|isElevatedDeptSite) independent of this file's
 *  requireGroupEditAccess above; delegating to the Core function avoids
 *  that double-gating (an already-authorized caller getting re-checked
 *  against a second, differently-shaped allow-list) — same class of fix as
 *  the earlier templates.ts one. Not wrapped in a
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
    const user = await requireGroupEditAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const body = applyGroupSchema.parse(input);
    // Server-side backstop for the Package-assign recipient restriction:
    // the Assign modal's picker already only offers BRANCH-role staff for
    // PACKAGE scope, but requireGroupEditAccess above only gates WHO may
    // call this function (Super Admin/elevated dept-site), not WHO the
    // submitted userIds belong to — an already-authorized caller could
    // otherwise submit any staff id directly (bypassing the UI-only
    // restriction) and assignFlowTaskCore would create the assignment
    // regardless, since it has no PACKAGE-scope-aware target check of its
    // own.
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
    const user = await requireGroupEditAccess(email, scope);
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
    const user = await requireGroupEditAccess(email, scope);
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
