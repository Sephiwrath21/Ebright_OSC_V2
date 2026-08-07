// Branch Package Schedule (2026-08-07): the Package Table page's data
// layer — a durable (branch, weekday) → Package config, backed by
// automatic recurring task assignment via the existing engine. See
// BranchPackageSchedule's schema comment for the model. Deliberately
// separate from template-groups.ts's applyTemplateGroup/listTemplateGroups
// (which are per-creator-owned, createdById-scoped) — packages are
// org-wide-visible here by design (confirmed 2026-08-07), so this file's
// own group lookups do NOT filter by createdById, and its own fan-out
// logic is a parallel, independent implementation of applyTemplateGroup's
// shape rather than a call to it — see requireEditAccess/requireViewAccess
// still gating WHO may call these functions, same as everywhere else; only
// the group VISIBILITY differs.
import { z } from "zod";
import { prisma } from "../prisma";
import { ApiHttpError } from "../lib/api-server";
import { native, requireUserByEmail } from "./core";
import { canManageTaskTemplateGroups, taskManagerNavAccess } from "../role-views";
import { cancelPendingTemplateRuns } from "./templates-internal";
import { assignFlowTaskCore } from "./tasks-internal";
import type { FlowAssignInput } from "../ui/types";

export const PACKAGE_TABLE_WEEKDAYS = ["Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type PackageTableWeekday = (typeof PACKAGE_TABLE_WEEKDAYS)[number];

const WEEKDAY_TO_PRISMA: Record<PackageTableWeekday, "WED" | "THU" | "FRI" | "SAT" | "SUN"> = {
  Wed: "WED",
  Thu: "THU",
  Fri: "FRI",
  Sat: "SAT",
  Sun: "SUN",
};
// JS Date.getDay() values, matching tasks-internal.ts's DAY_INDEX.
const WEEKDAY_TO_JS_DAY: Record<PackageTableWeekday, number> = {
  Sun: 0,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

async function requireViewAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!taskManagerNavAccess(user).packageTable) {
    throw new ApiHttpError(403, "You don't have access to view the package table");
  }
  return user;
}

async function requireEditAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!canManageTaskTemplateGroups(user)) {
    throw new ApiHttpError(403, "Only Super Admin and Operations can manage the package table");
  }
  return user;
}

export interface BranchPackageOption {
  id: string;
  name: string;
}

export interface BranchPackageScheduleCell {
  branch: string;
  weekday: PackageTableWeekday;
  packageGroupId: string | null;
  packageName: string | null;
}

export interface BranchPackageScheduleData {
  branches: string[];
  weekdays: readonly PackageTableWeekday[];
  cells: BranchPackageScheduleCell[];
  packages: BranchPackageOption[];
}

/** Full grid data: canonical branch list (distinct role=BRANCH users'
 *  `branch` field), every non-archived Package org-wide (see file
 *  header — deliberately not createdById-scoped), and the current
 *  (branch, weekday) -> package config. */
export function listBranchPackageSchedule(email: string): Promise<BranchPackageScheduleData> {
  return native(async () => {
    await requireViewAccess(email);

    const branchUsers = await prisma.user.findMany({
      where: { role: "BRANCH", branch: { not: null } },
      select: { branch: true },
      distinct: ["branch"],
      orderBy: { branch: "asc" },
    });
    const branches = branchUsers.map((u) => u.branch as string);

    const packageGroups = await prisma.taskTemplateGroup.findMany({
      where: { scope: "PACKAGE", archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const existing = await prisma.branchPackageSchedule.findMany({
      include: { packageGroup: { select: { name: true } } },
    });
    const existingByKey = new Map(existing.map((e) => [`${e.branch}:${e.weekday}`, e]));

    const cells: BranchPackageScheduleCell[] = [];
    for (const branch of branches) {
      for (const weekday of PACKAGE_TABLE_WEEKDAYS) {
        const row = existingByKey.get(`${branch}:${WEEKDAY_TO_PRISMA[weekday]}`);
        cells.push({
          branch,
          weekday,
          packageGroupId: row?.packageGroupId ?? null,
          packageName: row?.packageGroup.name ?? null,
        });
      }
    }

    return { branches, weekdays: PACKAGE_TABLE_WEEKDAYS, cells, packages: packageGroups };
  }, "listBranchPackageSchedule");
}

const setCellSchema = z.object({
  branch: z.string().trim().min(1).max(100),
  weekday: z.enum(PACKAGE_TABLE_WEEKDAYS),
  packageGroupId: z.string().min(1).nullable(),
});
export type SetBranchPackageScheduleCellInput = z.input<typeof setCellSchema>;

/** Resolve exactly one Branch Manager for `branch` — errors (never
 *  guesses) if zero or more than one exist. */
async function requireSingleBranchManager(branch: string) {
  const managers = await prisma.user.findMany({
    where: { branch, role: "BRANCH" },
    select: { id: true, name: true },
  });
  if (managers.length === 0) {
    throw new ApiHttpError(400, `No branch manager found for ${branch}`);
  }
  if (managers.length > 1) {
    throw new ApiHttpError(
      400,
      `Multiple branch managers found for ${branch} — resolve this before scheduling`,
    );
  }
  return managers[0];
}

/** Cancel the OLD package's recurring assignment for this manager, scoped
 *  to exactly this weekday (see file header + templates-internal.ts's
 *  cancelPendingTemplateRuns for why the weekday filter is required —
 *  without it this would also cancel the same manager's OTHER-weekday
 *  assignment of the same package). Loops over every member TaskTemplate
 *  of the old package group, same shape as template-groups.ts's
 *  removeGroupAssignee, but weekday-scoped. */
async function cancelWeekdayAssignment(
  actorId: string,
  packageGroupId: string,
  assigneeId: string,
  weekday: PackageTableWeekday,
) {
  const group = await prisma.taskTemplateGroup.findFirst({
    where: { id: packageGroupId, scope: "PACKAGE" },
    include: { templates: { select: { id: true } } },
  });
  if (!group) return; // old package was deleted already — nothing to cancel
  for (const t of group.templates) {
    await cancelPendingTemplateRuns(
      actorId,
      t.id,
      "branch-package-schedule-cell-changed",
      assigneeId,
      WEEKDAY_TO_JS_DAY[weekday],
    );
  }
}

/** Assign the NEW package to this manager for this weekday, via the
 *  existing recurring-assignment engine (cadence:"daily" + a single day
 *  = an auto-perpetuating weekly series, see engine/recurrence.ts).
 *  Deliberately does NOT call template-groups.ts's applyTemplateGroup —
 *  that function's group lookup is createdById-scoped (per-creator
 *  ownership), but Branch Package Schedule's packages are org-wide
 *  visible (see file header) — this is a parallel implementation of the
 *  same fan-out shape, without the ownership filter. */
async function assignWeekday(
  actor: { id: string; role: string; department: string | null },
  packageGroupId: string,
  managerId: string,
  weekday: PackageTableWeekday,
) {
  const group = await prisma.taskTemplateGroup.findFirst({
    where: { id: packageGroupId, scope: "PACKAGE" },
    include: { templates: { orderBy: { groupPosition: "asc" } } },
  });
  if (!group) throw new ApiHttpError(404, "Package not found");
  for (const t of group.templates) {
    const subtasks = Array.isArray(t.subtasks) ? (t.subtasks as string[]) : [];
    await assignFlowTaskCore(actor, {
      title: t.title,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
      userIds: [managerId],
      days: [weekday],
      cadence: "daily",
      fromTemplateId: t.id,
    } satisfies FlowAssignInput);
  }
}

/** Set (or clear, if `packageGroupId` is null) one grid cell. Resolves the
 *  branch's single Branch Manager, cancels any prior package's
 *  weekday-scoped recurring assignment for them, and — if a new package
 *  was selected — creates the new one. Upserts the durable
 *  BranchPackageSchedule config row to match. */
export function setBranchPackageScheduleCell(
  email: string,
  input: SetBranchPackageScheduleCellInput,
): Promise<{ ok: true }> {
  return native(async () => {
    const actor = await requireEditAccess(email);
    const body = setCellSchema.parse(input);
    const manager = await requireSingleBranchManager(body.branch);
    const prismaWeekday = WEEKDAY_TO_PRISMA[body.weekday];

    const existingRow = await prisma.branchPackageSchedule.findUnique({
      where: { branch_weekday: { branch: body.branch, weekday: prismaWeekday } },
    });

    if (existingRow) {
      await cancelWeekdayAssignment(actor.id, existingRow.packageGroupId, manager.id, body.weekday);
    }

    if (body.packageGroupId === null) {
      if (existingRow) {
        await prisma.branchPackageSchedule.delete({ where: { id: existingRow.id } });
      }
      return { ok: true };
    }

    await assignWeekday(actor, body.packageGroupId, manager.id, body.weekday);

    await prisma.branchPackageSchedule.upsert({
      where: { branch_weekday: { branch: body.branch, weekday: prismaWeekday } },
      create: {
        branch: body.branch,
        weekday: prismaWeekday,
        packageGroupId: body.packageGroupId,
        createdById: actor.id,
      },
      update: { packageGroupId: body.packageGroupId },
    });

    return { ok: true };
  }, "setBranchPackageScheduleCell");
}
